// The worker loop: reap stale jobs, claim one, run it with a heartbeat, record the
// outcome. stop() finishes the current job (up to the grace period) before resolving.
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { queue, type Db } from "@buildly/db";
import type { Logger } from "./log";
import { runJob, type JobHandler } from "./runner";

export interface WorkerOptions {
  db: Db;
  handlers: Record<string, JobHandler>;
  log: Logger;
  workerId?: string;
  pollMs?: number;
  heartbeatMs?: number;
  reapEveryMs?: number;
  shutdownGraceMs?: number;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });

export function startWorker(options: WorkerOptions) {
  const {
    db,
    handlers,
    workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`,
    pollMs = 1000,
    heartbeatMs = queue.HEARTBEAT_MS,
    reapEveryMs = 15_000,
    shutdownGraceMs = 30_000,
  } = options;
  const log = options.log.child({ worker_id: workerId });
  const stopping = new AbortController();
  let current: Promise<void> | undefined;
  let lastReap = 0;

  async function runOne(job: queue.Job) {
    const generationId =
      typeof job.payload.generationId === "string" ? job.payload.generationId : undefined;
    const jobLog = log.child({
      job_id: job.id,
      job_type: job.type,
      ...(generationId ? { generation_id: generationId } : {}),
    });
    const handler = handlers[job.type]!;
    jobLog.info("job started", { attempt: job.attempts });
    let cancelSeen = false;
    const beat = setInterval(() => {
      queue.heartbeat(db, job.id, workerId).then(
        (state) => (cancelSeen ||= state?.cancelRequested ?? false),
        (error: Error) => jobLog.warn("heartbeat failed", { error: error.message }),
      );
    }, heartbeatMs);
    try {
      const result = await runJob(job, handler, {
        log: jobLog,
        isCancelRequested: async () =>
          cancelSeen || (cancelSeen = await queue.isCancelRequested(db, job.id)),
      });
      const jobStatus = result.status === "timed_out" ? "failed" : result.status;
      await queue.complete(
        db,
        job.id,
        workerId,
        jobStatus,
        result.status === "timed_out" ? "timed_out" : result.error,
      );
      jobLog.info(
        result.status === "done" ? "job completed" : `job ${result.status}`,
        result.error ? { error: result.error } : {},
      );
    } finally {
      clearInterval(beat);
    }
  }

  const loop = (async () => {
    log.info("worker started", { types: Object.keys(handlers) });
    while (!stopping.signal.aborted) {
      try {
        if (Date.now() - lastReap >= reapEveryMs) {
          lastReap = Date.now();
          const reaped = await queue.reapStale(db);
          if (reaped.requeued.length || reaped.failed.length) log.warn("reaped stale jobs", reaped);
        }
        const job = await queue.claim(db, workerId, Object.keys(handlers));
        if (!job) {
          await sleep(pollMs, stopping.signal);
          continue;
        }
        current = runOne(job);
        await current;
        current = undefined;
      } catch (error) {
        log.error("worker loop error", { error: (error as Error).message });
        await sleep(pollMs, stopping.signal);
      }
    }
  })();

  return {
    workerId,
    /** Stops claiming, waits for the current job up to the grace period. */
    async stop(): Promise<void> {
      stopping.abort();
      const running = current;
      if (running) {
        log.info("waiting for the current job before stopping", { grace_ms: shutdownGraceMs });
        const finished = await Promise.race([
          running.then(() => true),
          sleep(shutdownGraceMs).then(() => false),
        ]);
        if (!finished)
          log.warn(
            "current job still running after the grace period; it will be requeued as stale",
          );
      }
      await Promise.race([loop, sleep(shutdownGraceMs)]);
      log.info("worker stopped");
    },
  };
}
