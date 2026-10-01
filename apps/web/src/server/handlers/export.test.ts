import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { readExportZip } from "@buildly/exporter";
import { loadStarterFiles } from "@buildly/starters";
import { createHarness, type Harness } from "../testing";
import { exportProject } from "./export";
import { createProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

async function projectWithJournal(cookie: string) {
  const created = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name: "Export me" } }),
    h.deps,
  );
  const { id } = (await created.json()) as { id: string };
  const snapshot = await createSnapshot(h.t.db, h.storage, {
    projectId: id,
    files: loadStarterFiles("journal"),
    parentId: null,
  });
  await h.t.db
    .update(schema.projects)
    .set({ currentSnapshotId: snapshot.id })
    .where(eq(schema.projects.id, id));
  return id;
}

describe("POST /api/projects/:id/export", () => {
  it("stores the ZIP, returns a signed URL that downloads it, and records export.created with its size", async () => {
    const { user, cookie } = await h.signIn("export@example.com");
    const id = await projectWithJournal(cookie);
    const response = await exportProject(
      h.request("POST", `/api/projects/${id}/export`, { cookie }),
      h.deps,
      id,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; bytes: number; exportId: string };
    expect(body.url).toContain(`exports/${id}/${body.exportId}.zip`);

    const downloaded = new Uint8Array(await (await fetch(body.url)).arrayBuffer());
    expect(downloaded.byteLength).toBe(body.bytes);
    const [event] = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(
        and(
          eq(schema.analyticsEvents.projectId, id),
          eq(schema.analyticsEvents.name, "export.created"),
        ),
      );
    expect(event?.props).toEqual({ project_id: id, zip_bytes: downloaded.byteLength });
    expect(event?.userId).toBe(user.id);

    const files = readExportZip(downloaded);
    expect(files["README.md"]).toContain("# Export me");
    expect(files["README.md"]).toContain("Made with Buildly");
    expect(JSON.parse(files["app.json"]!)).toMatchObject({ expo: { name: "Export me" } });
    expect(files["src/screens/EntriesScreen.tsx"]).toBeDefined();
    const exports = await h.t.db
      .select()
      .from(schema.usageEvents)
      .where(and(eq(schema.usageEvents.userId, user.id), eq(schema.usageEvents.type, "export")));
    expect(exports).toHaveLength(1);
  });

  it("refuses a project without a snapshot", async () => {
    const { cookie } = await h.signIn("export-empty@example.com");
    const created = await createProject(
      h.request("POST", "/api/projects", { cookie, body: { name: "Empty" } }),
      h.deps,
    );
    const { id } = (await created.json()) as { id: string };
    const response = await exportProject(
      h.request("POST", `/api/projects/${id}/export`, { cookie }),
      h.deps,
      id,
    );
    expect(response.status).toBe(409);
  });
});
