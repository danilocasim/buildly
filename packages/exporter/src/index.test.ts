import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { scanDirectory } from "@buildly/scripts/check-no-secrets";
import { loadStarterFiles } from "@buildly/starters";
import {
  ATTRIBUTION_LINE,
  buildExportEntries,
  buildExportZip,
  EXPORT_DEV_DEPENDENCIES,
  ExportBlockedError,
  readExportZip,
  slugify,
  type ExportInput,
} from "./index";

const foundationFiles = loadFoundationFiles();
const manifest = readManifest();
const readmeTemplate = readFileSync(
  new URL("../../foundation/export/README.md", import.meta.url),
  "utf8",
);
const journal = loadStarterFiles("journal");
const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  appName: "My Journal",
  plan: "free",
  projectFiles: journal,
  foundationFiles,
  manifest,
  readmeTemplate,
  ...over,
});

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("export entries (6.3.1)", () => {
  it("match the expected set: foundation + project files plus the generated ones", () => {
    const entries = buildExportEntries(input());
    const expected = [
      ...Object.keys(foundationFiles),
      ...Object.keys(journal),
      "package.json",
      "index.ts",
      "README.md",
      ".gitignore",
    ];
    expect(Object.keys(entries).sort()).toEqual([...new Set(expected)].sort());
    expect(entries["src/screens/EntriesScreen.tsx"]).toBe(journal["src/screens/EntriesScreen.tsx"]);
    expect(entries["src/data/store.ts"]).toBe(foundationFiles["src/data/store.ts"]);
  });

  it("writes app.json with the project's name and slug, and package.json with the pinned allowlist", () => {
    const entries = buildExportEntries(input());
    expect(JSON.parse(entries["app.json"]!)).toMatchObject({
      expo: { name: "My Journal", slug: "my-journal", extra: { showAttribution: true } },
    });
    const pkg = JSON.parse(entries["package.json"]!) as {
      name: string;
      main: string;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("my-journal");
    expect(pkg.main).toBe("index.ts");
    expect(pkg.dependencies).toEqual(manifest.dependencies);
    expect(pkg.devDependencies).toEqual(EXPORT_DEV_DEPENDENCIES);
    expect(entries["index.ts"]).toContain("registerRootComponent(App)");
  });

  it("Free plan README says Made with Buildly; Pro does not, and Pro hides the attribution", () => {
    const free = buildExportEntries(input({ plan: "free" }));
    const pro = buildExportEntries(input({ plan: "pro" }));
    expect(free["README.md"]).toContain(ATTRIBUTION_LINE);
    expect(free["README.md"]).toContain("# My Journal");
    expect(free["README.md"]).toContain("SDK 54");
    expect(free["README.md"]).not.toContain("{{");
    expect(pro["README.md"]).not.toContain("Made with Buildly");
    expect(JSON.parse(pro["app.json"]!)).toMatchObject({
      expo: { extra: { showAttribution: false } },
    });
  });

  it("zips and unzips to the same entries", () => {
    const { entries, zip } = buildExportZip(input());
    expect(zip.byteLength).toBeGreaterThan(1000);
    expect(readExportZip(zip)).toEqual(entries);
  });

  it("pins the dev dependencies to the foundation's catalog versions", () => {
    const workspace = readFileSync(
      new URL("../../../pnpm-workspace.yaml", import.meta.url),
      "utf8",
    );
    for (const [name, version] of Object.entries(EXPORT_DEV_DEPENDENCIES)) {
      expect(workspace).toMatch(
        new RegExp(`^\\s+"?${name.replace("/", "\\/")}"?: ${version.replace(".", "\\.")}$`, "m"),
      );
    }
  });

  it("slugify", () => {
    expect(slugify("My Journal!")).toBe("my-journal");
    expect(slugify("  ")).toBe("my-app");
    expect(slugify("Café Notes")).toBe("cafe-notes");
  });
});

describe("secret guard on exports (6.3.3)", () => {
  it("an unzipped export passes the guard", async () => {
    const { zip } = buildExportZip(input());
    const dir = mkdtempSync(join(tmpdir(), "export-"));
    dirs.push(dir);
    for (const [path, contents] of Object.entries(readExportZip(zip))) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), contents);
    }
    expect(await scanDirectory(dir)).toEqual([]);
  });

  it("a project file containing a key blocks the export, naming the file but not the key", () => {
    const leaked = {
      ...journal,
      "src/data/seed.ts": `${journal["src/data/seed.ts"]}\nconst key = "sk-abc123";\n`,
    };
    let error: unknown;
    try {
      buildExportZip(input({ projectFiles: leaked }));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ExportBlockedError);
    const blocked = error as ExportBlockedError;
    expect(blocked.findings).toEqual([
      { file: "src/data/seed.ts", line: expect.any(Number), rule: "openai-key-prefix" },
    ]);
    expect(blocked.message).not.toContain("sk-abc123");
  });
});
