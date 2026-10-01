// Writes dist/starters-files.json: the manifest plus every starter's project files, for code
// that cannot read this package's directory at runtime (the web app's bundled routes, as
// with packages/foundation/dist/foundation-files.json). CI regenerates it and fails on a diff.
//
//   pnpm --filter starters dist
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStarterFiles, readStarters } from "../lib/index";

const root = fileURLToPath(new URL("..", import.meta.url));
const starters = readStarters();
const out = join(root, "dist", "starters-files.json");
writeFileSync(
  out,
  `${JSON.stringify(
    {
      starters,
      files: Object.fromEntries(starters.map((s) => [s.slug, loadStarterFiles(s.slug)])),
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote ${out}`);
