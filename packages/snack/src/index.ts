// Snack sessions for previews (ARCHITECTURE.md §6). One online session per project,
// reusing the stored channel so its Expo Go URL survives worker restarts. Sessions
// receive exactly the foundation files, the project files, and an app.json with the
// project's name and a unique slug, plus the pinned dependencies; never secrets.
//
// Snack transforms app code on the viewing client (Expo Go or the web player), so the
// worker's bundle check validates what is knowable server-side: the files upload and
// every dependency resolves through Snackager; if a client is connected, its compile
// and runtime errors are reported too. Type and syntax errors are tsc's job (checker).
import { randomBytes } from "node:crypto";
import { createRuntimeUrl, SNACK_RUNTIME_URL_ENDPOINT } from "snack-content";
import {
  Snack,
  type SDKVersion,
  type SnackFiles,
  type SnackOptions,
  type SnackState,
} from "snack-sdk";
import {
  fromRuntimeLog,
  fromSnackError,
  type Diagnostic,
  type FoundationManifest,
} from "@buildly/shared";

export type FileSet = Record<string, string>;

export interface SnackProject {
  id: string;
  name: string;
  /** projects.snack_session_id: the Snack channel, stable per project. */
  channel?: string | null;
}

/** The subset of snack-sdk's Snack the manager uses (tests pass a fake). */
export interface SnackLike {
  getState(): SnackState;
  getStateAsync(): Promise<SnackState>;
  updateFiles(files: SnackFiles): void;
  updateDependencies(dependencies: Record<string, { version: string } | null>): void;
  addStateListener(listener: (state: SnackState, prev: SnackState) => void): () => void;
  addLogListener(listener: (log: { type: string; message: string }) => void): () => void;
  setOnline(enabled: boolean): void;
}

export type SnackFactory = (options: SnackOptions) => SnackLike;

export interface SnackSession {
  projectId: string;
  channel: string;
  snack: SnackLike;
  /** Runtime-error log lines from connected clients since the last push. */
  runtimeErrors: Diagnostic[];
}

export interface BundleResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  errorCode?: "bundle_timeout" | "bundle";
}

/** The runtime provides these; Snack must not be asked to install them. */
const RUNTIME_PROVIDED = ["react", "react-native", "expo"];

export function snackDependencies(
  manifest: FoundationManifest,
): Record<string, { version: string }> {
  return Object.fromEntries(
    Object.entries(manifest.dependencies)
      .filter(([name]) => !RUNTIME_PROVIDED.includes(name))
      .map(([name, version]) => [name, { version }]),
  );
}

/** app.json with the project's name and a unique slug (the store scopes storage by slug). */
export function appJsonFor(
  foundationAppJson: string,
  project: Pick<SnackProject, "id" | "name">,
): string {
  const app = JSON.parse(foundationAppJson) as { expo: Record<string, unknown> };
  return `${JSON.stringify({ expo: { ...app.expo, name: project.name, slug: `buildly-${project.id}` } }, null, 2)}\n`;
}

/**
 * The exact file set a Snack session receives: the foundation files (minus tsconfig.json,
 * editor-only) plus the project files, with app.json carrying the project's name and
 * unique slug. Used by the worker's sessions and by the web preview (which feeds the same
 * files to its own snack-sdk instance in the browser).
 */
export function assembleSnackFiles(
  foundationFiles: FileSet,
  project: Pick<SnackProject, "id" | "name">,
  projectFiles: FileSet,
): FileSet {
  const all: FileSet = { ...foundationFiles, ...projectFiles };
  all["app.json"] = appJsonFor(foundationFiles["app.json"] ?? '{"expo":{}}', project);
  delete all["tsconfig.json"];
  return all;
}

/**
 * The Expo Go URL of a session on `channel`, as snack-sdk computes it for its own state,
 * so the web app can show the QR of the worker's session from the stored channel.
 */
export function expoGoUrlFor(channel: string, sdkVersion: string): string {
  return createRuntimeUrl({ endpoint: SNACK_RUNTIME_URL_ENDPOINT, channel, sdkVersion });
}

