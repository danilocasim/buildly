// Runs one job with cancellation checks between steps, a hard timeout, and cleanup.
import type { Logger } from "./log";

export const GENERATION_TIMEOUT_MS = 240_000;

export type RunStatus = "done" | "failed" | "cancelled" | "timed_out";

export interface JobContext<P = Record<string, unknown>> {
  jobId: string;
  payload: P;
  /** Aborted on cancel or timeout; pass it to anything long-running. */
  signal: AbortSignal;
  log: Logger;
  /** Whether the user asked to cancel (the API sets jobs.cancel_requested). */
  isCancelRequested(): Promise<boolean>;
  /** Runs `fn` unless a cancel was requested; checks before every step. */
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  /** Registers cleanup (temp dirs, sessions) that runs however the job ends. */
  onCleanup(fn: () => Promise<void> | void): void;
}

export interface JobHandler<P = Record<string, unknown>> {
  run(ctx: JobContext<P>): Promise<void>;
  /** Hard limit; defaults to 4 minutes (TODO 3.4.4). */
  timeoutMs?: number;
}

export class JobCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "JobCancelled";
  }
}

export class JobTimedOut extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
    this.name = "JobTimedOut";
  }
}

export interface RunDeps {
  isCancelRequested(): Promise<boolean>;
  log: Logger;
}

export async function runJob(
  job: { id: string; payload: Record<string, unknown> },
  handler: JobHandler,
  deps: RunDeps,
): Promise<{ status: RunStatus; error?: string }> {
  const timeoutMs = handler.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const controller = new AbortController();
  const cleanups: (() => Promise<void> | void)[] = [];

  const ctx: JobContext = {
    jobId: job.id,
    payload: job.payload,
    signal: controller.signal,
    log: deps.log,
    isCancelRequested: () => deps.isCancelRequested(),
    async step(name, fn) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (await deps.isCancelRequested()) {
        controller.abort(new JobCancelled());
        throw controller.signal.reason;
      }
      deps.log.info("step started", { step: name });
      const result = await fn();
      deps.log.info("step finished", { step: name });
      return result;
    },
    onCleanup(fn) {
      cleanups.push(fn);
    },
  };

  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => {
      const reason: unknown = controller.signal.reason;
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  const timer = setTimeout(() => controller.abort(new JobTimedOut(timeoutMs)), timeoutMs);

  let outcome: { status: RunStatus; error?: string };
  try {
    await Promise.race([handler.run(ctx), aborted]);
    outcome = { status: "done" };
  } catch (error) {
    if (error instanceof JobCancelled) outcome = { status: "cancelled" };
    else if (error instanceof JobTimedOut) outcome = { status: "timed_out", error: error.message };
    else
      outcome = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    if (!controller.signal.aborted) controller.abort(error);
  } finally {
    clearTimeout(timer);
  }

  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch (error) {
      deps.log.error("cleanup failed", { error: (error as Error).message });
    }
  }
  return outcome;
}
