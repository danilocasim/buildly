// Writes a starter's export ZIP, for the CI smoke (TODO 6.3.4) and manual checks.
//
//   pnpm --filter @buildly/exporter export-starter journal /tmp/journal.zip [free|pro]
import { readFileSync, writeFileSync } from "node:fs";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { loadStarterFiles, readStarters } from "@buildly/starters";
import { buildExportZip } from "../src/index";

const [slug, out, plan = "free"] = process.argv.slice(2);
if (!slug || !out || (plan !== "free" && plan !== "pro")) {
  console.error("usage: export-starter <slug> <out.zip> [free|pro]");
  process.exit(2);
}
const starter = readStarters().find((s) => s.slug === slug);
if (!starter) throw new Error(`Unknown starter: ${slug}`);
const { zip, entries } = buildExportZip({
  appName: starter.name,
  plan,
  projectFiles: loadStarterFiles(slug),
  foundationFiles: loadFoundationFiles(),
  manifest: readManifest(),
  readmeTemplate: readFileSync(
    new URL("../../foundation/export/README.md", import.meta.url),
    "utf8",
  ),
});
writeFileSync(out, zip);
console.log(`wrote ${out}: ${Object.keys(entries).length} files, ${zip.byteLength} bytes`);
