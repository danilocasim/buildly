import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPool } from "./client";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

describe("createPool", () => {
  it("survives the server terminating an idle connection", async () => {
    const pool = createPool(t.pool.options.connectionString!, 2);
    try {
      // Open one connection, learn its backend pid, and return it to the pool idle.
      const client = await pool.connect();
      const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
      client.release();
      const pid = rows[0]!.pid;

      // Kill it from another connection, as a restart or a forced database drop would.
      const uncaught: Error[] = [];
      const onError = (error: Error) => uncaught.push(error);
      process.on("uncaughtException", onError);
      try {
        await t.db.execute(sql`select pg_terminate_backend(${pid})`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        // The pool discards the dead client and keeps serving.
        const again = await pool.query<{ one: number }>("select 1 as one");
        expect(again.rows[0]!.one).toBe(1);
        expect(uncaught).toEqual([]);
      } finally {
        process.off("uncaughtException", onError);
      }
    } finally {
      await pool.end();
    }
  });
});
