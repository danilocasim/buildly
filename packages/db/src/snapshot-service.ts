// Creates a snapshot: the file set goes to object storage first, then the row. A storage
// failure therefore never leaves a row pointing at nothing, and a failed insert deletes
// the object it just wrote.
import { randomUUID } from "node:crypto";
import { snapshotKey, type SnapshotFiles, type Storage } from "@buildly/storage";
import { snapshots, type Executor } from "./queries";

export type SnapshotStore = Pick<Storage, "putSnapshot" | "delete">;

/** `export const schemaVersion = N` from the project's src/data/models.ts, or 1. */
export function schemaVersionOf(files: SnapshotFiles): number {
  const match = /export\s+const\s+schemaVersion\s*=\s*(\d+)/.exec(
    files["src/data/models.ts"] ?? "",
  );
  return match ? Number(match[1]) : 1;
}

export async function createSnapshot(
  db: Executor,
  store: SnapshotStore,
  input: {
    projectId: string;
    files: SnapshotFiles;
    parentId: string | null;
    generationId?: string | null;
  },
) {
  const id = randomUUID();
  const storageKey = snapshotKey(input.projectId, id);
  await store.putSnapshot(storageKey, input.files);
  try {
    return await snapshots.create(db, {
      id,
      projectId: input.projectId,
      parentSnapshotId: input.parentId,
      storageKey,
      fileCount: Object.keys(input.files).length,
      schemaVersion: schemaVersionOf(input.files),
      createdByGenerationId: input.generationId ?? null,
    });
  } catch (error) {
    await store.delete(storageKey).catch(() => undefined);
    throw error;
  }
}
