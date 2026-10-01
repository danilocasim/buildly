import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOfMonthUtc } from "@buildly/shared";
import { findOrCreateUser, normalizeEmail } from "./auth";
import { isRollback } from "./client";
import { generations, projects, snapshots, usage } from "./queries";
import { projects as projectsTable, users } from "./schema";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.cleanup());

async function user(email: string) {
  const [row] = await t.db.insert(users).values({ email }).returning();
  return row!;
}
async function project(userId: string, name = "App") {
  const [row] = await t.db.insert(projectsTable).values({ userId, name }).returning();
  return row!;
}

describe("projects", () => {
  it("getForUser returns only the owner's non-archived project", async () => {
    const alice = await user("alice@example.com");
    const bob = await user("bob@example.com");
    const p = await project(alice.id);
    expect((await projects.getForUser(t.db, alice.id, p.id))?.id).toBe(p.id);
    expect(await projects.getForUser(t.db, bob.id, p.id)).toBeUndefined();
    await t.db.update(projectsTable).set({ archivedAt: new Date() });
    expect(await projects.getForUser(t.db, alice.id, p.id)).toBeUndefined();
    expect(await projects.countActiveForUser(t.db, alice.id)).toBe(0);
  });
});

describe("snapshots", () => {
  it("creates a row with a parent chain", async () => {
    const u = await user("snap@example.com");
    const p = await project(u.id);
    const first = await snapshots.create(t.db, {
      projectId: p.id,
      parentSnapshotId: null,
      storageKey: "k1",
      fileCount: 3,
      schemaVersion: 1,
    });
    const second = await snapshots.create(t.db, {
      projectId: p.id,
      parentSnapshotId: first.id,
      storageKey: "k2",
      fileCount: 4,
      schemaVersion: 1,
    });
    expect((await snapshots.get(t.db, second.id))?.parentSnapshotId).toBe(first.id);
  });
});

describe("generations.startExclusive", () => {
  it("two concurrent starts yield one success and one conflict", async () => {
    const u = await user("race@example.com");
    const p = await project(u.id);
    const results = await Promise.all([
      generations.startExclusive(t.db, { projectId: p.id, userId: u.id, kind: "initial" }),
      generations.startExclusive(t.db, { projectId: p.id, userId: u.id, kind: "initial" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, error: expect.objectContaining({ code: "generation_active" }) },
    ]);
  });

  it("allows a new generation once the previous one is terminal", async () => {
    const u = await user("serial@example.com");
    const p = await project(u.id);
    const first = await generations.startExclusive(t.db, {
      projectId: p.id,
      userId: u.id,
      kind: "initial",
    });
    if (!first.ok) throw new Error("expected ok");
    const { generations: table } = await import("./schema");
    const { eq } = await import("drizzle-orm");
    await t.db.update(table).set({ status: "succeeded" }).where(eq(table.id, first.value.id));
    expect(
      (await generations.startExclusive(t.db, { projectId: p.id, userId: u.id, kind: "edit" })).ok,
    ).toBe(true);
  });
});

describe("usage", () => {
  it("counts builds in the current UTC month only", async () => {
    const u = await user("usage@example.com");
    const now = new Date("2026-10-15T12:00:00Z");
    await usage.record(t.db, {
      userId: u.id,
      type: "build",
      occurredAt: new Date("2026-09-30T23:59:59Z"),
    });
    await usage.record(t.db, {
      userId: u.id,
      type: "build",
      occurredAt: new Date("2026-10-01T00:00:00Z"),
    });
    await usage.record(t.db, {
      userId: u.id,
      type: "build",
      quantity: 2,
      occurredAt: new Date("2026-10-10T08:00:00Z"),
    });
    await usage.record(t.db, {
      userId: u.id,
      type: "export",
      occurredAt: new Date("2026-10-11T08:00:00Z"),
    });
    expect(await usage.countBuildsThisMonth(t.db, u.id, now)).toBe(3);
    expect(startOfMonthUtc(now).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("transactions", () => {
  it("isRollback recognizes tx.rollback() and nothing else", async () => {
    const rolledBack = await t.db
      .transaction((tx) => {
        tx.rollback();
        return Promise.resolve();
      })
      .catch((error: unknown) => error);
    expect(isRollback(rolledBack)).toBe(true);
    expect(isRollback(new Error("Rollback"))).toBe(false);
  });

  it("projects.lock holds the row until the transaction ends", async () => {
    const owner = await user("locker@example.com");
    const p = await project(owner.id);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = t.db.transaction(async (tx) => {
      expect((await projects.lock(tx, p.id))?.id).toBe(p.id);
      locked();
      await held;
    });
    await isLocked;
    const order: string[] = [];
    const waiter = t.db.transaction(async (tx) => {
      await projects.lock(tx, p.id);
      order.push("waiter");
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    order.push("released");
    release();
    await Promise.all([holder, waiter]);
    expect(order).toEqual(["released", "waiter"]);
  });
});

describe("one account per email (7.2.4)", () => {
  it("rejects a duplicate users.email with a unique violation", async () => {
    await user("dup@example.com");
    const error = await t.db
      .insert(users)
      .values({ email: "dup@example.com" })
      .then(() => null)
      .catch((e: unknown) => e as { cause?: { code?: string; constraint?: string } });
    expect(error?.cause?.code).toBe("23505");
    expect(error?.cause?.constraint).toBe("users_email_unique");
  });

  it("sign-in normalizes the email, so case and spacing variants reach the same account", async () => {
    const now = new Date();
    const first = await findOrCreateUser(t.db, normalizeEmail(" Case@Example.com"), now);
    const second = await findOrCreateUser(t.db, normalizeEmail("case@example.COM "), now);
    expect(second.id).toBe(first.id);
  });
});
