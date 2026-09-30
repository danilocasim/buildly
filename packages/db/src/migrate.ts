// Up and down migrations. Up uses drizzle's migrator (it records applied migrations in
// drizzle.__drizzle_migrations); down runs the hand-written migrations/down/<tag>.sql for
// the newest applied migration and removes its record. drizzle-kit has no down support.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

function journal(): JournalEntry[] {
  return (
    JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
      entries: JournalEntry[];
    }
  ).entries;
}

export async function migrateUp(pool: pg.Pool): Promise<void> {
  await migrate(createDb(pool), { migrationsFolder });
}

/** Reverts the newest applied migration. Returns its tag, or undefined when none is applied. */
export async function migrateDown(pool: pg.Pool): Promise<string | undefined> {
  const exists = await pool.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!exists.rows[0]?.exists) return undefined;
  const latest = await pool.query<{ id: number; created_at: string }>(
    "select id, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
  );
  const row = latest.rows[0];
  if (!row) return undefined;
  const entry = journal().find((e) => String(e.when) === String(row.created_at));
  if (!entry) throw new Error(`Applied migration ${row.created_at} is not in the journal`);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(readFileSync(join(migrationsFolder, "down", `${entry.tag}.sql`), "utf8"));
    await client.query("delete from drizzle.__drizzle_migrations where id = $1", [row.id]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return entry.tag;
}
