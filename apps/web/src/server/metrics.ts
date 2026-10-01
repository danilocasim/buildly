// The /admin/metrics dashboard's data (TODO 7.1.2): METRICS.md formulas for the last 7 and
// 30 days, plus the newest nightly eval report in storage (`eval/nightly/*.json`, where the
// nightly workflow copies it when EVAL_STORAGE_BUCKET is the app's bucket).
import { metrics, type Metrics } from "@buildly/db";
import type { Deps } from "./deps";

export interface NightlyEvalSummary {
  key: string;
  startedAt: string;
  planModel: string;
  editModel: string;
  runs: { task: string; passed: boolean; status: string; cost_usd: number; wall_seconds: number }[];
}

export interface Dashboard {
  last7: Metrics;
  last30: Metrics;
  nightly: NightlyEvalSummary | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadDashboard(
  deps: Pick<Deps, "db" | "storage" | "now">,
): Promise<Dashboard> {
  const to = deps.now();
  const [last7, last30, nightly] = await Promise.all([
    metrics.compute(deps.db, { from: new Date(to.getTime() - 7 * DAY_MS), to }),
    metrics.compute(deps.db, { from: new Date(to.getTime() - 30 * DAY_MS), to }),
    latestNightly(deps.storage),
  ]);
  return { last7, last30, nightly };
}

async function latestNightly(
  storage: Pick<Deps["storage"], "listKeys" | "getText">,
): Promise<NightlyEvalSummary | null> {
  const keys = (await storage.listKeys("eval/nightly/")).filter((k) => k.endsWith(".json"));
  const key = keys.at(-1);
  if (!key) return null;
  try {
    const report = JSON.parse(await storage.getText(key)) as {
      startedAt: string;
      config: { planModel: string; editModel: string };
      runs: NightlyEvalSummary["runs"];
    };
    return {
      key,
      startedAt: report.startedAt,
      planModel: report.config.planModel,
      editModel: report.config.editModel,
      runs: report.runs.map((r) => ({
        task: r.task,
        passed: r.passed,
        status: r.status,
        cost_usd: r.cost_usd,
        wall_seconds: r.wall_seconds,
      })),
    };
  } catch {
    return null;
  }
}
