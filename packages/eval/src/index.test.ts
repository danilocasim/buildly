// TODO 4.7.1: the harness end to end with the dry-run provider, plus the smoke-test
// runner against the real starter Jest config.
import { describe, expect, it } from "vitest";
import { loadFoundationFiles } from "@buildly/foundation";
import type { CheckOutcome } from "@buildly/generator";
import { loadStarterFiles } from "@buildly/starters";
import { defaultOutPath, parseOptions, runEval } from "./cli";
import { dryRunProvider } from "./dry-run";
import type { EvalPorts } from "./runner";
import { runSmokeTests } from "./smoke";
import type { EvalTask } from "./tasks";

const models = { plan: "gpt-6.1-sol", edit: "gpt-6-luna" };
const ok: CheckOutcome = { ok: true, diagnostics: [] };

describe("runEval", () => {
  it("runs the smoke tasks through the generation loop and reports T1, T4, T7 rows", async () => {
    // Type check: the injected T7 error fails until the file is restored.
    const typecheck = (files: Record<string, string>) =>
      Promise.resolve<CheckOutcome>(
        Object.values(files).some((s) => s.includes("entriesTitle: number"))
          ? { ok: false, diagnostics: [{ source: "typecheck", message: "TS2322" }] }
          : ok,
      );
    const ports = (task: EvalTask): EvalPorts => ({
      provider: dryRunProvider(task),
      models,
      typecheck,
      bundle: () => Promise.resolve(ok),
      smoke: () => Promise.resolve({ ok: true, passed: 2, failed: 0 }),
    });
    const seen: string[] = [];
    const report = await runEval({ tasks: "smoke", runs: 1, models, dryRun: true }, ports, (r) =>
      seen.push(r.task),
    );

    expect(seen).toEqual(["T1", "T4", "T7"]);
    expect(report.config).toMatchObject({
      tasks: "smoke",
      runs: 1,
      dryRun: true,
      planModel: "gpt-6.1-sol",
    });
    const [t1, t4, t7] = report.runs;
    expect(t1).toMatchObject({
      task: "T1",
      model: "gpt-6.1-sol",
      passed: true,
      status: "succeeded",
    });
    expect(t1!.cost_usd).toBeGreaterThan(0);
    expect(t4).toMatchObject({ task: "T4", model: "gpt-6-luna", passed: false });
    expect(t4!.checks.filter((c) => !c.ok).map((c) => c.name)).toEqual(["new tab registered"]);
    expect(t7).toMatchObject({ task: "T7", passed: true, repair_attempts: 0 });
    for (const run of report.runs) {
      expect(Object.keys(run)).toEqual(
        expect.arrayContaining([
          "turns",
          "input_tokens",
          "cached_tokens",
          "output_tokens",
          "cost_usd",
          "wall_seconds",
          "rejections",
        ]),
      );
    }
  });
});

describe("options", () => {
  it("parses models, tasks, runs, and dry-run; --model sets both", () => {
    expect(parseOptions(["--model", "gpt-6-luna", "--tasks", "all", "--runs", "3"])).toMatchObject({
      models: { plan: "gpt-6-luna", edit: "gpt-6-luna" },
      tasks: "all",
      runs: 3,
      dryRun: false,
    });
    const options = parseOptions([
      "--plan-model",
      "gpt-6.1-sol",
      "--edit-model",
      "gpt-6-luna",
      "--dry-run",
    ]);
    expect(defaultOutPath(options, new Date("2026-10-01T12:00:00Z"))).toBe(
      ".eval/2026-10-01-gpt-6.1-sol+gpt-6-luna-dry-run.json",
    );
  });

  it("rejects unrated models and bad run counts", () => {
    expect(() => parseOptions(["--model", "gpt-unknown"])).toThrow(/no rate/);
    expect(() => parseOptions(["--model", "gpt-6-luna", "--runs", "0"])).toThrow(/--runs/);
  });
});

describe("runSmokeTests", () => {
  it(
    "runs a starter's committed smoke test against given files: passes as committed, fails when broken",
    { timeout: 180_000 },
    async () => {
      const journal = loadStarterFiles("journal");
      expect(await runSmokeTests("journal", journal)).toMatchObject({ ok: true, failed: 0 });
      expect(loadFoundationFiles()["App.tsx"]).toBeDefined();

      const broken = {
        ...journal,
        "src/data/seed.ts": "export async function seed(): Promise<void> {}\n",
      };
      const result = await runSmokeTests("journal", broken);
      expect(result.ok).toBe(false);
      expect(result.failed).toBeGreaterThan(0);
    },
  );
});
