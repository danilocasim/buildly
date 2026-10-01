// Admin-only metrics dashboard (TODO 7.1.2). Everyone else gets a plain 404, as /admin/invites.
import { notFound } from "next/navigation";
import { TARGETS, type Metrics, type Ratio } from "@buildly/db";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { loadDashboard } from "@/src/server/metrics";

export const dynamic = "force-dynamic";

const pct = (r: Ratio) =>
  r.value === null ? "n/a" : `${(r.value * 100).toFixed(0)}% (${r.numerator}/${r.denominator})`;
const seconds = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(0)} s`);
const usd = (v: number | null) => (v === null ? "n/a" : `$${v.toFixed(3)}`);
const meets = (ok: boolean | null) => (ok === null ? "–" : ok ? "✅" : "❌");

function rows(m: Metrics) {
  return [
    [
      "H1 pass rate (initial builds)",
      pct(m.h1),
      "≥ 70%",
      m.h1.value === null ? null : m.h1.value >= TARGETS.h1,
    ],
    [
      "H2 pass rate (edits)",
      pct(m.h2),
      "≥ 80%",
      m.h2.value === null ? null : m.h2.value >= TARGETS.h2,
    ],
    ["H3 code intent", pct(m.h3), "≥ 30%", m.h3.value === null ? null : m.h3.value >= TARGETS.h3],
    [
      "Time to preview (median)",
      seconds(m.timeToPreviewMs),
      "≤ 180 s",
      m.timeToPreviewMs === null ? null : m.timeToPreviewMs <= TARGETS.timeToPreviewMs,
    ],
    ["Cost per successful build", usd(m.costPerSuccessfulBuildUsd), "Reported", null],
    ["Repair rate", pct(m.repairRate), "Reported", null],
    [
      "Cap pressure",
      Object.entries(m.capPressure)
        .map(([cap, n]) => `${cap}: ${n}`)
        .join(", ") || "none",
      "Reported",
      null,
    ],
    [
      "Finished builds / succeeded",
      `${m.counts.finishedBuilds} / ${m.counts.succeededBuilds}`,
      "",
      null,
    ],
    ["Sign-ins / projects created", `${m.counts.signIns} / ${m.counts.projectsCreated}`, "", null],
  ] as const;
}

export default async function MetricsPage() {
  const user = await currentUser();
  if (!user?.isAdmin) notFound();
  const deps = getDeps();
  const dashboard = await loadDashboard(deps);
  const r7 = rows(dashboard.last7);
  const r30 = rows(dashboard.last30);
  return (
    <main className="mx-auto max-w-[960px] px-6 py-12">
      <h1 className="text-[26px] font-semibold tracking-tight">Metrics</h1>
      <p className="mt-1 text-[13px] text-muted">
        METRICS.md formulas over analytics events, as of{" "}
        {deps.now().toISOString().slice(0, 16).replace("T", " ")} UTC.
      </p>
      <table className="mt-6 w-full text-[13px]" data-testid="metrics-table">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2">Metric</th>
            <th className="py-2">Last 7 days</th>
            <th className="py-2">Last 30 days</th>
            <th className="py-2">Target</th>
          </tr>
        </thead>
        <tbody>
          {r7.map(([label, v7, target, ok7], i) => (
            <tr
              key={label}
              className="border-b border-line"
              data-testid="metric-row"
              data-metric={label}
            >
              <td className="py-2 font-medium">{label}</td>
              <td className="py-2" data-testid="metric-7d">
                {v7} {meets(ok7)}
              </td>
              <td className="py-2" data-testid="metric-30d">
                {r30[i]![1]} {meets(r30[i]![3])}
              </td>
              <td className="py-2 text-muted">{target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mt-10 text-[17px] font-semibold">Last nightly eval</h2>
      {dashboard.nightly ? (
        <div className="mt-3 text-[13px]" data-testid="nightly-eval">
          <p className="text-muted">
            {dashboard.nightly.startedAt.slice(0, 16).replace("T", " ")} UTC · plan{" "}
            {dashboard.nightly.planModel} · edit {dashboard.nightly.editModel} ·{" "}
            {dashboard.nightly.runs.filter((r) => r.passed).length}/{dashboard.nightly.runs.length}{" "}
            passed
          </p>
          <ul className="mt-2 space-y-1">
            {dashboard.nightly.runs.map((run, i) => (
              <li key={i}>
                {run.task}: {run.passed ? "passed" : `failed (${run.status})`} · {run.wall_seconds}{" "}
                s · ${run.cost_usd.toFixed(4)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted" data-testid="nightly-eval-none">
          No nightly eval report in storage yet (the nightly workflow uploads to{" "}
          <code>eval/nightly/</code> when <code>EVAL_STORAGE_BUCKET</code> is set to this bucket).
        </p>
      )}
    </main>
  );
}
