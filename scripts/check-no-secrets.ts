// Secret-leak guard. Scans a directory (a client bundle, an unzipped export) for the
// OpenAI key prefix and for the name of any server env variable, and exits 1 on a hit.
//
//   pnpm check:secrets <dir> [<dir> ...]
//
// Findings report the file, line, and rule, never the matched text, so CI logs do not
// repeat a leaked key.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { ENV_NAMES } from "@buildly/shared/config";

export interface Finding {
  file: string;
  line: number;
  rule: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
}

// "sk-" covers every OpenAI key format, including project keys ("sk-proj-").
const OPENAI_KEY: Rule = { name: "openai-key-prefix", pattern: /\bsk-[A-Za-z0-9_-]{3,}/ };

const RULES: Rule[] = [
  OPENAI_KEY,
  ...ENV_NAMES.map((name) => ({ name: `env-name:${name}`, pattern: new RegExp(`\\b${name}\\b`) })),
];

const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

/** Returns every rule hit in an in-memory file set (path → contents), e.g. an export. */
export function scanFiles(files: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const [file, contents] of Object.entries(files)) {
    contents.split("\n").forEach((text, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(text)) findings.push({ file, line: index + 1, rule: rule.name });
      }
    });
  }
  return findings;
}

/** Returns every rule hit under `root`. Symlinks are not followed. */
export async function scanDirectory(root: string): Promise<Finding[]> {
  const files: Record<string, string> = {};
  for await (const file of walk(root)) files[relative(root, file)] = await readFile(file, "utf8");
  return scanFiles(files);
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function main(dirs: string[]): Promise<number> {
  if (dirs.length === 0) {
    console.error("usage: check-no-secrets <dir> [<dir> ...]");
    return 2;
  }
  let total = 0;
  for (const dir of dirs) {
    if (!(await stat(dir).catch(() => null))?.isDirectory()) {
      console.error(`check-no-secrets: not a directory: ${dir}`);
      return 2;
    }
    const findings = await scanDirectory(dir);
    for (const f of findings) console.error(`${join(dir, f.file)}:${f.line}  ${f.rule}`);
    total += findings.length;
  }
  if (total > 0) {
    console.error(`check-no-secrets: ${total} finding(s)`);
    return 1;
  }
  console.log(`check-no-secrets: clean (${dirs.join(", ")})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
