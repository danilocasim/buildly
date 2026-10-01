// Writes dist/api-digest.md (what the model sees) and dist/foundation-files.json (the
// manifest and shipped files, for code that cannot read the package directory at runtime,
// such as the web app's bundled routes). CI regenerates both and fails on a diff.
//
//   pnpm --filter foundation digest
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFoundationFiles, loadTemplateFiles, readManifest } from "../lib/index";
import { buildApiDigest } from "./api-digest";

const root = fileURLToPath(new URL("..", import.meta.url));
const digest = join(root, "dist", "api-digest.md");
writeFileSync(digest, buildApiDigest(root));
console.log(`wrote ${digest}`);

const files = join(root, "dist", "foundation-files.json");
writeFileSync(files, `${JSON.stringify(foundationFilesJson(), null, 2)}\n`);
console.log(`wrote ${files}`);

export function foundationFilesJson() {
  return {
    manifest: readManifest(),
    files: loadFoundationFiles(),
    templateFiles: loadTemplateFiles(),
  };
}
