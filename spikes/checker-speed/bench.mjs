// SPIKES.md S4: time `tsc --noEmit` on an assembled project whose node_modules is a
// symlink to a pre-baked install, the way packages/checker will run it.
//
//   node bench.mjs [--deps <dir with node_modules>] [--runs N] [--label name]
//
// Plain JS (no build step) so it runs unchanged in a resource-limited container.
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const deps = args.deps ?? join(here, "foundation");
const runs = Number(args.runs ?? 5);
const label = args.label ?? "local";
const fixture = join(here, "fixture");
const tsc = join(deps, "node_modules", "typescript", "bin", "tsc");
const TIMEOUT_MS = 60_000;

function assemble(dir = mkdtempSync(join(tmpdir(), "check-"))) {
  cpSync(fixture, dir, { recursive: true, filter: (src) => !src.includes("node_modules") });
  symlinkSync(join(deps, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

function typecheck(dir, extra = []) {
  const start = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json", "--pretty", "false", ...extra], {
    cwd: dir,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
  });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { ms: Math.round(ms), status: result.status, timedOut: result.error?.code === "ETIMEDOUT", output: result.stdout };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const report = { label, node: process.version, runs, at: new Date().toISOString() };

// Cold: the first tsc process of this run (fresh dir, nothing cached by tsc).
const coldDir = assemble();
const cold = typecheck(coldDir);
if (cold.status !== 0) throw new Error(`clean fixture failed to typecheck:\n${cold.output}`);
report.coldMs = cold.ms;
rmSync(coldDir, { recursive: true });

// Warm: new temp dir per run, as the worker does per generation; OS file cache is warm.
const warm = [];
for (let i = 0; i < runs; i++) {
  const dir = assemble();
  warm.push(typecheck(dir).ms);
  rmSync(dir, { recursive: true });
}
report.warmMs = { median: median(warm), max: Math.max(...warm), all: warm };

// Incremental: a fixed work dir with a kept tsbuildinfo, then a one-file edit (a repair).
const workDir = mkdtempSync(join(tmpdir(), "check-incr-"));
assemble(workDir);
const incrementalFlags = ["--incremental", "--tsBuildInfoFile", join(workDir, ".tsbuildinfo")];
report.incrementalFirstMs = typecheck(workDir, incrementalFlags).ms;
const incremental = [];
for (let i = 0; i < runs; i++) {
  appendFileSync(join(workDir, "src/screens/TagsScreen.tsx"), `\nexport const edit${i} = ${i};\n`);
  incremental.push(typecheck(workDir, incrementalFlags).ms);
}
report.incrementalEditMs = { median: median(incremental), max: Math.max(...incremental), all: incremental };

// Error path: an injected type error comes back as a diagnostic with file and line.
writeFileSync(join(workDir, "src/screens/Broken.tsx"), 'export const x: number = "a";\n');
const broken = typecheck(workDir);
report.errorPath = { status: broken.status, diagnostic: broken.output.trim().split("\n")[0] };
rmSync(workDir, { recursive: true });

console.log(JSON.stringify(report, null, 2));
