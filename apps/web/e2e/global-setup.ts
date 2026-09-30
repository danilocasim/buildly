// A dedicated database for the e2e server: recreated, migrated, and given one admin and
// one regular user with sessions. The cookies go to e2e/.state.json for the tests.
import { writeFileSync } from "node:fs";
import pg from "pg";
import { auth, createDb, createPool, schema } from "@buildly/db";
import { migrateUp } from "@buildly/db/migrate";
import { E2E_ADMIN_URL, E2E_DATABASE, E2E_DATABASE_URL, E2E_STATE } from "./env";

export default async function globalSetup() {
  const admin = new pg.Client({ connectionString: E2E_ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${E2E_DATABASE} with (force)`);
  await admin.query(`create database ${E2E_DATABASE}`);
  await admin.end();

  const pool = createPool(E2E_DATABASE_URL, 1);
  try {
    await migrateUp(pool);
    const db = createDb(pool);
    const now = new Date();
    const [adminUser] = await db
      .insert(schema.users)
      .values({ email: "admin@buildly.test", isAdmin: true })
      .returning();
    const [member] = await db
      .insert(schema.users)
      .values({ email: "member@example.com" })
      .returning();
    writeFileSync(
      E2E_STATE,
      JSON.stringify({
        adminCookie: await auth.createSession(db, adminUser!.id, now),
        memberCookie: await auth.createSession(db, member!.id, now),
      }),
    );
  } finally {
    await pool.end();
  }
}
