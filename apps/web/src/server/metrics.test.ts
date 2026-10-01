// TODO 7.1.2: the dashboard's numbers over seeded events, plus the nightly eval from storage.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@buildly/db";
import { loadDashboard } from "./metrics";
import { createHarness, type Harness } from "./testing";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

describe("loadDashboard", () => {
  it("asserts H1, H2, H3 for 7 and 30 days from seeded events, and reads the newest nightly report", async () => {
    const { user } = await h.signIn("dash@example.com");
    const [p1, p2] = await h.t.db
      .insert(schema.projects)
      .values([
        { userId: user.id, name: "A" },
        { userId: user.id, name: "B" },
      ])
      .returning();
    const now = h.clock.now.getTime();
    const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);
    const finished = (
      projectId: string,
      kind: string,
      status: string,
      repair_attempts: number,
      when: Date,
    ) => ({
      userId: user.id,
      projectId,
      name: "build.finished",
      props: { generation_id: "g", kind, status, repair_attempts, cost_usd: 0.05 },
      occurredAt: when,
    });
    await h.t.db.insert(schema.analyticsEvents).values([
      finished(p1!.id, "initial", "succeeded", 1, daysAgo(1)),
      finished(p2!.id, "initial", "failed", 2, daysAgo(2)),
      finished(p1!.id, "edit", "succeeded", 0, daysAgo(3)),
      // Older than 7 days, inside 30.
      finished(p2!.id, "initial", "succeeded", 0, daysAgo(10)),
      finished(p2!.id, "edit", "failed", 2, daysAgo(12)),
      {
        userId: user.id,
        projectId: p1!.id,
        name: "export.created",
        props: { project_id: p1!.id, zip_bytes: 1 },
        occurredAt: daysAgo(1),
      },
    ]);
    await h.storage.putSnapshot("eval/nightly/old.json", {});
    const report = {
      startedAt: "2026-10-01T05:16:43.591Z",
      config: { planModel: "gpt-6.1-sol", editModel: "gpt-6-luna" },
      runs: [
        { task: "T1", passed: false, status: "succeeded", cost_usd: 0.1065, wall_seconds: 130.8 },
        { task: "T4", passed: true, status: "succeeded", cost_usd: 0.0042, wall_seconds: 34.6 },
      ],
    };
    // The newest key (sorted last) holds the report as raw JSON, as the nightly workflow uploads it.
    await h.storage.putExport(
      "eval/nightly/zzz-newest.json",
      new TextEncoder().encode(JSON.stringify(report)),
    );

    const dashboard = await loadDashboard(h.deps);
    expect(dashboard.last7.h1).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(dashboard.last7.h2).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(dashboard.last7.h3).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(dashboard.last30.h1).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(dashboard.last30.h2).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(dashboard.last30.h3).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(dashboard.nightly).toMatchObject({
      key: "eval/nightly/zzz-newest.json",
      planModel: "gpt-6.1-sol",
      runs: [
        { task: "T1", passed: false },
        { task: "T4", passed: true },
      ],
    });
  });

  it("has no nightly report when storage holds none", async () => {
    const dashboard = await loadDashboard({
      ...h.deps,
      storage: { ...h.deps.storage, listKeys: () => Promise.resolve([]) },
    });
    expect(dashboard.nightly).toBeNull();
  });
});
