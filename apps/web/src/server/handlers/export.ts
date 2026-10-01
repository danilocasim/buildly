// POST /api/projects/:id/export — builds the ZIP for the current snapshot (packages/exporter),
// stores it under exports/{projectId}/{exportId}.zip, and returns a signed download URL
// (TODO 6.3.2). Records an `export` usage event and `export.created` with the byte size.
import { randomUUID } from "node:crypto";
import foundation from "@buildly/foundation/dist/foundation-files.json";
import { analytics, projects, snapshots, usage } from "@buildly/db";
import { buildExportZip, ExportBlockedError } from "@buildly/exporter";
import { foundationManifestSchema } from "@buildly/shared";
import { exportKey } from "@buildly/storage";
import type { Deps } from "../deps";
import { errorJson, json } from "../http";
import { requireUser } from "../session";

export const EXPORT_URL_TTL_SECONDS = 10 * 60;

export async function exportProject(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const snapshot = project.currentSnapshotId
    ? await snapshots.get(deps.db, project.currentSnapshotId)
    : undefined;
  if (!snapshot)
    return errorJson(409, "no_snapshot", "Build the app or start from a starter before exporting.");

  let built: ReturnType<typeof buildExportZip>;
  try {
    built = buildExportZip({
      appName: project.name,
      plan: user.plan,
      projectFiles: await deps.storage.getSnapshot(snapshot.storageKey),
      foundationFiles: foundation.files,
      manifest: foundationManifestSchema.parse(foundation.manifest),
      readmeTemplate: foundation.exportReadme,
    });
  } catch (error) {
    if (error instanceof ExportBlockedError)
      return errorJson(422, "export_blocked", "The export was blocked by the secret guard.", {
        files: [...new Set(error.findings.map((f) => f.file))],
      });
    throw error;
  }
  const exportId = randomUUID();
  const key = exportKey(project.id, exportId);
  await deps.storage.putExport(key, built.zip);
  const url = await deps.storage.signedDownloadUrl(key, EXPORT_URL_TTL_SECONDS);
  await usage.record(deps.db, {
    userId: user.id,
    projectId: project.id,
    type: "export",
    occurredAt: deps.now(),
  });
  await analytics.track(
    deps.db,
    "export.created",
    { project_id: project.id, zip_bytes: built.zip.byteLength },
    { userId: user.id, projectId: project.id },
  );
  return json({ exportId, url, bytes: built.zip.byteLength, expiresIn: EXPORT_URL_TTL_SECONDS });
}
