import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claim,
  complete,
  enqueue,
  heartbeat,
  isCancelRequested,
  reapStale,
  requestCancel,
} from "./jobs";
import { jobs } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());
beforeEach(async () => {
  await t.db.delete(jobs);
});

/** Pretends the job's worker went quiet `seconds` ago. */
async function ageHeartbeat(id: string, seconds: number) {
  await t.db
    .update(jobs)
    .set({ heartbeatAt: sql`now() - make_interval(secs => ${seconds})` })
    .where(eq(jobs.id, id));
}

describe("jobs", () => {
  it("5 workers racing for 1 job: exactly one claims it", async () => {
    const job = await enqueue(t.db, { type: "sleep", payload: { ms: 1 } });
    const claims = await Promise.all([1, 2, 3, 4, 5].map((n) => claim(t.db, `worker-${n}`)));
    const winners = claims.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({ id: job.id, status: "running", attempts: 1 });
  });

  it("claims only runnable jobs of the requested types, oldest first", async () => {
    await enqueue(t.db, { type: "later", payload: {}, runAfter: new Date(Date.now() + 60_000) });
    const a = await enqueue(t.db, { type: "generation", payload: { n: 1 } });
    await enqueue(t.db, { type: "generation", payload: { n: 2 } });
    expect(await claim(t.db, "w", ["other"])).toBeUndefined();
    expect((await claim(t.db, "w", ["generation"]))?.id).toBe(a.id);
    expect(await claim(t.db, "w", ["later"])).toBeUndefined();
  });

  it("requeues a job whose worker stopped heartbeating, then fails it the second time", async () => {
    const job = await enqueue(t.db, { type: "sleep", payload: {} });
    await claim(t.db, "worker-a");
    await ageHeartbeat(job.id, 31);
    expect(await reapStale(t.db)).toEqual({ requeued: [job.id], failed: [] });

    const second = await claim(t.db, "worker-b");
    expect(second).toMatchObject({ id: job.id, attempts: 2, lockedBy: "worker-b" });
    await ageHeartbeat(job.id, 31);
    expect(await reapStale(t.db)).toEqual({ requeued: [], failed: [job.id] });
    const [row] = await t.db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row).toMatchObject({ status: "failed", lastError: expect.stringContaining("twice") });
  });

  it("leaves jobs with a fresh heartbeat alone", async () => {
    const job = await enqueue(t.db, { type: "sleep", payload: {} });
    await claim(t.db, "worker-a");
    await ageHeartbeat(job.id, 5);
    expect(await reapStale(t.db)).toEqual({ requeued: [], failed: [] });
    expect(await heartbeat(t.db, job.id, "worker-a")).toEqual({ cancelRequested: false });
  });

  it("a requeued job's old worker can no longer heartbeat or complete it", async () => {
    const job = await enqueue(t.db, { type: "sleep", payload: {} });
    await claim(t.db, "worker-a");
    await ageHeartbeat(job.id, 31);
    await reapStale(t.db);
    await claim(t.db, "worker-b");
    expect(await heartbeat(t.db, job.id, "worker-a")).toBeUndefined();
    expect(await complete(t.db, job.id, "worker-a", "done")).toBe(false);
    expect(await complete(t.db, job.id, "worker-b", "done")).toBe(true);
  });

  it("records cancel requests for queued and running jobs", async () => {
    const job = await enqueue(t.db, { type: "sleep", payload: {} });
    expect(await requestCancel(t.db, job.id)).toBe(true);
    expect(await isCancelRequested(t.db, job.id)).toBe(true);
    await claim(t.db, "w");
    expect(await heartbeat(t.db, job.id, "w")).toEqual({ cancelRequested: true });
    await complete(t.db, job.id, "w", "cancelled");
    expect(await requestCancel(t.db, job.id)).toBe(false);
  });
});
