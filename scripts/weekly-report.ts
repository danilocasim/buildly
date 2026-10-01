// Weekly metrics report (TODO 7.1.3): METRICS.md formulas for the last 7 and 30 days, written
// to .plan/mvp/reports/<ISO year>-W<week>.md. Reads DATABASE_URL like the db scripts (default:
// the docker-compose database).
//
//   pnpm report:weekly [--date 2026-10-01]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createDb, createPool, metrics, TARGETS, type Metrics, type Ratio } from "@buildly/db";

const { values } = parseArgs({ options: { date: { type: "string" } }, strict: true });
const to = values.date ? new Date(`${values.date}T00:00:00Z`) : new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO 8601 week of a date, as "YYYY-Www". */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const pct = (r: Ratio) =>
  r.value === null ? "n/a" : `${(r.value * 100).toFixed(0)}% (${r.numerator}/${r.denominator})`;
const flag = (ok: boolean | null) => (ok === null ? "–" : ok ? "✅" : "❌");

export function renderReport(week: string, to: Date, last7: Metrics, last30: Metrics): string {
  const row = (
    label: string,
    value: (m: Metrics) => string,
    target: string,
    ok: (m: Metrics) => boolean | null,
  ) =>
    `| ${label} | ${value(last7)} ${flag(ok(last7))} | ${value(last30)} ${flag(ok(last30))} | ${target} |`;
  const ratioOk = (pick: (m: Metrics) => Ratio, target: number) => (m: Metrics) =>
    pick(m).value === null ? null : pick(m).value! >= target;
  return [
    `# Weekly metrics report ${week}`,
    "",
    `Generated ${to.toISOString().slice(0, 10)} by \`pnpm report:weekly\` from \`analytics_events\` (METRICS.md formulas).`,
    "",
    "| Metric | Last 7 days | Last 30 days | Target |",
    "| --- | --- | --- | --- |",
    row(
      "H1 pass rate (initial builds)",
      (m) => pct(m.h1),
      "≥ 70%",
      ratioOk((m) => m.h1, TARGETS.h1),
    ),
    row(
      "H2 pass rate (edits)",
      (m) => pct(m.h2),
      "≥ 80%",
      ratioOk((m) => m.h2, TARGETS.h2),
    ),
    row(
      "H3 code intent",
      (m) => pct(m.h3),
      "≥ 30%",
      ratioOk((m) => m.h3, TARGETS.h3),
    ),
    row(
      "Time to preview (median)",
      (m) => (m.timeToPreviewMs === null ? "n/a" : `${(m.timeToPreviewMs / 1000).toFixed(0)} s`),
      "≤ 180 s",
      (m) => (m.timeToPreviewMs === null ? null : m.timeToPreviewMs <= TARGETS.timeToPreviewMs),
    ),
    row(
      "Cost per successful build",
      (m) =>
        m.costPerSuccessfulBuildUsd === null ? "n/a" : `$${m.costPerSuccessfulBuildUsd.toFixed(3)}`,
      "Reported",
      () => null,
    ),
    row(
      "Repair rate",
      (m) => pct(m.repairRate),
      "Reported",
      () => null,
    ),
    row(
      "Cap pressure",
      (m) =>
        Object.entries(m.capPressure)
          .map(([cap, n]) => `${cap}: ${n}`)
          .join(", ") || "none",
      "Reported",
      () => null,
    ),
    row(
      "Finished / succeeded builds",
      (m) => `${m.counts.finishedBuilds} / ${m.counts.succeededBuilds}`,
      "",
      () => null,
    ),
    row(
      "Sign-ins / projects created",
      (m) => `${m.counts.signIns} / ${m.counts.projectsCreated}`,
      "",
      () => null,
    ),
    "",
  ].join("\n");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pool = createPool(
    process.env.DATABASE_URL ?? "postgres://buildly:buildly@localhost:5433/buildly",
    2,
  );
  try {
    const db = createDb(pool);
    const [last7, last30] = await Promise.all([
      metrics.compute(db, { from: new Date(to.getTime() - 7 * DAY_MS), to }),
      metrics.compute(db, { from: new Date(to.getTime() - 30 * DAY_MS), to }),
    ]);
    const week = isoWeek(to);
    const dir = fileURLToPath(new URL("../.plan/mvp/reports/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${week}.md`);
    writeFileSync(file, renderReport(week, to, last7, last30));
    console.log(`wrote ${file}`);
  } finally {
    await pool.end();
  }
}
