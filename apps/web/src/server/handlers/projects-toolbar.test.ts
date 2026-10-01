import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { createProject, listSnapshots, renameProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

async function newProject(cookie: string, name = "App") {
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name } }),
    h.deps,
  );
  return ((await response.json()) as { id: string }).id;
}

describe("PATCH /api/projects/:id", () => {
  it("renames the owner's project and refuses bad names and other users", async () => {
    const { cookie } = await h.signIn("rename@example.com");
    const other = await h.signIn("rename-other@example.com");
    const id = await newProject(cookie, "Old name");
    const patch = (c: string, body: unknown) =>
      renameProject(h.request("PATCH", `/api/projects/${id}`, { cookie: c, body }), h.deps, id);
    const ok = await patch(cookie, { name: "  New name  " });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id, name: "New name" });
    const [row] = await h.t.db.select().from(schema.projects).where(eq(schema.projects.id, id));
    expect(row!.name).toBe("New name");
    expect((await patch(cookie, { name: "" })).status).toBe(400);
    expect((await patch(cookie, { name: "x".repeat(81) })).status).toBe(400);
    expect((await patch(other.cookie, { name: "Mine now" })).status).toBe(404);
  });
});

describe("GET /api/projects/:id/snapshots", () => {
  it("lists snapshots newest first with the current one flagged and the build's prompt", async () => {
    const { user, cookie } = await h.signIn("history@example.com");
    const id = await newProject(cookie);
    const [message] = await h.t.db
      .insert(schema.messages)
      .values({ projectId: id, role: "user", content: "A journal app" })
      .returning();
    const [generation] = await h.t.db
      .insert(schema.generations)
      .values({
        projectId: id,
        userId: user.id,
        kind: "initial",
        status: "succeeded",
        triggerMessageId: message!.id,
      })
      .returning();
    const first = await createSnapshot(h.t.db, h.storage, {
      projectId: id,
      files: { "a.ts": "1" },
      parentId: null,
      generationId: generation!.id,
    });
    const second = await createSnapshot(h.t.db, h.storage, {
      projectId: id,
      files: { "a.ts": "1", "b.ts": "2" },
      parentId: first.id,
    });
    await h.t.db
      .update(schema.projects)
      .set({ currentSnapshotId: second.id })
      .where(eq(schema.projects.id, id));

    const response = await listSnapshots(
      h.request("GET", `/api/projects/${id}/snapshots`, { cookie }),
      h.deps,
      id,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      current: boolean;
      label: string;
      fileCount: number;
      parentSnapshotId: string | null;
    }[];
    expect(body.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(body[0]).toMatchObject({
      current: true,
      label: "Restored version",
      fileCount: 2,
      parentSnapshotId: first.id,
    });
    expect(body[1]).toMatchObject({ current: false, label: "A journal app", fileCount: 1 });
  });
});
