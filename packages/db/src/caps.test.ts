import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recheckBuildCaps } from "./caps";
import { generations, projects, users } from "./schema";
import { usage } from "./queries";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

const now = new Date("2026-10-15T12:00:00Z");

async function scenario(email: string, buildsRecorded: number) {
  const [u] = await t.db.insert(users).values({ email }).returning();
  const [p] = await t.db.insert(projects).values({ userId: u!.id, name: "App" }).returning();
  const [g] = await t.db
    .insert(generations)
    .values({ projectId: p!.id, userId: u!.id, kind: "initial" })
    .returning();
  for (let i = 0; i < buildsRecorded; i++) {
    await usage.record(t.db, {
      userId: u!.id,
      type: "build",
      occurredAt: new Date(`2026-10-0${1 + (i % 9)}T00:00:00Z`),
    });
  }
  return g!.id;
}

describe("recheckBuildCaps on claim", () => {
  it("passes the 15th build (already recorded) of a Free month", async () => {
    expect((await recheckBuildCaps(t.db, await scenario("fifteen@example.com", 15), now)).ok).toBe(
      true,
    );
  });

  it("refuses a 16th build that slipped past the API check in a race", async () => {
    const result = await recheckBuildCaps(t.db, await scenario("sixteen@example.com", 16), now);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "monthly_builds", status: 429 }),
    });
  });
});
