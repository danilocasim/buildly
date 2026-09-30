import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "./log";
import { GENERATION_TIMEOUT_MS, runJob, type JobHandler } from "./runner";

const quiet = createLogger({}, () => {});
const job = { id: "j1", payload: {} };

afterEach(() => vi.useRealTimers());

describe("runJob", () => {
  it("times out after 240 s, aborts the signal, and runs cleanup", async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn();
    let signal: AbortSignal | undefined;
    const handler: JobHandler = {
      run: (ctx) => {
        signal = ctx.signal;
        ctx.onCleanup(cleanup);
        return new Promise(() => {}); // never finishes
      },
    };
    const running = runJob(job, handler, { log: quiet, isCancelRequested: async () => false });
    await vi.advanceTimersByTimeAsync(GENERATION_TIMEOUT_MS - 1);
    expect(cleanup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await running).toEqual({ status: "timed_out", error: "timed out after 240000 ms" });
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
  });

  it("stops at the next step once a cancel is requested", async () => {
    const executed: string[] = [];
    let cancel = false;
    const handler: JobHandler = {
      async run(ctx) {
        for (const name of ["a", "b", "c"]) {
          await ctx.step(name, async () => {
            executed.push(name);
            if (name === "a") cancel = true;
          });
        }
      },
    };
    expect(
      await runJob(job, handler, { log: quiet, isCancelRequested: async () => cancel }),
    ).toEqual({ status: "cancelled" });
    expect(executed).toEqual(["a"]);
  });

  it("reports a thrown error as failed and still cleans up", async () => {
    const cleanup = vi.fn();
    const handler: JobHandler = {
      async run(ctx) {
        ctx.onCleanup(cleanup);
        throw new Error("boom");
      },
    };
    expect(
      await runJob(job, handler, { log: quiet, isCancelRequested: async () => false }),
    ).toEqual({ status: "failed", error: "boom" });
    expect(cleanup).toHaveBeenCalled();
  });

  it("completes normally", async () => {
    const handler: JobHandler = {
      run: async (ctx) => void (await ctx.step("only", async () => 1)),
    };
    expect(
      await runJob(job, handler, { log: quiet, isCancelRequested: async () => false }),
    ).toEqual({ status: "done" });
  });
});
