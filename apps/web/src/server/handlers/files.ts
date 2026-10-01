// GET /api/projects/:id/files — the code tab (TODO 5.5.1): the current snapshot's project
// files and the read-only foundation files, both as path → contents. Nothing here is
// editable; the model and restores are the only writers.
import foundation from "@buildly/foundation/dist/foundation-files.json";
import { projects, snapshots } from "@buildly/db";
import type { Deps } from "../deps";
import { errorJson, json } from "../http";
import { requireUser } from "../session";

export async function getFiles(request: Request, deps: Deps, projectId: string): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  let projectFiles: Record<string, string> = {};
  if (project.currentSnapshotId) {
    const snapshot = await snapshots.get(deps.db, project.currentSnapshotId);
    if (snapshot) projectFiles = await deps.storage.getSnapshot(snapshot.storageKey);
  }
  return json({
    snapshotId: project.currentSnapshotId,
    project: projectFiles,
    foundation: foundation.files,
  });
}
