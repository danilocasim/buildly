// Job queue on the `jobs` table. Workers claim with FOR UPDATE SKIP LOCKED, heartbeat
// while running, and a reaper requeues a job whose worker stopped heartbeating; the
// second time it happens the job fails.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import type { Executor } from "./queries";
import { jobs } from "./schema";

export type Job = typeof jobs.$inferSelect;
export type JobOutcome = "done" | "failed" | "cancelled";

export const HEARTBEAT_MS = 10_000;
export const STALE_MS = 30_000;
/** Claims allowed before a stale job fails instead of being requeued (claimed, requeued once). */
export const MAX_ATTEMPTS = 2;

export async function enqueue(
  db: Executor,
  input: { type: string; payload: Record<string, unknown>; runAfter?: Date },
): Promise<Job> {
  const [row] = await db.insert(jobs).values(input).returning();
  return row!;
}

/** Claims the oldest runnable job for `workerId`, or returns undefined. */
export async function claim(db: Db, workerId: string, types?: string[]): Promise<Job | undefined> {
  return db.transaction(async (tx) => {
    const typeFilter = types?.length ? sql`and type in ${types}` : sql``;
    const picked = await tx.execute<{ id: string }>(sql`
      select id from jobs
      where status = 'queued' and run_after <= now() ${typeFilter}
      order by created_at
      for update skip locked
      limit 1`);
    const id = picked.rows[0]?.id;
    if (!id) return undefined;
    const [job] = await tx
      .update(jobs)
      .set({
        status: "running",
        lockedBy: workerId,
        lockedAt: sql`now()`,
        heartbeatAt: sql`now()`,
        attempts: sql`${jobs.attempts} + 1`,
      })
      .where(eq(jobs.id, id))
      .returning();
    return job;
  });
}

/** Refreshes the heartbeat. Returns undefined if the worker no longer owns the job. */
export async function heartbeat(
  db: Executor,
  jobId: string,
  workerId: string,
): Promise<{ cancelRequested: boolean } | undefined> {
  const [row] = await db
    .update(jobs)
    .set({ heartbeatAt: sql`now()` })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, "running")))
    .returning({ cancelRequested: jobs.cancelRequested });
  return row;
}

export async function complete(
  db: Executor,
  jobId: string,
  workerId: string,
  outcome: JobOutcome,
  error?: string,
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: outcome, finishedAt: sql`now()`, lastError: error ?? null })
    .where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId), eq(jobs.status, "running")))
    .returning({ id: jobs.id });
  return rows.length === 1;
}

export async function requestCancel(db: Executor, jobId: string): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ cancelRequested: true })
    .where(and(eq(jobs.id, jobId), sql`${jobs.status} in ('queued', 'running')`))
    .returning({ id: jobs.id });
  return rows.length === 1;
}

export async function isCancelRequested(db: Executor, jobId: string): Promise<boolean> {
  const [row] = await db
    .select({ cancelRequested: jobs.cancelRequested })
    .from(jobs)
    .where(eq(jobs.id, jobId));
  return row?.cancelRequested ?? false;
}

/**
 * Handles running jobs whose heartbeat is older than `staleMs`: requeued if they have
 * been claimed fewer than MAX_ATTEMPTS times, otherwise failed.
 */
export async function reapStale(
  db: Executor,
  staleMs = STALE_MS,
): Promise<{ requeued: string[]; failed: string[] }> {
  const cutoff = sql`now() - make_interval(secs => ${staleMs / 1000})`;
  const requeued = await db
    .update(jobs)
    .set({
      status: "queued",
      lockedBy: null,
      lockedAt: null,
      heartbeatAt: null,
      runAfter: sql`now()`,
      lastError: "requeued: worker stopped heartbeating",
    })
    .where(
      and(
        eq(jobs.status, "running"),
        sql`${jobs.heartbeatAt} < ${cutoff}`,
        sql`${jobs.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .returning({ id: jobs.id });
  const failed = await db
    .update(jobs)
    .set({
      status: "failed",
      finishedAt: sql`now()`,
      lastError: "failed: worker stopped heartbeating twice",
    })
    .where(
      and(
        eq(jobs.status, "running"),
        sql`${jobs.heartbeatAt} < ${cutoff}`,
        sql`${jobs.attempts} >= ${MAX_ATTEMPTS}`,
      ),
    )
    .returning({ id: jobs.id });
  return { requeued: requeued.map((r) => r.id), failed: failed.map((r) => r.id) };
}

export async function getJob(db: Executor, jobId: string): Promise<Job | undefined> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  return row;
}
