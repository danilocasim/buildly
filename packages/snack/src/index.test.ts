import type { SnackFiles, SnackOptions, SnackState } from "snack-sdk";
import { describe, expect, it } from "vitest";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { loadStarterFiles } from "@buildly/starters";
import { createSnackManager, type SnackLike } from "./index";

const manifest = readManifest();
const foundationFiles = loadFoundationFiles();
const journal = loadStarterFiles("journal");
const project = { id: "11111111-2222-3333-4444-555555555555", name: "Journal" };

/** Stands in for snack-sdk's Snack. */
class FakeSnack implements SnackLike {
  state: SnackState;
  logListeners: ((log: { type: string; message: string }) => void)[] = [];
  dependencyUpdates: unknown[] = [];
  resolveState = true;
  constructor(readonly options: SnackOptions) {
    this.state = {
      files: options.files ?? {},
      dependencies: {},
      missingDependencies: {},
      connectedClients: {},
      url: `exp://u.expo.dev/abc?snack-channel=${options.channel ?? "offline"}`,
      webPreviewURL: "https://player.example/v2/54/index.html",
    } as unknown as SnackState;
  }
  getState() {
    return this.state;
  }
  getStateAsync() {
    return this.resolveState ? Promise.resolve(this.state) : new Promise<SnackState>(() => {});
  }
  updateFiles(files: SnackFiles) {
    const next = { ...this.state.files } as Record<string, unknown>;
    for (const [path, file] of Object.entries(files)) {
      if (file === null) delete next[path];
      else next[path] = file;
    }
    this.state = { ...this.state, files: next as SnackFiles };
  }
  updateDependencies(dependencies: Record<string, { version: string } | null>) {
    this.dependencyUpdates.push(dependencies);
  }
  addStateListener() {
    return () => {};
  }
  addLogListener(listener: (log: { type: string; message: string }) => void) {
    this.logListeners.push(listener);
    return () => {};
  }
  setOnline() {}
}

function setup() {
  const created: FakeSnack[] = [];
  const manager = createSnackManager({
    manifest,
    foundationFiles,
    createSnack: (options) => {
      const snack = new FakeSnack(options);
      created.push(snack);
      return snack;
    },
  });
  return { manager, created };
}

const pinned = Object.fromEntries(
  Object.entries(manifest.dependencies)
    .filter(([name]) => !["react", "react-native", "expo"].includes(name))
    .map(([name, version]) => [name, { version }]),
);

