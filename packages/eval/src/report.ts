// The JSON report a run writes, and the markdown table `pnpm eval:report` prints, with
// the thresholds of EVAL.md "Report and thresholds".
import type { RunRecord } from "./runner";

export interface EvalReport {
  version: 1;
  startedAt: string;
  finishedAt: string;
  config: {
    planModel: string;
    editModel: string;
    tasks: string;
    runs: number;
    dryRun: boolean;
  };
  runs: RunRecord[];
}

export interface Metric {
  metric: string;
  value: string;
  target: string;
  /** null when there is no target or no data. */
  pass: boolean | null;
  mapsTo: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const passRate = (runs: RunRecord[]) => runs.filter((r) => r.passed).length / runs.length;
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;

function rateMetric(name: string, runs: RunRecord[], target: number, mapsTo: string): Metric {
  const label = target === 1 ? "100%" : `≥ ${pct(target)}`;
  if (!runs.length) return { metric: name, value: "n/a", target: label, pass: null, mapsTo };
  const rate = passRate(runs);
  return {
    metric: name,
    value: `${pct(rate)} (${runs.filter((r) => r.passed).length}/${runs.length})`,
    target: label,
    pass: rate >= target,
    mapsTo,
  };
}

export const BLENDED_COST_TARGET_USD = 0.04;
export const INITIAL_WALL_TARGET_S = 180;

export function metrics(report: EvalReport): Metric[] {
  const { runs } = report;
  const inGroup = (g: RunRecord["group"]) => runs.filter((r) => r.group === g);
  const initialWall = median(inGroup("initial").map((r) => r.wall_seconds));
  const passed = runs.filter((r) => r.passed);
  const initialCost = mean(runs.filter((r) => r.kind === "initial").map((r) => r.cost_usd));
  const editCost = mean(runs.filter((r) => r.kind === "edit").map((r) => r.cost_usd));
  const blended = (initialCost + 3 * editCost) / 4;

  return [
    rateMetric("Pass rate T1–T3, T10", inGroup("initial"), 0.7, "H1"),
    rateMetric("Pass rate T4–T8", inGroup("edit"), 0.8, "H2"),
    rateMetric("T9 pass rate", inGroup("guardrail"), 1, "Guardrails"),
    {
      metric: "Median wall time, initial builds",
      value: Number.isNaN(initialWall) ? "n/a" : `${initialWall.toFixed(1)} s`,
      target: `≤ ${INITIAL_WALL_TARGET_S} s`,
      pass: Number.isNaN(initialWall) ? null : initialWall <= INITIAL_WALL_TARGET_S,
      mapsTo: "Operational",
    },
    {
      metric: "Mean cost per passed run",
      value: passed.length ? usd(mean(passed.map((r) => r.cost_usd))) : "n/a",
      target: "Reported",
      pass: null,
      mapsTo: "Pricing basis",
    },
    {
      metric: "Blended cost per build (1 initial : 3 edits)",
      value: Number.isNaN(blended) ? "n/a" : usd(blended),
      target: `≤ $${BLENDED_COST_TARGET_USD.toFixed(2)}`,
      pass: Number.isNaN(blended) ? null : blended <= BLENDED_COST_TARGET_USD,
      mapsTo: "Pro plan guardrail (brief §13)",
    },
  ];
}

const flag = (pass: boolean | null) => (pass === null ? "–" : pass ? "✅ pass" : "❌ fail");
const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;

export function renderMarkdown(report: EvalReport): string {
  const { config } = report;
  const lines = [
    `# Eval: plan ${config.planModel}, edit ${config.editModel}`,
    "",
    `Tasks \`${config.tasks}\`, ${config.runs} run(s) each, ${report.startedAt} → ${report.finishedAt}.` +
      (config.dryRun ? " **Dry run: scripted provider, no model calls; not a model result.**" : ""),
    "",
    "## Thresholds",
    "",
    row(["Metric", "Value", "Target", "Result", "Maps to"]),
    row(["---", "---", "---", "---", "---"]),
    ...metrics(report).map((m) => row([m.metric, m.value, m.target, flag(m.pass), m.mapsTo])),
    "",
    "## Tasks",
    "",
    row([
      "Task",
      "Model",
      "Runs",
      "Passed",
      "Pass rate",
      "Median wall",
      "Mean cost",
      "Mean repairs",
      "Failed checks",
    ]),
    row(["---", "---", "---:", "---:", "---:", "---:", "---:", "---:", "---"]),
  ];
  const tasks = [...new Set(report.runs.map((r) => r.task))].sort(
    (a, b) => Number(a.slice(1)) - Number(b.slice(1)),
  );
  for (const task of tasks) {
    const runs = report.runs.filter((r) => r.task === task);
    const failed = [
      ...new Set(runs.flatMap((r) => r.checks.filter((c) => !c.ok).map((c) => c.name))),
    ];
    lines.push(
      row([
        task,
        [...new Set(runs.map((r) => r.model))].join(", "),
        runs.length,
        runs.filter((r) => r.passed).length,
        pct(passRate(runs)),
        `${median(runs.map((r) => r.wall_seconds)).toFixed(1)} s`,
        usd(mean(runs.map((r) => r.cost_usd))),
        mean(runs.map((r) => r.repair_attempts)).toFixed(1),
        failed.join("; ") || "–",
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}
