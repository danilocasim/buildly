import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { metrics } from "./metrics";
import { analyticsEvents, projects, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 12, minutes));

describe("metrics.compute", () => {
  it("computes H1, H2, H3, time to preview, cost, repair rate, and cap pressure", async () => {
    const [user] = await t.db.insert(users).values({ email: "m@example.com" }).returning();
    const [p1, p2, p3] = await t.db
      .insert(projects)
      .values([
        { userId: user!.id, name: "One" },
        { userId: user!.id, name: "Two" },
        { userId: user!.id, name: "Three" },
      ])
      .returning();
    const finished = (
      projectId: string,
      kind: string,
      status: string,
      repair_attempts: number,
      cost_usd: number,
      minute: number,
    ) => ({
      userId: user!.id,
      projectId,
      name: "build.finished",
      props: { generation_id: "g", kind, status, repair_attempts, cost_usd },
      occurredAt: at(minute),
    });
    await t.db.insert(analyticsEvents).values([
      // Initial builds: 2 succeed within 2 repairs, 1 succeeds only on a third (not counted), 1 fails.
      finished(p1!.id, "initial", "succeeded", 0, 0.1, 1),
      finished(p2!.id, "initial", "succeeded", 2, 0.2, 2),
      finished(p3!.id, "initial", "succeeded", 3, 0.3, 3),
      finished(p3!.id, "initial", "failed", 2, 0.05, 4),
      // Edits: 4 of 5 pass.
      finished(p1!.id, "edit", "succeeded", 0, 0.01, 5),
      finished(p1!.id, "edit", "succeeded", 1, 0.02, 6),
      finished(p1!.id, "edit", "succeeded", 0, 0.01, 7),
      finished(p2!.id, "edit", "succeeded", 0, 0.01, 8),
      finished(p2!.id, "edit", "failed", 2, 0.03, 9),
      // Intent: p1 exported, p2 opened on phone; p3 did neither.
      {
        userId: user!.id,
        projectId: p1!.id,
        name: "export.created",
        props: { project_id: p1!.id, zip_bytes: 10 },
        occurredAt: at(10),
      },
      {
        userId: user!.id,
        projectId: p2!.id,
        name: "preview.phone_opened",
        props: { project_id: p2!.id },
        occurredAt: at(11),
      },
      // Time to preview: p1 started at :20, loaded at :22 (120 s); p2 started :30, loaded :31 (60 s).
      {
        userId: user!.id,
        projectId: p1!.id,
        name: "build.started",
        props: { generation_id: "g1", kind: "initial", model: "m" },
        occurredAt: at(20),
      },
      {
        userId: user!.id,
        projectId: p1!.id,
        name: "preview.web_loaded",
        props: { project_id: p1!.id, load_ms: 5 },
        occurredAt: at(22),
      },
      {
        userId: user!.id,
        projectId: p2!.id,
        name: "build.started",
        props: { generation_id: "g2", kind: "initial", model: "m" },
        occurredAt: at(30),
      },
      {
        userId: user!.id,
        projectId: p2!.id,
        name: "preview.web_loaded",
        props: { project_id: p2!.id, load_ms: 5 },
        occurredAt: at(31),
      },
      // Cap pressure and counts.
      { userId: user!.id, name: "cap.hit", props: { cap: "hourly_builds" }, occurredAt: at(40) },
      { userId: user!.id, name: "cap.hit", props: { cap: "hourly_builds" }, occurredAt: at(41) },
      { userId: user!.id, name: "cap.hit", props: { cap: "projects" }, occurredAt: at(42) },
      {
        userId: user!.id,
        name: "user.signed_in",
        props: { method: "magic_link" },
        occurredAt: at(43),
      },
      // Outside the range: ignored.
      finished(p1!.id, "initial", "failed", 0, 9, 120),
    ]);

    const m = await metrics.compute(t.db, { from: at(0), to: at(60) });
    expect(m.h1).toEqual({ numerator: 2, denominator: 4, value: 0.5 });
    expect(m.h2).toEqual({ numerator: 4, denominator: 5, value: 0.8 });
    expect(m.h3).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(m.timeToPreviewMs).toBe(90_000);
    expect(m.costPerSuccessfulBuildUsd).toBeCloseTo(
      (0.1 + 0.2 + 0.3 + 0.01 + 0.02 + 0.01 + 0.01) / 7,
      6,
    );
    expect(m.repairRate).toEqual({ numerator: 5, denominator: 9, value: 5 / 9 });
    expect(m.capPressure).toEqual({ hourly_builds: 2, projects: 1 });
    expect(m.counts).toEqual({
      finishedBuilds: 9,
      succeededBuilds: 7,
      signIns: 1,
      projectsCreated: 0,
    });
  });

  it("reports null ratios and medians when there is no data", async () => {
    const m = await metrics.compute(t.db, { from: at(200), to: at(260) });
    expect(m.h1.value).toBeNull();
    expect(m.h3).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(m.timeToPreviewMs).toBeNull();
    expect(m.costPerSuccessfulBuildUsd).toBeNull();
    expect(m.capPressure).toEqual({});
  });
});
