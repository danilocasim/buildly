// Node-side access to the foundation for the checker, Snack sessions, and the exporter.
// Never shipped: generated apps contain App.tsx, app.json, tsconfig.json, and src/.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { foundationManifestSchema, matchesAnyGlob, type FoundationManifest } from "@buildly/shared";

/** Absolute path of packages/foundation. */
export const foundationDir = fileURLToPath(new URL("..", import.meta.url));

/** A project's files: POSIX path relative to the app root → UTF-8 contents. */
export type FileSet = Record<string, string>;

let manifest: FoundationManifest | undefined;

/** foundation.json, validated. */
export function readManifest(): FoundationManifest {
  manifest ??= foundationManifestSchema.parse(
    JSON.parse(readFileSync(join(foundationDir, "foundation.json"), "utf8")),
  );
  return manifest;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
  });
}

function readMatching(globs: readonly string[]): FileSet {
  const files: FileSet = {};
  for (const root of ["App.tsx", "app.json", "tsconfig.json"]
    .map((f) => join(foundationDir, f))
    .concat(listFiles(join(foundationDir, "src")))) {
    const path = relative(foundationDir, root).split(sep).join("/");
    if (matchesAnyGlob(path, globs)) files[path] = readFileSync(root, "utf8");
  }
  return files;
}

/** Read-only files every app ships with (`layout.foundationFiles`). */
export function loadFoundationFiles(): FileSet {
  return readMatching(readManifest().layout.foundationFiles);
}

/** Project files of the bare template, where a free-form prompt starts (`layout.templateFiles`). */
export function loadTemplateFiles(): FileSet {
  return readMatching(readManifest().layout.templateFiles);
}

/** dist/api-digest.md: the foundation API as the model sees it (TODO 2.3.2). */
export function readApiDigest(): string {
  return readFileSync(join(foundationDir, "dist", "api-digest.md"), "utf8");
}
