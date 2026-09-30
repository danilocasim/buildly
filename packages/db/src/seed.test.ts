import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadStarterFiles, readStarters } from "@buildly/starters";
import { createTestStorage } from "@buildly/storage/testing";
import { seedDev } from "./seed";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let s: Awaited<ReturnType<typeof createTestStorage>>;
beforeAll(async () => {
  [t, s] = await Promise.all([createTestDatabase(), createTestStorage()]);
});
afterAll(async () => Promise.all([t?.cleanup(), s?.cleanup()]));

async function counts() {
  const tables = ["users", "invites", "projects", "snapshots"];
  const result: Record<string, number> = {};
  for (const table of tables) {
    const rows = await t.db.execute<{ n: number }>(
      sql.raw(`select count(*)::int as n from ${table}`),
    );
    result[table] = rows.rows[0]!.n;
  }
  return result;
}

describe("seedDev", () => {
  it("creates an admin, three invites, and a project per starter, and is idempotent", async () => {
    const starters = readStarters().map((st) => ({
      slug: st.slug,
      name: st.name,
      files: loadStarterFiles(st.slug),
    }));
    await seedDev(t.db, s.storage, starters);
    const first = await counts();
    expect(first).toEqual({ users: 1, invites: 3, projects: 3, snapshots: 3 });

    await seedDev(t.db, s.storage, starters);
    expect(await counts()).toEqual(first);

    const journal = await t.db.execute<{ key: string }>(
      sql`select s.storage_key as key from projects p join snapshots s on s.id = p.current_snapshot_id where p.starter_slug = 'journal'`,
    );
    const files = await s.storage.getSnapshot(journal.rows[0]!.key);
    expect(files["src/navigation.tsx"]).toContain("EntriesScreen");
  });
});
