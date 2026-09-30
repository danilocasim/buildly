// Writes dist/api-digest.md. CI regenerates it and fails on a diff.
//
//   pnpm --filter foundation digest
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApiDigest } from "./api-digest";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "dist", "api-digest.md");
writeFileSync(out, buildApiDigest(root));
console.log(`wrote ${out}`);
