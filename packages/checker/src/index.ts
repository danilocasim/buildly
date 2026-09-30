// Assembles foundation + project files into a temp dir and type-checks them with the
// pre-baked foundation node_modules. Never runs npm scripts or project code: only
// `node <typescript>/bin/tsc` (ARCHITECTURE.md §8).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTscOutput, type Diagnostic } from "@buildly/shared";

export type FileSet = Record<string, string>;

/**
 * The pre-baked node_modules to symlink into each check. The worker image sets
 * CHECKER_NODE_MODULES (TODO 2.5.3); locally it is the foundation package's install.
 */
export function defaultNodeModules(): string {
  return (
    process.env.CHECKER_NODE_MODULES ??
    fileURLToPath(new URL("../../foundation/node_modules", import.meta.url))
  );
}

function assertSafePath(path: string): void {
  if (path.startsWith("/") || path.split("/").includes("..") || path.includes("\\")) {
    throw new Error(`Unsafe project path: ${path}`);
  }
}

/**
 * Writes the foundation files, then the project files, into `tmpDir` and symlinks
 * node_modules. A project file may not replace a foundation file.
 */
export function assembleProject(
  foundationFiles: FileSet,
  projectFiles: FileSet,
  tmpDir: string,
  options: { nodeModules?: string } = {},
): string {
  for (const path of Object.keys(projectFiles)) {
    assertSafePath(path);
    if (path in foundationFiles)
      throw new Error(`Project file overrides a foundation file: ${path}`);
  }
  for (const [path, contents] of Object.entries({ ...foundationFiles, ...projectFiles })) {
    assertSafePath(path);
    const target = join(tmpDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  const nodeModules = resolve(options.nodeModules ?? defaultNodeModules());
  if (!existsSync(join(nodeModules, "typescript", "bin", "tsc"))) {
    throw new Error(`No TypeScript in the pre-baked node_modules: ${nodeModules}`);
  }
  symlinkSync(nodeModules, join(tmpDir, "node_modules"), "dir");
  return tmpDir;
}

export type TypecheckResult =
  | { ok: true; diagnostics: []; durationMs: number }
  | {
      ok: false;
      errorCode: "typecheck" | "timeout" | "crash";
      diagnostics: Diagnostic[];
      durationMs: number;
      detail?: string;
    };

export const DEFAULT_TIMEOUT_MS = 60_000;

/** Runs `tsc --noEmit -p tsconfig.json` in an assembled project. */
export function runTypecheck(
  tmpDir: string,
  options: { timeoutMs?: number } = {},
): Promise<TypecheckResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tsc = join(tmpDir, "node_modules", "typescript", "bin", "tsc");
  const started = Date.now();
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [tsc, "--noEmit", "-p", "tsconfig.json", "--pretty", "false"],
      {
        cwd: tmpDir,
        env: { PATH: process.env.PATH ?? "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      if (timedOut) return done({ ok: false, errorCode: "timeout", diagnostics: [], durationMs });
      if (code === 0) return done({ ok: true, diagnostics: [], durationMs });
      const diagnostics = parseTscOutput(stdout);
      if (diagnostics.length === 0) {
        return done({
          ok: false,
          errorCode: "crash",
          diagnostics,
          durationMs,
          detail: (stderr || stdout).slice(0, 2000),
        });
      }
      done({ ok: false, errorCode: "typecheck", diagnostics, durationMs });
    });
  });
}
