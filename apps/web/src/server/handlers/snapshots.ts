import { eq } from "drizzle-orm";
import {
  analytics,
  createSnapshot,
  generations,
  isRollback,
  projects,
  queue,
  schema,
  snapshots,
} from "@buildly/db";
import type { Deps } from "../deps";
import { errorJson, json } from "../http";
import { requireUser } from "../session";

/**
 * POST /api/projects/:id/snapshots/:sid/restore — makes an earlier version current again.
 * Snapshots are immutable, so restore writes a new snapshot with the target's files
 * (parent: the current one), sets it current, and enqueues a `preview` job for the worker
 * to push it to the live Snack session. Refused with 409 while a build is active.
 */
export async function restoreSnapshot(
  request: Request,
  deps: Deps,
  projectId: string,
  snapshotId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const target = await snapshots.get(deps.db, snapshotId);
  if (!target || target.projectId !== project.id)
    return errorJson(404, "not_found", "Version not found.");
  const files = await deps.storage.getSnapshot(target.storageKey);

  let refused: Response | undefined;
  let written: string | undefined;
  const restored = await deps.db
    .transaction(async (tx) => {
      // Under the project lock no build can start until this commits (see postMessage).
      const locked = (await projects.lock(tx, project.id))!;
      if (await generations.hasActive(tx, project.id)) {
        refused = errorJson(
          409,
          "generation_active",
          "A build is running. Restore a version after it finishes or is cancelled.",
        );
        tx.rollback();
      }
      const snapshot = await createSnapshot(tx, deps.storage, {
        projectId: project.id,
        files,
        parentId: locked.currentSnapshotId,
      });
      written = snapshot.storageKey;
      await tx
        .update(schema.projects)
        .set({ currentSnapshotId: snapshot.id, updatedAt: deps.now() })
        .where(eq(schema.projects.id, project.id));
      await queue.enqueue(tx, { type: "preview", payload: { projectId: project.id } });
      await analytics.track(
        tx,
        "snapshot.restored",
        { project_id: project.id, snapshot_id: target.id },
        { userId: user.id, projectId: project.id },
      );
      return snapshot;
    })
    .catch(async (error: unknown) => {
      // tx.rollback() throws to abort the transaction; `refused` says why.
      if (isRollback(error) && refused) return undefined;
      // The snapshot object was written but its row was rolled back.
      if (written) await deps.storage.delete(written).catch(() => undefined);
      throw error;
    });

  if (!restored) return refused!;
  return json({ snapshotId: restored.id, restoredFrom: target.id }, 201);
}
