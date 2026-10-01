import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { postMessage } from "./messages";
import { createProject } from "./projects";
import { restoreSnapshot } from "./snapshots";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

const V1 = {
  "src/screens/HomeScreen.tsx": "export const greeting = 'Hello, café ☕';\n",
  "src/data/models.ts": "export const schemaVersion = 1;\n",
};
const V2 = {
  "src/screens/HomeScreen.tsx": "export const greeting = 'Hi';\n",
  "src/data/models.ts": "export const schemaVersion = 2;\n",
  "src/screens/Extra.tsx": "export {};\n",
};

/** A project with two versions, the second one current. */
async function projectWithHistory(email: string) {
  const { user, cookie } = await h.signIn(email);
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name: "History" } }),
    h.deps,
  );
  const projectId = ((await response.json()) as { id: string }).id;
  const v1 = await createSnapshot(h.t.db, h.storage, { projectId, files: V1, parentId: null });
  const v2 = await createSnapshot(h.t.db, h.storage, { projectId, files: V2, parentId: v1.id });
  await h.t.db
    .update(schema.projects)
    .set({ currentSnapshotId: v2.id })
    .where(eq(schema.projects.id, projectId));
  return { user, cookie, projectId, v1, v2 };
}

const restore = (cookie: string, projectId: string, snapshotId: string) =>
  restoreSnapshot(
    h.request("POST", `/api/projects/${projectId}/snapshots/${snapshotId}/restore`, { cookie }),
    h.deps,
    projectId,
    snapshotId,
  );

async function currentSnapshotId(projectId: string) {
  const [row] = await h.t.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId));
  return row!.currentSnapshotId;
}

describe("POST /api/projects/:id/snapshots/:sid/restore", () => {
  it("creates a new current snapshot whose files equal the target's and queues a preview push", async () => {
    const { cookie, projectId, v1, v2 } = await projectWithHistory("restore@example.com");
    const response = await restore(cookie, projectId, v1.id);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { snapshotId: string; restoredFrom: string };
    expect(body.restoredFrom).toBe(v1.id);
    expect([v1.id, v2.id]).not.toContain(body.snapshotId);

    // A new row: parent is the version that was current, files byte-equal to the target.
    const [row] = await h.t.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.id, body.snapshotId));
    expect(row).toMatchObject({
      projectId,
      parentSnapshotId: v2.id,
      fileCount: 2,
      schemaVersion: 1,
    });
    const restored = await h.storage.getSnapshot(row!.storageKey);
    const target = await h.storage.getSnapshot(v1.storageKey);
    expect(Object.keys(restored).sort()).toEqual(Object.keys(target).sort());
    for (const [path, contents] of Object.entries(target)) {
      expect(Buffer.from(restored[path]!).equals(Buffer.from(contents))).toBe(true);
    }
    expect(await currentSnapshotId(projectId)).toBe(body.snapshotId);

    const jobs = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.type, "preview"));
    expect(jobs.map((j) => j.payload)).toContainEqual({ projectId });
    const [event] = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(
        and(
          eq(schema.analyticsEvents.projectId, projectId),
          eq(schema.analyticsEvents.name, "snapshot.restored"),
        ),
      );
    expect(event?.props).toEqual({ project_id: projectId, snapshot_id: v1.id });

    // The next build starts from the restored version.
    const built = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "Add a settings screen" },
      }),
      h.deps,
      projectId,
    );
    const { generationId } = (await built.json()) as { generationId: string };
    const [generation] = await h.t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, generationId));
    expect(generation).toMatchObject({ kind: "edit", baseSnapshotId: body.snapshotId });
  });

  it("returns 409 while a build is active and changes nothing", async () => {
    const { user, cookie, projectId, v1, v2 } = await projectWithHistory("busy@example.com");
    await h.t.db
      .insert(schema.generations)
      .values({ projectId, userId: user.id, kind: "edit", status: "editing" });
    const before = await h.t.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.projectId, projectId));

    const response = await restore(cookie, projectId, v1.id);
    expect(response.status).toBe(409);
    expect(((await response.json()) as { code: string }).code).toBe("generation_active");
    const after = await h.t.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.projectId, projectId));
    expect(after).toHaveLength(before.length);
    expect(await currentSnapshotId(projectId)).toBe(v2.id);
  });

  it("returns 404 for another user's project or a version from another project", async () => {
    const owner = await projectWithHistory("owner@example.com");
    const other = await projectWithHistory("other@example.com");
    expect((await restore(other.cookie, owner.projectId, owner.v1.id)).status).toBe(404);
    expect((await restore(other.cookie, other.projectId, owner.v1.id)).status).toBe(404);
    expect(await currentSnapshotId(owner.projectId)).toBe(owner.v2.id);
  });

  it("requires a session", async () => {
    const { projectId, v1 } = await projectWithHistory("anon@example.com");
    expect((await restore("", projectId, v1.id)).status).toBe(401);
  });
});
