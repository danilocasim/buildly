// Server-side validation of every model file operation (ARCHITECTURE.md §4). Rejections
// carry a distinct reason the model can act on; a missing file on read is not a rejection.
import { posix } from "node:path";
import { err, matchesAnyGlob, ok, type FoundationManifest, type Result } from "@buildly/shared";

export const MAX_FILE_BYTES = 64 * 1024;

export type RejectionReason =
  | "invalid_path"
  | "path_traversal"
  | "forbidden_file"
  | "read_only"
  | "outside_layout"
  | "too_large"
  | "import_not_allowed"
  | "invalid_arguments";

export interface Rejection {
  reason: RejectionReason;
  message: string;
}

const reject = (reason: RejectionReason, message: string) => err<Rejection>({ reason, message });

export type Layout = FoundationManifest["layout"];

/** Rejects absolute, non-normalized, or escaping paths. Returns the path unchanged. */
export function checkPath(path: string): Result<string, Rejection> {
  if (typeof path !== "string" || path.length === 0 || path.length > 200)
    return reject("invalid_path", "Give a relative file path.");
  if (path.includes("\\") || path.includes("\0"))
    return reject("invalid_path", `Use forward slashes: ${path}`);
  if (
    path.startsWith("/") ||
    path.split("/").includes("..") ||
    posix.normalize(path).startsWith("..")
  ) {
    return reject("path_traversal", `Paths must stay inside the project: ${path}`);
  }
  if (posix.normalize(path) !== path || path.startsWith("./") || path.endsWith("/")) {
    return reject(
      "invalid_path",
      `Use the plain relative path (for example "src/screens/Home.tsx"), not "${path}".`,
    );
  }
  return ok(path);
}

function isForbidden(path: string, layout: Layout): boolean {
  return layout.forbidden.includes(path);
}

/** Which operations a path allows. */
export function checkWrite(path: string, layout: Layout): Result<string, Rejection> {
  const checked = checkPath(path);
  if (!checked.ok) return checked;
  if (isForbidden(path, layout))
    return reject("forbidden_file", `${path} is managed by Buildly and cannot be written.`);
  if (matchesAnyGlob(path, layout.readOnly))
    return reject("read_only", `${path} is part of the foundation and is read-only.`);
  if (!matchesAnyGlob(path, layout.writable)) {
    return reject(
      "outside_layout",
      `Write only to: ${layout.writable.join(", ")}. ${path} is not one of them.`,
    );
  }
  return ok(path);
}

export function checkRead(path: string, layout: Layout): Result<string, Rejection> {
  const checked = checkPath(path);
  if (!checked.ok) return checked;
  if (isForbidden(path, layout))
    return reject("forbidden_file", `${path} is managed by Buildly and cannot be read.`);
  if (!matchesAnyGlob(path, [...layout.writable, ...layout.readOnly])) {
    return reject("outside_layout", `${path} is outside the project layout.`);
  }
  return ok(path);
}

export function checkSize(contents: string): Result<void, Rejection> {
  const bytes = Buffer.byteLength(contents, "utf8");
  if (bytes > MAX_FILE_BYTES) {
    return reject(
      "too_large",
      `Files are limited to 64 KB; this one is ${(bytes / 1024).toFixed(1)} KB. Split it into smaller modules.`,
    );
  }
  return ok(undefined);
}

const SPECIFIER =
  /(?:\bimport\s+(?:[^'"`;]*?\s+from\s+)?|\bexport\s+[^'"`;]*?\s+from\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)["'`]([^"'`]+)["'`]/g;

/** Every module specifier imported, re-exported, or required by `contents`. */
export function importSpecifiers(contents: string): string[] {
  return [...contents.matchAll(SPECIFIER)].map((m) => m[1]!);
}

/** "@expo/vector-icons/Ionicons" → "@expo/vector-icons"; "react-native" → "react-native". */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** Relative imports must stay in the project; package imports must be on the allowlist. */
export function checkImports(
  path: string,
  contents: string,
  allowlist: readonly string[],
): Result<void, Rejection> {
  for (const specifier of importSpecifiers(contents)) {
    if (specifier.startsWith(".")) {
      const target = posix.normalize(posix.join(posix.dirname(path), specifier));
      if (target.startsWith(".."))
        return reject(
          "path_traversal",
          `${path} imports "${specifier}", which is outside the project.`,
        );
      continue;
    }
    if (!allowlist.includes(packageName(specifier))) {
      return reject(
        "import_not_allowed",
        `"${packageName(specifier)}" is not available. Only these packages can be imported: ${allowlist.join(", ")}. Build the feature with them, or explain to the user that it is not supported.`,
      );
    }
  }
  return ok(undefined);
}
