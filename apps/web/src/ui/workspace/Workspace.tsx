"use client";

// The workspace: toolbar (grows in 5.7), chat (5.2), preview (5.3). Follows the project's
// SSE stream and resyncs the stored state from the API when a build finishes.
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/src/server/workspace";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import { applyDelta, applyEvent, fromServer, isActive, type ClientState } from "./state";

export function Workspace({ initial }: { initial: WorkspaceState }) {
  const [state, setState] = useState<ClientState>(() => fromServer(initial));
  const stateRef = useRef(state);
  stateRef.current = state;
  const projectId = initial.project.id;

  const resync = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}`, { cache: "no-store" });
    if (!response.ok) return;
    const fresh = (await response.json()) as WorkspaceState;
    setState((current) => {
      // Keep the live progress; take the stored messages, generations, and project.
      const next = fromServer(fresh);
      return {
        ...next,
        progress: { ...next.progress, ...current.progress },
        streaming: current.streaming,
        lastEventId: Math.max(next.lastEventId, current.lastEventId),
      };
    });
  }, [projectId]);

  useEffect(() => {
    const source = new EventSource(
      `/api/projects/${projectId}/stream?after=${stateRef.current.lastEventId}`,
    );
    const onEvent = (message: MessageEvent<string>) => {
      const data = JSON.parse(message.data) as {
        id: number;
        type: string;
        generationId: string | null;
        payload: Record<string, unknown>;
      };
      setState((current) => applyEvent(current, data));
      if (data.type === "plan_ready" || data.type === "finished" || data.type === "preview_updated")
        void resync();
    };
    for (const type of [
      "plan_ready",
      "files_written",
      "types_checked",
      "typecheck_failed",
      "preview_bundled",
      "bundle_failed",
      "repair_started",
      "snapshot_created",
      "finished",
      "preview_updated",
    ])
      source.addEventListener(type, onEvent as EventListener);
    source.addEventListener("delta", ((message: MessageEvent<string>) => {
      const { generationId, text } = JSON.parse(message.data) as {
        generationId: string;
        text: string;
      };
      setState((current) => applyDelta(current, generationId, text));
    }) as EventListener);
    return () => source.close();
  }, [projectId, resync]);

  const active = state.generations.find(isActive);

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href="/" aria-label="Back" className="rounded-md p-1.5 text-muted hover:bg-line/60">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="text-[16px] font-semibold">{state.project.name}</h1>
        <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Expo +
          TypeScript
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Chat"
          className="flex w-full min-w-0 flex-col border-r border-line bg-surface lg:w-[420px] lg:shrink-0"
        >
          <ChatPanel
            state={state}
            active={active}
            onSent={(message, generation) =>
              setState((current) => ({
                ...current,
                messages: [...current.messages, message],
                generations: [...current.generations, generation],
              }))
            }
            onResync={resync}
          />
        </section>
        <section aria-label="Preview" className="hidden min-w-0 flex-1 flex-col lg:flex">
          <PreviewPanel
            projectId={projectId}
            snapshotId={state.project.currentSnapshotId}
            building={Boolean(active)}
            phoneVerified={false}
          />
        </section>
      </div>
    </div>
  );
}
