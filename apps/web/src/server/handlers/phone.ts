// POST /api/projects/:id/phone — the user opened the Open on phone modal (TODO 5.4.1).
// Records preview.phone_opened and, when the project has a snapshot, enqueues a `preview`
// job: the worker pushes the current snapshot to the project's Snack session, creating the
// session (with the stored channel) if the worker has none, so the QR's URL is live when
// Expo Go connects. Returns the Expo Go URL once the project has a channel.
import { analytics, projects, queue } from "@buildly/db";
import { EVENTS } from "@buildly/shared";
import { expoGoUrlFor } from "@buildly/snack";
import type { Deps } from "../deps";
import { errorJson, json } from "../http";
import { requireUser } from "../session";

export async function openOnPhone(
  request: Request,
  deps: Deps,
  projectId: string,
  sdkVersion: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  await analytics.track(
    deps.db,
    EVENTS.previewPhoneOpened,
    { project_id: project.id },
    { userId: user.id, projectId: project.id },
  );
  if (project.currentSnapshotId) {
    await queue.enqueue(deps.db, { type: "preview", payload: { projectId: project.id } });
  }
  return json({
    url: project.snackSessionId ? expoGoUrlFor(project.snackSessionId, sdkVersion) : null,
    hasSnapshot: Boolean(project.currentSnapshotId),
  });
}
