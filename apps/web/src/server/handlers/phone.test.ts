import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { openOnPhone } from "./phone";
import { createProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

async function newProject(cookie: string) {
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name: "Phone app" } }),
    h.deps,
  );
  return ((await response.json()) as { id: string }).id;
}

describe("POST /api/projects/:id/phone", () => {
  it("tracks the opening, queues a preview push, and returns the session's Expo Go URL", async () => {
    const { cookie } = await h.signIn("phone@example.com");
    const projectId = await newProject(cookie);
    const snapshot = await createSnapshot(h.t.db, h.storage, {
      projectId,
      files: { "src/navigation.tsx": "export {};\n" },
      parentId: null,
    });
    await h.t.db
      .update(schema.projects)
      .set({ currentSnapshotId: snapshot.id, snackSessionId: "0123456789abcdef" })
      .where(eq(schema.projects.id, projectId));

    const response = await openOnPhone(
      h.request("POST", `/api/projects/${projectId}/phone`, { cookie }),
      h.deps,
      projectId,
      "54.0.0",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; hasSnapshot: boolean };
    expect(body.hasSnapshot).toBe(true);
    expect(body.url).toMatch(/^exp:\/\//);
    expect(body.url).toContain("snack-channel=0123456789abcdef");
    expect(body.url).toContain(encodeURIComponent("exposdk:54.0.0"));

    const jobs = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.type, "preview"));
    expect(jobs.map((j) => j.payload)).toContainEqual({ projectId });
    const events = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.projectId, projectId));
    expect(events.map((e) => e.name)).toContain("preview.phone_opened");
  });

  it("has no URL and queues nothing before the first snapshot", async () => {
    const { cookie } = await h.signIn("phone-empty@example.com");
    const projectId = await newProject(cookie);
    const body = (await (
      await openOnPhone(
        h.request("POST", `/api/projects/${projectId}/phone`, { cookie }),
        h.deps,
        projectId,
        "54.0.0",
      )
    ).json()) as { url: null; hasSnapshot: boolean };
    expect(body).toEqual({ url: null, hasSnapshot: false });
    const jobs = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.type, "preview"));
    expect(
      jobs.filter((j) => (j.payload as { projectId: string }).projectId === projectId),
    ).toEqual([]);
  });
});
