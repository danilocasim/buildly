import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queue } from "@buildly/db";
import { createTestDatabase, type TestDatabase } from "@buildly/db/testing";
import { createLogger } from "./log";
import type { JobHandler } from "./runner";
import { startWorker } from "./worker";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

const lines: Record<string, unknown>[] = [];
const log = createLogger({}, (line) => lines.push(JSON.parse(line) as Record<string, unknown>));

describe("worker", () => {
  it("cancel during a 3-step job: status cancelled, later steps never run", async () => {
    const executed: string[] = [];
    const handlers: Record<string, JobHandler> = {};
    let release!: () => void;
    const stepOneRunning = new Promise<void>((resolve) => {
      const threeSteps: JobHandler = {
        async run(ctx) {
          await ctx.step("one", async () => {
            executed.push("one");
            resolve();
            await new Promise<void>((r) => (release = r));
          });
          await ctx.step("two", async () => void executed.push("two"));
          await ctx.step("three", async () => void executed.push("three"));
        },
      };
      handlers.threeSteps = threeSteps;
    });
    const job = await queue.enqueue(t.db, {
      type: "threeSteps",
      payload: { generationId: "gen-123" },
    });
    const worker = startWorker({ db: t.db, handlers, log, pollMs: 20, heartbeatMs: 50 });

    await stepOneRunning;
    expect(await queue.requestCancel(t.db, job.id)).toBe(true);
    release();

    for (let i = 0; i < 100; i++) {
      const row = await queue.getJob(t.db, job.id);
      if (row?.status !== "running") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await worker.stop();

    expect((await queue.getJob(t.db, job.id))?.status).toBe("cancelled");
    expect(executed).toEqual(["one"]);
    const jobLines = lines.filter((l) => l.job_id === job.id);
    expect(jobLines.every((l) => l.generation_id === "gen-123")).toBe(true);
    expect(jobLines.map((l) => l.msg)).toEqual([
      "job started",
      "step started",
      "step finished",
      "job cancelled",
    ]);
  });
});
