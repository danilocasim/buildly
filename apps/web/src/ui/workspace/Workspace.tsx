"use client";

// The workspace: toolbar (grows in 5.7), chat (5.2), preview (5.3). Follows the project's
// SSE stream and resyncs the stored state from the API when a build finishes.
import { ChevronLeft, Smartphone } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/src/server/workspace";
import { ChatPanel } from "./ChatPanel";
import { OpenOnPhoneModal } from "./OpenOnPhoneModal";
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

  // Open on phone (TODO 5.4.1): the modal records the opening and asks the worker to push
  // the snapshot, so the session behind the QR is live; the URL arrives once a channel exists.
  const [phone, setPhone] = useState<{ open: boolean; url: string | null; hasSnapshot: boolean }>({
    open: false,
    url: null,
    hasSnapshot: false,
  });
  const [phoneOpened, setPhoneOpened] = useState(false);
  const openOnPhone = useCallback(async () => {
    setPhone((p) => ({ ...p, open: true }));
    setPhoneOpened(true);
    const response = await fetch(`/api/projects/${projectId}/phone`, { method: "POST" });
    if (response.ok) {
      const body = (await response.json()) as { url: string | null; hasSnapshot: boolean };
      setPhone((p) => ({ ...p, url: body.url, hasSnapshot: body.hasSnapshot }));
    }
  }, [projectId]);
  // A preview push can create the channel after the modal opened: ask again.
  useEffect(() => {
    if (!phone.open || phone.url) return;
    const timer = setInterval(() => {
      void fetch(`/api/projects/${projectId}/preview`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ expoGoUrl: string | null }>) : null))
        .then((data) => {
          if (data?.expoGoUrl) setPhone((p) => ({ ...p, url: data.expoGoUrl }));
        });
    }, 1500);
    return () => clearInterval(timer);
  }, [phone.open, phone.url, projectId]);

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
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openOnPhone()}
            className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[14px] font-medium hover:bg-bg"
          >
            <Smartphone size={16} aria-hidden="true" /> Open on phone
          </button>
        </div>
      </header>
      {phone.open && (
        <OpenOnPhoneModal
          url={phone.url}
          hasSnapshot={phone.hasSnapshot}
          onClose={() => setPhone((p) => ({ ...p, open: false }))}
        />
      )}

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
            phoneVerified={phoneOpened}
          />
        </section>
      </div>
    </div>
  );
}
