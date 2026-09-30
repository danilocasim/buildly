"use client";

import { History, RotateCcw, X } from "lucide-react";
import { snapshots } from "@/lib/mock";

export function SnapshotDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="fade-up absolute inset-y-0 right-0 z-40 flex w-[360px] flex-col border-l border-line bg-surface shadow-float">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <History size={16} className="text-muted" /> Snapshot history
        </h2>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted hover:bg-line/60">
          <X size={18} />
        </button>
      </div>
      <p className="px-5 pt-4 text-[12px] text-muted">
        Every successful build saves an immutable snapshot. Restoring swaps the source and refreshes the preview. Restore is disabled while a build is running.
      </p>
      <ul className="flex-1 space-y-2 overflow-y-auto p-5">
        {snapshots.map((s) => (
          <li key={s.id} className={`rounded-xl border p-3.5 ${s.current ? "border-accent/40 bg-accent-subtle/40" : "border-line"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{s.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {s.ago} · <span className="font-mono">{s.id}</span>
                </p>
              </div>
              {s.current ? (
                <span className="shrink-0 rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success">Current</span>
              ) : (
                <button className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] font-medium hover:bg-bg">
                  <RotateCcw size={12} /> Restore
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
