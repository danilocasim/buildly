// The METRICS.md formulas over analytics_events for a date range (TODO 7.1.2, 7.1.3). Ten
// beta users produce few rows, so the events are fetched and folded in JavaScript, where the
// definitions stay readable and testable.
import { and, gte, inArray, lt } from "drizzle-orm";
import type { Executor } from "./queries";
import { analyticsEvents } from "./schema";

export interface Ratio {
  numerator: number;
  denominator: number;
  /** null when the denominator is zero. */
  value: number | null;
}

export interface Metrics {
  from: string;
  to: string;
  /** Initial builds that succeeded within two repairs ÷ initial builds finished. */
  h1: Ratio;
  /** The same for edits. */
  h2: Ratio;
  /** Projects with an export or a phone open ÷ projects with a succeeded build. */
  h3: Ratio;
  /** Median ms from an initial build's start to the web preview loading; null without data. */
  timeToPreviewMs: number | null;
  costPerSuccessfulBuildUsd: number | null;
  /** Finished builds with at least one repair ÷ finished builds. */
  repairRate: Ratio;
  capPressure: Record<string, number>;
  counts: {
    finishedBuilds: number;
    succeededBuilds: number;
    signIns: number;
    projectsCreated: number;
  };
}

export const TARGETS = {
  h1: 0.7,
  h2: 0.8,
  h3: 0.3,
  timeToPreviewMs: 180_000,
} as const;

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  value: denominator ? numerator / denominator : null,
});

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);

export const metrics = {
  /** Every formula for events with `from <= occurred_at < to`. */
  async compute(db: Executor, range: { from: Date; to: Date }): Promise<Metrics> {
    const rows = await db
      .select({
        name: analyticsEvents.name,
        projectId: analyticsEvents.projectId,
        props: analyticsEvents.props,
        occurredAt: analyticsEvents.occurredAt,
      })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.occurredAt, range.from),
          lt(analyticsEvents.occurredAt, range.to),
          inArray(analyticsEvents.name, [
            "build.started",
            "build.finished",
            "preview.web_loaded",
            "preview.phone_opened",
            "export.created",
            "cap.hit",
            "user.signed_in",
            "project.created",
          ]),
        ),
      );
    const of = (name: string) => rows.filter((r) => r.name === name);

    const finished = of("build.finished");
    const passed = (kind: string) =>
      ratio(
        finished.filter(
          (r) =>
            r.props.kind === kind &&
            r.props.status === "succeeded" &&
            num(r.props.repair_attempts) <= 2,
        ).length,
        finished.filter((r) => r.props.kind === kind).length,
      );
    const succeeded = finished.filter((r) => r.props.status === "succeeded");
    const projectsWithSuccess = new Set(succeeded.map((r) => r.projectId).filter(Boolean));
    const projectsWithIntent = new Set(
      [...of("export.created"), ...of("preview.phone_opened")]
        .map((r) => r.projectId)
        .filter((id): id is string => Boolean(id) && projectsWithSuccess.has(id)),
    );

    // Time to preview: each web load against the latest initial build start of its project.
    const starts = of("build.started").filter((r) => r.props.kind === "initial");
    const deltas = of("preview.web_loaded").flatMap((load) => {
      const start = starts
        .filter((s) => s.projectId === load.projectId && s.occurredAt <= load.occurredAt)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
      return start ? [load.occurredAt.getTime() - start.occurredAt.getTime()] : [];
    });

    const capPressure: Record<string, number> = {};
    for (const hit of of("cap.hit")) {
      const cap = typeof hit.props.cap === "string" ? hit.props.cap : "unknown";
      capPressure[cap] = (capPressure[cap] ?? 0) + 1;
    }

    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      h1: passed("initial"),
      h2: passed("edit"),
      h3: ratio(projectsWithIntent.size, projectsWithSuccess.size),
      timeToPreviewMs: median(deltas),
      costPerSuccessfulBuildUsd: succeeded.length
        ? succeeded.reduce((sum, r) => sum + num(r.props.cost_usd), 0) / succeeded.length
        : null,
      repairRate: ratio(
        finished.filter((r) => num(r.props.repair_attempts) >= 1).length,
        finished.length,
      ),
      capPressure,
      counts: {
        finishedBuilds: finished.length,
        succeededBuilds: succeeded.length,
        signIns: of("user.signed_in").length,
        projectsCreated: of("project.created").length,
      },
    };
  },
};
