// Runs the real entry point as a child process (TODO 3.4.2).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, queue } from "@buildly/db";
import { createTestDatabase, type TestDatabase } from "@buildly/db/testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

const workerDir = fileURLToPath(new URL("..", import.meta.url));

describe("worker process", () => {
  it("on SIGTERM finishes the running job, logs it, and exits 0", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
      cwd: workerDir,
      env: {
        PATH: process.env.PATH,
        WORKER_POLL_MS: "50",
        DATABASE_URL: t.url,
        STORAGE_REGION: "us-east-1",
        STORAGE_BUCKET: "unused",
        STORAGE_ACCESS_KEY: "unused",
        STORAGE_SECRET_KEY: "unused",
        APP_URL: "http://localhost:3300",
        SNACK_SDK_VERSION: "54.0.0",
        OPENAI_API_KEY: "test-not-a-key",
        GENERATION_MODEL_PLAN: "plan-model",
        GENERATION_MODEL_EDIT: "edit-model",
      },
    });
    const lines: { msg: string; job_id?: string }[] = [];
    let buffer = "";
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const exited = new Promise<number | null>((resolve) => child.on("exit", resolve));
    const started = new Promise<void>((resolve) => {
      child.stdout.on("data", (d: Buffer) => {
        buffer += d.toString();
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = JSON.parse(buffer.slice(0, newline)) as { msg: string };
          buffer = buffer.slice(newline + 1);
          lines.push(line);
          if (line.msg === "job started") resolve();
        }
      });
    });

    const job = await queue.enqueue(createDb(t.pool), { type: "sleep", payload: { ms: 1500 } });
    await started;
    child.kill("SIGTERM");
    const code = await exited;

    expect(stderr).toBe("");
    expect(code).toBe(0);
    const messages = lines.map((l) => l.msg);
    expect(messages.indexOf("job completed")).toBeGreaterThan(
      messages.indexOf("shutdown requested"),
    );
    expect(messages.at(-1)).toBe("worker stopped");
    expect(lines.find((l) => l.msg === "job completed")?.job_id).toBe(job.id);
  });
});
