import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSnapshot, schema } from "@buildly/db";
import { loadStarterFiles } from "@buildly/starters";
import { createHarness, type Harness } from "../testing";
import { getPreview, trackPreview } from "./preview";
import { createProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

async function newProject(cookie: string) {
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name: "Preview app" } }),
    h.deps,
  );
  return ((await response.json()) as { id: string }).id;
}

describe("GET /api/projects/:id/preview", () => {
  it("returns the current snapshot assembled as Snack files, the dependencies, and the player", async () => {
    const { cookie } = await h.signIn("preview@example.com");
    const projectId = await newProject(cookie);
    const journal = loadStarterFiles("journal");
    const snapshot = await createSnapshot(h.t.db, h.storage, {
      projectId,
      files: journal,
      parentId: null,
    });
    await h.t.db
      .update(schema.projects)
      .set({ currentSnapshotId: snapshot.id, snackSessionId: "chan-1" })
      .where(eq(schema.projects.id, projectId));

    const response = await getPreview(
      h.request("GET", `/api/projects/${projectId}/preview`, { cookie }),
      h.deps,
      projectId,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      snapshotId: string;
      files: Record<string, string>;
      dependencies: Record<string, { version: string }>;
      sdkVersion: string;
      webPlayerURL: string;
      channel: string;
    };
    expect(body.snapshotId).toBe(snapshot.id);
    expect(body.sdkVersion).toBe("54.0.0");
    expect(body.webPlayerURL).toBe("https://player.example.test/v2/%%SDK_VERSION%%");
    expect(body.channel).toBe("chan-1");
    // Foundation + project files, app.json with the project's name and slug, no tsconfig.
    expect(body.files["App.tsx"]).toBeDefined();
    expect(body.files["src/screens/EntriesScreen.tsx"]).toBe(
      journal["src/screens/EntriesScreen.tsx"],
    );
    expect(JSON.parse(body.files["app.json"]!)).toMatchObject({
      expo: { name: "Preview app", slug: `buildly-${projectId}` },
    });
    expect(body.files["tsconfig.json"]).toBeUndefined();
    expect(Object.keys(body.dependencies)).not.toContain("react-native");
    expect(body.dependencies["@react-navigation/native"]).toBeDefined();
  });

  it("has no files before the first snapshot", async () => {
    const { cookie } = await h.signIn("empty-preview@example.com");
    const projectId = await newProject(cookie);
    const response = await getPreview(
      h.request("GET", `/api/projects/${projectId}/preview`, { cookie }),
      h.deps,
      projectId,
    );
    expect(await response.json()).toMatchObject({ snapshotId: null, files: null });
  });
});

describe("POST /api/projects/:id/track", () => {
  it("records preview events for the project and refuses anything else", async () => {
    const { user, cookie } = await h.signIn("track@example.com");
    const projectId = await newProject(cookie);
    const post = (body: unknown) =>
      trackPreview(
        h.request("POST", `/api/projects/${projectId}/track`, { cookie, body }),
        h.deps,
        projectId,
      );
    expect((await post({ name: "preview.reset_demo_data" })).status).toBe(202);
    expect((await post({ name: "preview.web_loaded", props: { load_ms: 1200 } })).status).toBe(202);
    expect((await post({ name: "build.started" })).status).toBe(400);
    const rows = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.projectId, projectId));
    expect(rows.map((r) => r.name).sort()).toEqual([
      "preview.reset_demo_data",
      "preview.web_loaded",
      "project.created",
    ]);
    expect(rows.find((r) => r.name === "preview.web_loaded")).toMatchObject({
      userId: user.id,
      props: { project_id: projectId, load_ms: 1200 },
    });
  });
});