describe("Snack session manager", () => {
  it("pushFiles sends the foundation and project files, an app.json, and the pinned dependencies only", () => {
    const { manager, created } = setup();
    const session = manager.ensureSession({ ...project, channel: "chan-1" });
    manager.pushFiles(session, project, journal);

    const snack = created[0]!;
    expect(snack.options).toMatchObject({
      sdkVersion: "54.0.0",
      channel: "chan-1",
      online: true,
      dependencies: pinned,
    });
    const sent = snack.state.files as Record<string, { type: string; contents: string }>;
    const expected = [
      ...Object.keys(foundationFiles).filter((p) => p !== "tsconfig.json"),
      ...Object.keys(journal),
    ];
    expect(Object.keys(sent).sort()).toEqual([...new Set(expected)].sort());
    for (const [path, contents] of Object.entries(journal))
      expect(sent[path]).toEqual({ type: "CODE", contents });
    expect(JSON.parse(sent["app.json"]!.contents)).toMatchObject({
      expo: { name: "Journal", slug: `buildly-${project.id}` },
    });
    expect(snack.dependencyUpdates).toEqual([pinned]);
    expect(Object.keys(pinned)).not.toContain("react");
    expect(JSON.stringify(sent)).not.toMatch(/OPENAI|sk-[A-Za-z0-9]/);
  });

  it("removes files that are no longer in the project on the next push", () => {
    const { manager, created } = setup();
    const session = manager.ensureSession(project);
    manager.pushFiles(session, project, journal);
    const { "src/screens/TagsScreen.tsx": _removed, ...withoutTags } = journal;
    manager.pushFiles(session, project, withoutTags);
    expect(Object.keys(created[0]!.state.files)).not.toContain("src/screens/TagsScreen.tsx");
  });

  it("reuses one session and its channel per project", () => {
    const { manager, created } = setup();
    const first = manager.ensureSession({ ...project, channel: "kept" });
    expect(manager.ensureSession({ ...project, channel: "kept" })).toBe(first);
    expect(created).toHaveLength(1);
    expect(first.channel).toBe("kept");
    const fresh = manager.ensureSession({ id: "other", name: "Other" });
    expect(fresh.channel).toMatch(/^[0-9a-f]{16}$/);
  });

  it("resolves a client's bundle error to a diagnostic with file and message", async () => {
    const { manager, created } = setup();
    const session = manager.ensureSession(project);
    created[0]!.state = {
      ...created[0]!.state,
      connectedClients: {
        phone: {
          id: "phone",
          name: "Pixel",
          platform: "android",
          transport: "snackpub",
          status: "error",
          error: Object.assign(new Error("Unexpected token (12:8)"), {
            fileName: "module://src/screens/EntriesScreen.tsx.js",
            lineNumber: 12,
            columnNumber: 8,
          }),
        },
      },
    } as unknown as SnackState;
    expect(await manager.awaitBundle(session, 1000)).toEqual({
      ok: false,
      errorCode: "bundle",
      diagnostics: [
        {
          source: "bundle",
          file: "src/screens/EntriesScreen.tsx",
          line: 12,
          col: 8,
          message: "Unexpected token (12:8)",
        },
      ],
    });
  });

  it("reports dependency failures and runtime errors from connected clients", async () => {
    const { manager, created } = setup();
    const session = manager.ensureSession(project);
    const snack = created[0]!;
    snack.state = {
      ...snack.state,
      dependencies: {
        "react-native-screens": { version: "~4.16.0", error: new Error("Failed to resolve") },
      },
    };
    snack.logListeners[0]!({
      type: "error",
      message:
        '[buildly:runtime-error] {"message":"boom","file":"src/screens/TagsScreen.tsx","line":7,"fatal":true}',
    });
    const result = await manager.awaitBundle(session, 1000);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        source: "bundle",
        message: "Dependency react-native-screens failed to resolve: Failed to resolve",
      },
      { source: "runtime", file: "src/screens/TagsScreen.tsx", line: 7, message: "boom" },
    ]);
  });

  it("returns bundle_timeout when Snack does not finish in time", async () => {
    const { manager, created } = setup();
    const session = manager.ensureSession(project);
    created[0]!.resolveState = false;
    const result = await manager.awaitBundle(session, 50);
    expect(result).toMatchObject({ ok: false, errorCode: "bundle_timeout" });
  });

  it("checkBundle validates in a throwaway offline session and gives the URLs of a live one", async () => {
    const { manager, created } = setup();
    expect(await manager.checkBundle(project, journal, 1000)).toEqual({
      ok: true,
      diagnostics: [],
    });
    expect(created[0]!.options).toMatchObject({ online: false });
    expect(Object.keys(created[0]!.options.files ?? {})).toContain("src/navigation.tsx");

    const live = manager.ensureSession({ ...project, channel: "chan-9" });
    expect(manager.getUrls(live)).toEqual({
      webPreviewURL: "https://player.example/v2/54/index.html",
      expoGoUrl: "exp://u.expo.dev/abc?snack-channel=chan-9",
    });
  });

  it("passes the self-hosted web player URL to every session (4b.0.1)", async () => {
    const created: FakeSnack[] = [];
    const webPlayerURL = "https://player.example.com/v2/%%SDK_VERSION%%";
    const manager = createSnackManager({
      manifest,
      foundationFiles,
      webPlayerURL,
      createSnack: (o) => {
        const snack = new FakeSnack(o);
        created.push(snack);
        return snack;
      },
    });
    manager.ensureSession({ id: "p1", name: "App" });
    await manager.checkBundle({ id: "p1", name: "App" }, {}, 1000);
    expect(created.map((s) => s.options.webPlayerURL)).toEqual([webPlayerURL, webPlayerURL]);
  });
});
