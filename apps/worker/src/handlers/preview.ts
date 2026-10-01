// Live preview updates (ARCHITECTURE.md §6): the project's Snack session receives the
// current snapshot after a successful build (TODO 4.6.1) and after a restore (4.6.2,
// via a `preview` job, since the sessions live in the worker process). The session's
// channel is stored in projects.snack_session_id so the Expo Go URL stays stable.
import { eq } from "drizzle-orm";
import { events, schema, type Db } from "@buildly/db";
import type { FileSet } from "@buildly/generator";
import type { Storage } from "@buildly/storage";
import type { JobHandler } from "../runner";

/** Pushes files to the project's live session; returns the session's channel. */
export type PreviewPusher = (
  project: { id: string; name: string; channel: string | null },
  files: FileSet,
) => Promise<{ channel: string }>;

export async function pushPreview(
  db: Db,
  preview: PreviewPusher,
  input: { projectId: string; snapshotId: string; files: FileSet },
): Promise<void> {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, input.projectId));
  if (!project) return;
  const { channel } = await preview(
    { id: project.id, name: project.name, channel: project.snackSessionId },
    input.files,
  );
  if (channel !== project.snackSessionId) {
    await db
      .update(schema.projects)
      .set({ snackSessionId: channel })
      .where(eq(schema.projects.id, project.id));
  }
  await events.publish(db, {
    projectId: project.id,
    type: "preview_updated",
    payload: { snapshotId: input.snapshotId },
  });
}

/** The `preview` job: pushes the project's current snapshot (enqueued by restore). */
export function createPreviewHandler(deps: {
  db: Db;
  storage: Pick<Storage, "getSnapshot">;
  preview: PreviewPusher;
}): JobHandler<{ projectId: string }> {
  return {
    timeoutMs: 60_000,
    async run(ctx) {
      const [project] = await deps.db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, ctx.payload.projectId));
      if (!project?.currentSnapshotId) return;
      const [snapshot] = await deps.db
        .select()
        .from(schema.snapshots)
        .where(eq(schema.snapshots.id, project.currentSnapshotId));
      if (!snapshot) return;
      const files = await deps.storage.getSnapshot(snapshot.storageKey);
      await pushPreview(deps.db, deps.preview, {
        projectId: project.id,
        snapshotId: snapshot.id,
        files,
      });
    },
  };
}
