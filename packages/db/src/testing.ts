// A fresh, migrated Postgres database per test file, on the docker-compose server
// (`pnpm services:up`). Dropped again by cleanup().
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDb, createPool, type Db } from "./client";
import { migrateUp } from "./migrate";

export const TEST_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://buildly:buildly@localhost:5433/postgres";

export interface TestDatabase {
  db: Db;
  pool: pg.Pool;
  url: string;
  cleanup(): Promise<void>;
}

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const name = `buildly_test_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: TEST_ADMIN_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Integration tests need Postgres at ${TEST_ADMIN_URL}. Start it with \`pnpm services:up\`.`,
      { cause: error },
    );
  }
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = createPool(url.toString());
  if (options.migrate !== false) await migrateUp(pool);

  return {
    db: createDb(pool),
    pool,
    url: url.toString(),
    async cleanup() {
      await pool.end();
      const dropper = new pg.Client({ connectionString: TEST_ADMIN_URL });
      await dropper.connect();
      await dropper.query(`drop database if exists ${name} with (force)`);
      await dropper.end();
    },
  };
}
