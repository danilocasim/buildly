// TODO 6.1.2, 6.1.3, 6.2.2: creating projects from a prompt or a starter, and archiving.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, usage } from "@buildly/db";
import { loadStarterFiles } from "@buildly/starters";
import { createHarness, type Harness } from "../testing";
import { createProject, listProjects, nameFromPrompt, renameProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

const post = (cookie: string, body: unknown) =>
  createProject(h.request("POST", "/api/projects", { cookie, body }), h.deps);

describe("POST /api/projects with a prompt", () => {
  it("creates the project and its first build in one go", async () => {
    const { user, cookie } = await h.signIn("prompt@example.com");
    const response = await post(cookie, { prompt: "A journal app with tags and search." });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; generationId: string };
    expect(body.name).toBe("A journal app with tags and search");
    expect(body.generationId).toBeDefined();
    const [generation] = await h.t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, body.generationId));
    expect(generation).toMatchObject({ projectId: body.id, kind: "initial", status: "queued" });
    const messages = await h.t.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.projectId, body.id));
    expect(messages.map((m) => m.content)).toEqual(["A journal app with tags and search."]);
    expect(await usage.countBuildsThisMonth(h.t.db, user.id, h.clock.now)).toBe(1);
    const jobs = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.type, "generation"));
    expect(jobs.map((j) => j.payload)).toContainEqual({
      generationId: body.generationId,
      projectId: body.id,
    });
    const created = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.projectId, body.id));
    expect(created.map((e) => [e.name, e.props])).toContainEqual([
      "project.created",
      { source: "prompt" },
    ]);
  });

  it("refuses over the build cap before creating anything", async () => {
    const { user, cookie } = await h.signIn("capped-prompt@example.com");
    for (let i = 0; i < 10; i++)
      await usage.record(h.t.db, {
        userId: user.id,
        type: "build",
        occurredAt: new Date(h.clock.now.getTime() - (i + 1) * 60_000),
      });
    const response = await post(cookie, { prompt: "One more" });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { code: string }).code).toBe("hourly_builds");
    const rows = await h.t.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, user.id));
    expect(rows).toEqual([]);
  });
});

describe("POST /api/projects with a starter", () => {
  it("creates the project from the fixture files with a snapshot and no build (6.2.2)", async () => {
    const { user, cookie } = await h.signIn("starter@example.com");
    const before = await usage.countBuildsThisMonth(h.t.db, user.id, h.clock.now);
    const response = await post(cookie, { starterSlug: "journal" });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string; generationId?: string };
    expect(body.name).toBe("Journal");
    expect(body.generationId).toBeUndefined();
    const [project] = await h.t.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, body.id));
    expect(project!.starterSlug).toBe("journal");
    expect(project!.currentSnapshotId).not.toBeNull();
    const [snapshot] = await h.t.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.id, project!.currentSnapshotId!));
    expect(await h.storage.getSnapshot(snapshot!.storageKey)).toEqual(loadStarterFiles("journal"));
    expect(await usage.countBuildsThisMonth(h.t.db, user.id, h.clock.now)).toBe(before);
    const generations = await h.t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.projectId, body.id));
    expect(generations).toEqual([]);
    const jobs = await h.t.db.select().from(schema.jobs).where(eq(schema.jobs.type, "preview"));
    expect(jobs.map((j) => j.payload)).toContainEqual({ projectId: body.id });
    // 7.1.1: project.created carries the source and the starter slug.
    const created = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.projectId, body.id));
    expect(created.map((e) => [e.name, e.props])).toEqual([
      ["project.created", { source: "starter", starter_slug: "journal" }],
    ]);
  });

  it("a starter plus a prompt makes the prompt the first edit on the starter", async () => {
    const { cookie } = await h.signIn("starter-prompt@example.com");
    const response = await post(cookie, {
      starterSlug: "inventory",
      prompt: "Add a low-stock badge",
    });
    const body = (await response.json()) as { id: string; generationId: string };
    const [generation] = await h.t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, body.generationId));
    expect(generation!.kind).toBe("edit");
    expect(generation!.baseSnapshotId).not.toBeNull();
  });

  it("rejects an unknown starter", async () => {
    const { cookie } = await h.signIn("starter-unknown@example.com");
    expect((await post(cookie, { starterSlug: "nope" })).status).toBe(400);
  });
});

describe("PATCH /api/projects/:id archived", () => {
  it("archives a project out of the list (an archived project is no longer reachable)", async () => {
    const { cookie } = await h.signIn("archive@example.com");
    const { id } = (await (await post(cookie, { name: "Old app" })).json()) as { id: string };
    const patch = (body: unknown) =>
      renameProject(h.request("PATCH", `/api/projects/${id}`, { cookie, body }), h.deps, id);
    expect((await patch({})).status).toBe(400);
    expect(
      ((await (await patch({ archived: true })).json()) as { archived: boolean }).archived,
    ).toBe(true);
    const listed = (await (
      await listProjects(h.request("GET", "/api/projects", { cookie }), h.deps)
    ).json()) as { id: string }[];
    expect(listed.map((p) => p.id)).not.toContain(id);
    expect((await patch({ name: "Back" })).status).toBe(404);
  });
});

describe("nameFromPrompt", () => {
  it("takes the first sentence, capitalized, cut at a word boundary under 40 characters", () => {
    expect(nameFromPrompt("a journal app with tags and search. Also dark mode.")).toBe(
      "A journal app with tags and search",
    );
    expect(
      nameFromPrompt("Habit tracker with daily check-ins, streaks, and a history screen"),
    ).toBe("Habit tracker with daily check-ins,");
    expect(nameFromPrompt("   ")).toBe("Untitled app");
  });
});
