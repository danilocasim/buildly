"use client";

// The workspace: toolbar (grows in 5.7), chat (5.2), preview (5.3). Follows the project's
// SSE stream and resyncs the stored state from the API when a build finishes.
import { ChevronLeft, Code2, History, Smartphone } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/src/server/workspace";
import { ChatPanel } from "./ChatPanel";
import { CodeView } from "./CodeView";
import { ProjectIcon } from "../ProjectIcon";
import { OpenOnPhoneModal } from "./OpenOnPhoneModal";
import { SnapshotDrawer } from "./SnapshotDrawer";
import { PreviewPanel } from "./PreviewPanel";
import { applyDelta, applyEvent, fromServer, isActive, type ClientState } from "./state";

export type WorkspaceTab = "preview" | "code";

export function Workspace({
  initial,
  initialTab = "preview",
}: {
  initial: WorkspaceState;
  initialTab?: WorkspaceTab;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
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

  // Toolbar (TODO 5.7.1): inline rename saved on blur; Export code calls the export API (6.3).
  const [name, setName] = useState(state.project.name);
  const [exportNote, setExportNote] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const saveName = useCallback(async () => {
    const next = name.trim();
    if (!next || next === state.project.name) {
      setName(state.project.name);
      return;
    }
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (response.ok) {
      const body = (await response.json()) as { name: string };
      setState((current) => ({ ...current, project: { ...current.project, name: body.name } }));
      setName(body.name);
    } else setName(state.project.name);
  }, [name, projectId, state.project.name]);
  const exportCode = useCallback(async () => {
    setExportNote(undefined);
    const response = await fetch(`/api/projects/${projectId}/export`, { method: "POST" });
    if (response.ok) {
      const body = (await response.json()) as { url?: string };
      if (body.url) window.location.assign(body.url);
    } else
      setExportNote(response.status === 404 ? "Export is not available yet." : "Export failed.");
  }, [projectId]);

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
        <ProjectIcon starterSlug={state.project.starterSlug} size="sm" />
        <h1 className="sr-only">{state.project.name}</h1>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(state.project.name);
              event.currentTarget.blur();
            }
          }}
          aria-label="Project name"
          maxLength={80}
          className="min-w-0 rounded-md bg-transparent px-1.5 py-1 text-[16px] font-semibold outline-none hover:bg-line/40 focus:bg-line/40"
          style={{ width: `${Math.min(Math.max(name.length, 8), 40)}ch` }}
        />
        <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Expo +
          TypeScript
        </span>
        <div className="ml-auto flex items-center gap-2">
          {exportNote && (
            <span role="status" className="text-[12px] text-muted">
              {exportNote}
            </span>
          )}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-line/50 hover:text-ink"
          >
            <History size={16} aria-hidden="true" /> History
          </button>
          <button
            type="button"
            onClick={() => void openOnPhone()}
            className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[14px] font-medium hover:bg-bg"
          >
            <Smartphone size={16} aria-hidden="true" /> Open on phone
          </button>
          <button
            type="button"
            onClick={() => void exportCode()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-ink hover:bg-accent-hover"
          >
            <Code2 size={16} aria-hidden="true" /> Export code
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

      <div className="relative flex min-h-0 flex-1">
        {historyOpen && (
          <SnapshotDrawer
            projectId={projectId}
            building={Boolean(active)}
            onClose={() => setHistoryOpen(false)}
            onRestored={async () => {
              await resync();
            }}
          />
        )}
        <section
          aria-label="Chat"
          className="flex w-full min-w-0 flex-col border-r border-line bg-surface md:w-[360px] md:shrink-0 lg:w-[420px]"
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
        <section aria-label="Preview" className="hidden min-w-0 flex-1 flex-col md:flex">
          <div
            role="tablist"
            aria-label="Workspace tabs"
            className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-3"
          >
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`relative px-4 py-3 text-[14px] capitalize ${tab === t ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
              >
                {t}
                {tab === t && (
                  <span
                    className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
          {tab === "preview" ? (
            <PreviewPanel
              projectId={projectId}
              snapshotId={state.project.currentSnapshotId}
              building={Boolean(active)}
              phoneVerified={phoneOpened}
              screens={state.screens}
            />
          ) : (
            <div className="min-h-0 flex-1 p-4">
              <CodeView projectId={projectId} snapshotId={state.project.currentSnapshotId} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
