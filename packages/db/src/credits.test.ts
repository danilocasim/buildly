import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { balance, consumeForBuild, grant, paidByCredit } from "./credits";
import { generations, projects, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

async function userWithGenerations(email: string, count: number) {
  const [u] = await t.db.insert(users).values({ email }).returning();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const [p] = await t.db
      .insert(projects)
      .values({ userId: u!.id, name: `P${i}` })
      .returning();
    const [g] = await t.db
      .insert(generations)
      .values({ projectId: p!.id, userId: u!.id, kind: "initial" })
      .returning();
    ids.push(g!.id);
  }
  return { userId: u!.id, generationIds: ids };
}

describe("build credits", () => {
  it("grants add, builds spend one each, and spending stops at zero", async () => {
    const { userId, generationIds } = await userWithGenerations("topup@example.com", 3);
    expect(await balance(t.db, userId)).toBe(0);
    await grant(t.db, { userId, amount: 2, reason: "topup" });
    expect(await consumeForBuild(t.db, userId, generationIds[0]!)).toBe(true);
    expect(await consumeForBuild(t.db, userId, generationIds[1]!)).toBe(true);
    expect(await consumeForBuild(t.db, userId, generationIds[2]!)).toBe(false);
    expect(await balance(t.db, userId)).toBe(0);
    expect(await paidByCredit(t.db, generationIds[0]!)).toBe(true);
    expect(await paidByCredit(t.db, generationIds[2]!)).toBe(false);
  });

  it("two builds racing for the last credit: exactly one gets it", async () => {
    const { userId, generationIds } = await userWithGenerations("race@example.com", 2);
    await grant(t.db, { userId, amount: 1, reason: "grant", note: "beta" });
    const results = await Promise.all(
      generationIds.map((id) => t.db.transaction((tx) => consumeForBuild(tx, userId, id))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await balance(t.db, userId)).toBe(0);
  });

  it("refuses to grant zero or fractional credits", async () => {
    const { userId } = await userWithGenerations("bad@example.com", 0);
    await expect(grant(t.db, { userId, amount: 0, reason: "grant" })).rejects.toThrow();
    await expect(grant(t.db, { userId, amount: 1.5, reason: "grant" })).rejects.toThrow();
  });
});
