"use client";

// Snapshot history (TODO 5.7.2): every successful build and restore is an immutable
// snapshot; Restore writes a new one with the chosen files and refreshes the workspace.
import { History, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export interface SnapshotEntry {
  id: string;
  parentSnapshotId: string | null;
  createdAt: string;
  fileCount: number;
  current: boolean;
  label: string;
  kind: string;
}

export function SnapshotDrawer({
  projectId,
  building,
  onClose,
  onRestored,
}: {
  projectId: string;
  building: boolean;
  onClose: () => void;
  onRestored: (snapshotId: string) => Promise<void>;
}) {
  const [entries, setEntries] = useState<SnapshotEntry[]>();
  const [error, setError] = useState<string>();
  const [restoring, setRestoring] = useState<string>();

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/snapshots`, { cache: "no-store" });
    if (response.ok) setEntries((await response.json()) as SnapshotEntry[]);
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function restore(id: string) {
    setRestoring(id);
    setError(undefined);
    try {
      const response = await fetch(`/api/projects/${projectId}/snapshots/${id}/restore`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        snapshotId?: string;
        message?: string;
      };
      if (!response.ok || !body.snapshotId) {
        setError(body.message ?? "Could not restore this version.");
        return;
      }
      await onRestored(body.snapshotId);
      await load();
    } finally {
      setRestoring(undefined);
    }
  }

  return (
    <aside
      role="dialog"
      aria-label="Snapshot history"
      data-testid="history-drawer"
      className="absolute inset-y-0 right-0 z-40 flex w-[360px] max-w-full flex-col border-l border-line bg-surface shadow-float"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <History size={16} className="text-muted" aria-hidden="true" /> Snapshot history
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted hover:bg-line/60"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="px-5 pt-4 text-[12px] text-muted">
        Every successful build saves an immutable snapshot. Restoring swaps the source and refreshes
        the preview. Restore is disabled while a build is running.
      </p>
      {error && (
        <p role="alert" className="px-5 pt-3 text-[12px] text-danger">
          {error}
        </p>
      )}
      <ul className="scroll-thin flex-1 space-y-2 overflow-y-auto p-5" data-testid="history-list">
        {entries?.length === 0 && <li className="text-[13px] text-muted">No versions yet.</li>}
        {entries?.map((entry) => (
          <li
            key={entry.id}
            data-testid="history-entry"
            data-snapshot-id={entry.id}
            data-current={entry.current}
            className={`rounded-xl border p-3.5 ${entry.current ? "border-accent/40 bg-accent-subtle/40" : "border-line"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{entry.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>{" "}
                  · {entry.fileCount} files ·{" "}
                  <span className="font-mono">{entry.id.slice(0, 8)}</span>
                </p>
              </div>
              {entry.current ? (
                <span className="shrink-0 rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success">
                  Current
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void restore(entry.id)}
                  disabled={building || restoring !== undefined}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-medium hover:bg-bg disabled:opacity-50"
                >
                  <RotateCcw size={12} aria-hidden="true" />{" "}
                  {restoring === entry.id ? "Restoring…" : "Restore"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
