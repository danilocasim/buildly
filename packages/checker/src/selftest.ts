// Type-checks the journal starter on the foundation twice (cold, then warm) with the
// pre-baked node_modules and fails if the check fails or the warm run takes 15 s or more
// (SPIKES.md S4, TODO 2.5.3).
//
//   pnpm checker:selftest
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFoundationFiles } from "@buildly/foundation";
import { loadStarterFiles } from "@buildly/starters";
import { assembleProject, defaultNodeModules, runTypecheck } from "./index";

const WARM_LIMIT_MS = 15_000;

async function check() {
  const dir = mkdtempSync(join(tmpdir(), "checker-selftest-"));
  try {
    return await runTypecheck(
      assembleProject(loadFoundationFiles(), loadStarterFiles("journal"), dir),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const cold = await check();
const warm = await check();
const report = {
  nodeModules: defaultNodeModules(),
  coldMs: cold.durationMs,
  warmMs: warm.durationMs,
  ok: cold.ok && warm.ok,
  diagnostics: warm.diagnostics.length,
};
console.log(JSON.stringify(report));
if (!report.ok || warm.durationMs >= WARM_LIMIT_MS) process.exit(1);
