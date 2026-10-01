// TODO 4.7.3: the markdown report and its thresholds.
import { describe, expect, it } from "vitest";
import { median, metrics, renderMarkdown, type EvalReport } from "./report";
import type { RunRecord } from "./runner";

function record(over: Partial<RunRecord>): RunRecord {
  return {
    task: "T1",
    group: "initial",
    kind: "initial",
    run: 1,
    model: "gpt-6.1-sol",
    passed: true,
    checks: [],
    status: "succeeded",
    error_code: null,
    repair_attempts: 0,
    turns: 4,
    input_tokens: 10_000,
    cached_tokens: 5_000,
    output_tokens: 800,
    cost_usd: 0.08,
    wall_seconds: 120,
    rejections: 0,
    ...over,
  };
}

const report = (runs: RunRecord[]): EvalReport => ({
  version: 1,
  startedAt: "2026-10-01T00:00:00.000Z",
  finishedAt: "2026-10-01T00:10:00.000Z",
  config: {
    planModel: "gpt-6.1-sol",
    editModel: "gpt-6-luna",
    tasks: "all",
    runs: 1,
    dryRun: false,
  },
  runs,
});

describe("report", () => {
  const runs = [
    record({ task: "T1", wall_seconds: 100 }),
    record({
      task: "T2",
      wall_seconds: 200,
      passed: false,
      checks: [{ name: "tsc ok", ok: false }],
    }),
    record({ task: "T3", wall_seconds: 150 }),
    record({ task: "T4", group: "edit", kind: "edit", model: "gpt-6-luna", cost_usd: 0.01 }),
    record({
      task: "T7",
      group: "edit",
      kind: "edit",
      model: "gpt-6-luna",
      cost_usd: 0.02,
      repair_attempts: 1,
    }),
    record({ task: "T9", group: "guardrail", kind: "edit", model: "gpt-6-luna", cost_usd: 0.03 }),
  ];

  it("computes each EVAL.md metric against its target", () => {
    const byName = Object.fromEntries(metrics(report(runs)).map((m) => [m.metric, m]));
    expect(byName["Pass rate T1–T3, T10"]).toMatchObject({
      value: "66.7% (2/3)",
      target: "≥ 70%",
      pass: false,
    });
    expect(byName["Pass rate T4–T8"]).toMatchObject({
      value: "100% (2/2)",
      target: "≥ 80%",
      pass: true,
    });
    expect(byName["T9 pass rate"]).toMatchObject({
      value: "100% (1/1)",
      target: "100%",
      pass: true,
    });
    expect(byName["Median wall time, initial builds"]).toMatchObject({
      value: "150.0 s",
      pass: true,
    });
    expect(byName["Mean cost per passed run"]).toMatchObject({ target: "Reported", pass: null });
    // (0.08 + 3 × 0.02) / 4 = 0.035
    expect(byName["Blended cost per build (1 initial : 3 edits)"]).toMatchObject({
      value: "$0.0350",
      target: "≤ $0.04",
      pass: true,
    });
  });

  it("marks metrics without runs as n/a instead of passing or failing", () => {
    const smoke = metrics(report([record({ task: "T1" })]));
    expect(smoke.find((m) => m.metric === "T9 pass rate")).toMatchObject({
      value: "n/a",
      pass: null,
    });
    expect(smoke.find((m) => m.metric.startsWith("Blended"))).toMatchObject({
      value: "n/a",
      pass: null,
    });
  });

  it("renders a threshold table and one row per task with failed checks", () => {
    const md = renderMarkdown(report(runs));
    expect(md).toContain("| Metric | Value | Target | Result | Maps to |");
    expect(md).toContain("| Pass rate T1–T3, T10 | 66.7% (2/3) | ≥ 70% | ❌ fail | H1 |");
    expect(md).toContain(
      "| Blended cost per build (1 initial : 3 edits) | $0.0350 | ≤ $0.04 | ✅ pass |",
    );
    expect(md).toContain("| T2 | gpt-6.1-sol | 1 | 0 | 0% | 200.0 s | $0.0800 | 0.0 | tsc ok |");
    expect(md.indexOf("| T9 |")).toBeGreaterThan(md.indexOf("| T7 |"));
    expect(md).not.toContain("Dry run");
  });

  it("median handles odd, even, and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});
