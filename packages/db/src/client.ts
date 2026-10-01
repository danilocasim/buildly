import { is, TransactionRollbackError } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

export function createPool(connectionString: string, max = 10): pg.Pool {
  const pool = new pg.Pool({ connectionString, max });
  // An idle connection the server terminates (restart, failover, a test database being
  // recreated) emits "error" on the pool; without a listener Node treats it as an uncaught
  // exception and the process dies. Log it; the pool discards the client and reconnects.
  pool.on("error", (error) => {
    console.error(
      JSON.stringify({ level: "warn", msg: "idle database client error", error: error.message }),
    );
  });
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

/** Whether `error` is what `tx.rollback()` throws (its name is "DrizzleError", so test the class). */
export function isRollback(error: unknown): boolean {
  return is(error, TransactionRollbackError);
}
