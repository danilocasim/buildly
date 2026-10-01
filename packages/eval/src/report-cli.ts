// pnpm eval:report <file.json> — prints the markdown table for a report `pnpm eval` wrote.
import { readFile } from "node:fs/promises";
import { renderMarkdown, type EvalReport } from "./report";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: pnpm eval:report <file.json>\n");
  process.exit(1);
}
const report = JSON.parse(await readFile(file, "utf8")) as EvalReport;
process.stdout.write(renderMarkdown(report));
