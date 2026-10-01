// GET /api/projects/:id/preview — what the workspace's web preview needs (TODO 5.3.1): the
// current snapshot's files assembled exactly as a Snack session receives them, the pinned
// dependencies, the SDK version, and the self-hosted player URL. The browser feeds these to
// its own snack-sdk instance, which drives the player iframe over postMessage.
//
// POST /api/projects/:id/track — preview analytics from the browser (preview.* only).
import { desc, eq } from "drizzle-orm";
import { analytics, projects, schema, snapshots } from "@buildly/db";
// The bundled route cannot read the foundation package's directory (Turbopack rejects its
// `new URL("..", import.meta.url)`), so it uses the committed JSON the digest script emits.
import foundation from "@buildly/foundation/dist/foundation-files.json";
import { EVENTS, foundationManifestSchema } from "@buildly/shared";
import { assembleSnackFiles, expoGoUrlFor, snackDependencies } from "@buildly/snack";
import { z } from "zod";
import type { Deps } from "../deps";
import { errorJson, json, readJson } from "../http";
import { requireUser } from "../session";

export async function getPreview(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const manifest = foundationManifestSchema.parse(foundation.manifest);
  const [latest] = await deps.db
    .select({ status: schema.generations.status })
    .from(schema.generations)
    .where(eq(schema.generations.projectId, projectId))
    .orderBy(desc(schema.generations.createdAt))
    .limit(1);

  let files: Record<string, string> | null = null;
  if (project.currentSnapshotId) {
    const snapshot = await snapshots.get(deps.db, project.currentSnapshotId);
    if (snapshot) {
      files = assembleSnackFiles(
        foundation.files,
        { id: project.id, name: project.name },
        await deps.storage.getSnapshot(snapshot.storageKey),
      );
    }
  }
  return json({
    snapshotId: files ? project.currentSnapshotId : null,
    files,
    dependencies: snackDependencies(manifest),
    sdkVersion: manifest.sdkVersion,
    webPlayerURL: deps.webPlayerURL ?? null,
    channel: project.snackSessionId,
    expoGoUrl: project.snackSessionId
      ? expoGoUrlFor(project.snackSessionId, manifest.sdkVersion)
      : null,
    buildStatus: latest?.status ?? null,
  });
}

const PREVIEW_EVENTS = new Set<string>([
  EVENTS.previewWebLoaded,
  EVENTS.previewPhoneOpened,
  EVENTS.previewResetDemoData,
]);
const trackSchema = z.object({
  name: z.string(),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function trackPreview(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const parsed = trackSchema.safeParse(await readJson(request));
  if (!parsed.success || !PREVIEW_EVENTS.has(parsed.data.name))
    return errorJson(400, "invalid_event", "Only preview events can be tracked here.");
  await analytics.track(
    deps.db,
    parsed.data.name as typeof EVENTS.previewWebLoaded,
    { project_id: project.id, ...parsed.data.props },
    { userId: user.id, projectId: project.id },
  );
  return json({ ok: true }, 202);
}
