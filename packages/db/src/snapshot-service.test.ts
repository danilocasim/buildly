import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestStorage } from "@buildly/storage/testing";
import { projects, snapshots, users } from "./schema";
import { createSnapshot, schemaVersionOf } from "./snapshot-service";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
let s: Awaited<ReturnType<typeof createTestStorage>>;
let projectId: string;
beforeAll(async () => {
  [t, s] = await Promise.all([createTestDatabase(), createTestStorage()]);
  const [u] = await t.db.insert(users).values({ email: "snap@example.com" }).returning();
  const [p] = await t.db.insert(projects).values({ userId: u!.id, name: "Snap" }).returning();
  projectId = p!.id;
});
afterAll(async () => Promise.all([t?.cleanup(), s?.cleanup()]));

const files = {
  "src/data/models.ts": "export const schemaVersion = 3;\n",
  "src/navigation.tsx": "export {};\n",
};

describe("createSnapshot", () => {
  it("writes storage, then the row, with the schemaVersion from models.ts", async () => {
    const row = await createSnapshot(t.db, s.storage, { projectId, files, parentId: null });
    expect(row).toMatchObject({
      projectId,
      fileCount: 2,
      schemaVersion: 3,
      storageKey: `snapshots/${projectId}/${row.id}.json`,
    });
    expect(await s.storage.getSnapshot(row.storageKey)).toEqual(files);
  });

  it("inserts no row when storage throws", async () => {
    const before = await t.db.select().from(snapshots).where(eq(snapshots.projectId, projectId));
    const failing = {
      putSnapshot: vi.fn().mockRejectedValue(new Error("S3 down")),
      delete: vi.fn(),
    };
    await expect(
      createSnapshot(t.db, failing, { projectId, files, parentId: null }),
    ).rejects.toThrow("S3 down");
    const after = await t.db.select().from(snapshots).where(eq(snapshots.projectId, projectId));
    expect(after).toHaveLength(before.length);
  });

  it("deletes the stored object when the insert fails", async () => {
    const store = {
      putSnapshot: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      createSnapshot(t.db, store, { projectId: randomUUID(), files, parentId: null }),
    ).rejects.toThrow();
    expect(store.delete).toHaveBeenCalledWith(store.putSnapshot.mock.calls[0]![0]);
  });

  it("defaults schemaVersion to 1", () => {
    expect(schemaVersionOf({})).toBe(1);
  });
});
