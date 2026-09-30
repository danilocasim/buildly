// Node-side access to the starters: the manifest the web app shows, and each starter's
// project files (only paths the foundation layout lets a project own).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifest } from "@buildly/foundation";
import { matchesAnyGlob, starterManifestSchema, type StarterManifest } from "@buildly/shared";

export const startersDir = fileURLToPath(new URL("..", import.meta.url));

export type FileSet = Record<string, string>;

let manifest: StarterManifest | undefined;

/** starters.json, validated. */
export function readStarters(): StarterManifest {
  manifest ??= starterManifestSchema.parse(
    JSON.parse(readFileSync(join(startersDir, "starters.json"), "utf8")),
  );
  return manifest;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
  });
}

/** A starter's project files. Throws on an unknown slug or a file outside the writable layout. */
export function loadStarterFiles(slug: string): FileSet {
  if (!readStarters().some((s) => s.slug === slug)) throw new Error(`Unknown starter: ${slug}`);
  const root = join(startersDir, slug);
  const { writable } = readManifest().layout;
  const files: FileSet = {};
  for (const absolute of listFiles(root)) {
    const path = relative(root, absolute).split(sep).join("/");
    if (!matchesAnyGlob(path, writable))
      throw new Error(`${slug}: ${path} is outside the writable layout`);
    files[path] = readFileSync(absolute, "utf8");
  }
  return files;
}
