import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { loadStarterFiles } from "@buildly/starters";
import { createHarness, type Harness } from "../testing";
import { getFiles } from "./files";
import { createProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

describe("GET /api/projects/:id/files", () => {
  it("returns the snapshot's project files and the foundation files", async () => {
    const { cookie } = await h.signIn("files@example.com");
    const created = await createProject(
      h.request("POST", "/api/projects", { cookie, body: { name: "Files" } }),
      h.deps,
    );
    const { id } = (await created.json()) as { id: string };
    const empty = (await (
      await getFiles(h.request("GET", `/api/projects/${id}/files`, { cookie }), h.deps, id)
    ).json()) as { snapshotId: null; project: Record<string, string> };
    expect(empty.snapshotId).toBeNull();
    expect(empty.project).toEqual({});

    const journal = loadStarterFiles("journal");
    const snapshot = await createSnapshot(h.t.db, h.storage, {
      projectId: id,
      files: journal,
      parentId: null,
    });
    await h.t.db
      .update(schema.projects)
      .set({ currentSnapshotId: snapshot.id })
      .where(eq(schema.projects.id, id));
    const body = (await (
      await getFiles(h.request("GET", `/api/projects/${id}/files`, { cookie }), h.deps, id)
    ).json()) as {
      snapshotId: string;
      project: Record<string, string>;
      foundation: Record<string, string>;
    };
    expect(body.snapshotId).toBe(snapshot.id);
    expect(body.project).toEqual(journal);
    expect(Object.keys(body.foundation)).toEqual(
      expect.arrayContaining(["App.tsx", "src/data/store.ts"]),
    );
    expect(body.foundation["src/navigation.tsx"]).toBeUndefined();
  });

  it("is private to the owner", async () => {
    const owner = await h.signIn("files-owner@example.com");
    const other = await h.signIn("files-other@example.com");
    const created = await createProject(
      h.request("POST", "/api/projects", { cookie: owner.cookie, body: { name: "Mine" } }),
      h.deps,
    );
    const { id } = (await created.json()) as { id: string };
    expect(
      (
        await getFiles(
          h.request("GET", `/api/projects/${id}/files`, { cookie: other.cookie }),
          h.deps,
          id,
        )
      ).status,
    ).toBe(404);
  });
});
