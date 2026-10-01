// Runs a starter's committed smoke test (packages/starters/test/<slug>.test.tsx) against a
// run's files, through the starters' own Jest config (SMOKE_ROOT). The scratch directory
// sits inside packages/starters so the files resolve its node_modules.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { startersDir } from "@buildly/starters";
import type { FileSet } from "@buildly/generator";
import type { SmokeResult } from "./checks";
import type { StarterSlug } from "./tasks";

const foundationDir = join(startersDir, "..", "foundation");

export async function runSmokeTests(
  slug: StarterSlug,
  files: FileSet,
  options: { rewriteTest?: (source: string) => string; timeoutMs?: number } = {},
): Promise<SmokeResult> {
  const root = join(startersDir, ".eval", randomBytes(6).toString("hex"));
  try {
    for (const [path, contents] of Object.entries(files)) {
      const target = join(root, slug, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
    // The committed test imports "../../foundation/App" relative to packages/starters/test.
    let test = await readFile(join(startersDir, "test", `${slug}.test.tsx`), "utf8");
    test = test.replaceAll('"../../foundation/', `"${foundationDir}/`);
    if (options.rewriteTest) test = options.rewriteTest(test);
    await mkdir(join(root, "test"), { recursive: true });
    await writeFile(join(root, "test", `${slug}.test.tsx`), test);

    const report = join(root, "report.json");
    const exit = await jest(
      ["--selectProjects", slug, "--json", `--outputFile=${report}`],
      {
        SMOKE_ROOT: root,
      },
      options.timeoutMs ?? 180_000,
    );
    const parsed = await readFile(report, "utf8")
      .then((text) => JSON.parse(text) as JestReport)
      .catch(() => undefined);
    if (!parsed) return { ok: false, passed: 0, failed: 0, detail: exit.output.slice(-1500) };
    const failures = parsed.testResults
      .flatMap((r) => r.assertionResults)
      .filter((a) => a.status === "failed")
      .map((a) => a.title);
    return {
      ok: parsed.success && parsed.numTotalTests > 0,
      passed: parsed.numPassedTests,
      failed: parsed.numFailedTests,
      ...(parsed.success
        ? {}
        : {
            detail: failures.length
              ? `failed: ${failures.join("; ")}`
              : (parsed.testResults.find((r) => r.message)?.message ?? "").slice(0, 1500),
          }),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

interface JestReport {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: { message: string; assertionResults: { title: string; status: string }[] }[];
}

function jest(
  args: string[],
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ code: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn(join(startersDir, "node_modules", ".bin", "jest"), args, {
      cwd: startersDir,
      // The test executes model-written code: give it no secrets (OPENAI_API_KEY, AWS).
      env: { ...pick(process.env, ["PATH", "HOME", "TMPDIR"]), ...env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, output });
    });
  });
}

function pick(env: NodeJS.ProcessEnv, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap((k) => (env[k] === undefined ? [] : [[k, env[k]]])));
}