export interface SnackManagerOptions {
  manifest: FoundationManifest;
  foundationFiles: FileSet;
  /** Buildly's self-hosted web player (D18), e.g. https://<host>/v2/%%SDK_VERSION%%. */
  webPlayerURL?: string;
  createSnack?: SnackFactory;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSnackManager(options: SnackManagerOptions) {
  const createSnack: SnackFactory = options.createSnack ?? ((o) => new Snack(o));
  const sdkVersion = options.manifest.sdkVersion as SDKVersion;
  const dependencies = snackDependencies(options.manifest);
  const sessions = new Map<string, SnackSession>();

  /** Foundation + project files + app.json, as Snack code files. */
  function filesFor(project: Pick<SnackProject, "id" | "name">, projectFiles: FileSet): SnackFiles {
    return Object.fromEntries(
      Object.entries(assembleSnackFiles(options.foundationFiles, project, projectFiles)).map(
        ([path, contents]) => [path, { type: "CODE" as const, contents }],
      ),
    );
  }

  return {
    /** The project's online session, created on first use with its stored channel. */
    ensureSession(project: SnackProject): SnackSession {
      const existing = sessions.get(project.id);
      if (existing) return existing;
      const channel = project.channel ?? randomBytes(8).toString("hex");
      const snack = createSnack({
        sdkVersion,
        name: project.name,
        channel,
        online: true,
        dependencies,
        webPlayerURL: options.webPlayerURL,
      });
      const session: SnackSession = { projectId: project.id, channel, snack, runtimeErrors: [] };
      snack.addLogListener((log) => {
        const runtime = fromRuntimeLog(log.message);
        if (runtime) session.runtimeErrors.push(runtime);
      });
      sessions.set(project.id, session);
      return session;
    },

    /** Replaces the session's files with foundation + project files; removes stale ones. */
    pushFiles(
      session: SnackSession,
      project: Pick<SnackProject, "id" | "name">,
      projectFiles: FileSet,
    ): void {
      const next = filesFor(project, projectFiles);
      const removed = Object.keys(session.snack.getState().files).filter((path) => !(path in next));
      session.runtimeErrors = [];
      session.snack.updateFiles({
        ...next,
        ...Object.fromEntries(removed.map((path) => [path, null])),
      } as SnackFiles);
      session.snack.updateDependencies(dependencies);
    },

    /**
     * Waits for the upload and dependency resolution, then (if clients are connected)
     * for them to settle; returns their bundle and runtime errors as diagnostics.
     */
    async awaitBundle(session: SnackSession, timeoutMs: number): Promise<BundleResult> {
      const deadline = Date.now() + timeoutMs;
      const timedOut = Symbol("timeout");
      const state = await Promise.race([
        session.snack.getStateAsync(),
        sleep(timeoutMs).then(() => timedOut),
      ]);
      if (state === timedOut) {
        return {
          ok: false,
          errorCode: "bundle_timeout",
          diagnostics: [
            { source: "bundle", message: `Snack did not finish within ${timeoutMs / 1000} s.` },
          ],
        };
      }
      // Clients that are reloading after the push get until the deadline to report.
      while (
        Date.now() < deadline &&
        Object.values(session.snack.getState().connectedClients).some(
          (c) => c.status === "reloading",
        )
      ) {
        await sleep(200);
      }
      const diagnostics = diagnosticsFrom(session.snack.getState(), session.runtimeErrors);
      return diagnostics.length
        ? { ok: false, errorCode: "bundle", diagnostics }
        : { ok: true, diagnostics: [] };
    },

    /** Web player and Expo Go URLs for the workspace. */
    getUrls(session: SnackSession): { webPreviewURL?: string; expoGoUrl: string } {
      const state = session.snack.getState();
      return { webPreviewURL: state.webPreviewURL, expoGoUrl: state.url };
    },

    /**
     * Validates files in a throwaway offline session, so a failing build never replaces
     * what the project's live preview shows. Used by the generation's bundle step.
     */
    async checkBundle(
      project: Pick<SnackProject, "id" | "name">,
      projectFiles: FileSet,
      timeoutMs: number,
    ): Promise<BundleResult> {
      const snack = createSnack({
        sdkVersion,
        name: project.name,
        online: false,
        dependencies,
        webPlayerURL: options.webPlayerURL,
        files: filesFor(project, projectFiles),
      });
      return this.awaitBundle(
        { projectId: project.id, channel: "", snack, runtimeErrors: [] },
        timeoutMs,
      );
    },

    close(projectId: string): void {
      sessions.get(projectId)?.snack.setOnline(false);
      sessions.delete(projectId);
    },
  };
}

export type SnackManager = ReturnType<typeof createSnackManager>;

/** Dependency failures, missing peers, and connected clients' errors as diagnostics. */
export function diagnosticsFrom(state: SnackState, runtimeErrors: Diagnostic[] = []): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [name, dependency] of Object.entries(state.dependencies)) {
    if (dependency.error)
      diagnostics.push({
        source: "bundle",
        message: `Dependency ${name} failed to resolve: ${dependency.error.message}`,
      });
  }
  for (const [name, missing] of Object.entries(state.missingDependencies)) {
    diagnostics.push({
      source: "bundle",
      message: `Missing dependency ${name}${missing.wantedVersion ? `@${missing.wantedVersion}` : ""}, needed by ${missing.dependents.join(", ")}`,
    });
  }
  for (const client of Object.values(state.connectedClients)) {
    if (client.status === "error" && client.error) {
      diagnostics.push(
        fromSnackError({
          message: client.error.message,
          fileName: client.error.fileName,
          lineNumber: client.error.lineNumber,
          columnNumber: client.error.columnNumber,
        }),
      );
    }
  }
  return [...diagnostics, ...runtimeErrors];
}
