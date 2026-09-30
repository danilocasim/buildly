"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  Code2,
  FileText,
  History,
  Home,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Target,
} from "lucide-react";
import { ProjectIcon } from "@/components/ProjectIcon";
import { ChatPanel } from "./ChatPanel";
import { CodeView } from "./CodeView";
import { OpenOnPhoneModal } from "./OpenOnPhoneModal";
import { PhoneFrame, type Viewport } from "./PhoneFrame";
import { ReadingTrackerApp } from "./ReadingTrackerApp";
import { SnapshotDrawer } from "./SnapshotDrawer";
import { workspaceScreens, type Project } from "@/lib/mock";

const screenIcons = [Home, FileText, Play, Target];

export interface WorkspaceInitial {
  tab?: "preview" | "code";
  phoneOpen?: boolean;
  historyOpen?: boolean;
}

export function Workspace({
  project,
  startBuilding,
  initial = {},
}: {
  project: Project;
  startBuilding: boolean;
  initial?: WorkspaceInitial;
}) {
  const [tab, setTab] = useState<"preview" | "code">(initial.tab ?? "preview");
  const [viewport, setViewport] = useState<Viewport>("large");
  const [screen, setScreen] = useState(workspaceScreens[0].name);
  const [phoneOpen, setPhoneOpen] = useState(initial.phoneOpen ?? false);
  const [historyOpen, setHistoryOpen] = useState(initial.historyOpen ?? false);
  const [building, setBuilding] = useState(startBuilding);
  const [name, setName] = useState(project.name);

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href="/" aria-label="Back" className="rounded-md p-1.5 text-muted hover:bg-line/60">
          <ChevronLeft size={20} />
        </Link>
        <ProjectIcon kind={project.icon} size="sm" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Project name"
          className="rounded-md bg-transparent px-1.5 py-1 text-[16px] font-semibold outline-none hover:bg-line/40 focus:bg-line/40"
          style={{ width: `${Math.max(name.length, 8)}ch` }}
        />
        <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Expo + TypeScript
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted hover:bg-line/50 hover:text-ink"
          >
            <History size={16} /> History
          </button>
          <button
            onClick={() => setPhoneOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[14px] font-medium hover:bg-bg"
          >
            <Smartphone size={16} /> Open on phone
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[14px] font-medium text-white hover:bg-accent-hover">
            <Code2 size={16} /> Export code
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <section className="flex w-[400px] shrink-0 flex-col border-r border-line bg-bg">
          <ChatPanel startBuilding={startBuilding} onBuildingChange={setBuilding} />
        </section>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-3">
            {(["preview", "code"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-4 py-3 text-[14px] capitalize ${tab === t ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
              >
                {t}
                {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-[12px]">
              <StatusChip label="Web" value={building ? "bundling…" : "bundled ✓"} tone={building ? "warn" : "ok"} />
              <StatusChip label="Phone" value="not verified" tone="muted" />
              {tab === "preview" && (
                <>
                  <span className="mx-1 h-5 w-px bg-line" />
                  <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-line/50 hover:text-ink">
                    <RefreshCw size={13} /> Refresh
                  </button>
                  <button className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-line/50 hover:text-ink">
                    <RotateCcw size={13} /> Reset demo data
                  </button>
                  <button
                    onClick={() => setViewport((v) => (v === "large" ? "small" : "large"))}
                    className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[13px] hover:bg-bg"
                  >
                    {viewport === "large" ? "Large phone" : "Small phone"} <ChevronDown size={13} />
                  </button>
                </>
              )}
            </div>
          </div>

          {tab === "preview" ? (
            <div className="flex min-h-0 flex-1">
              <aside className="w-[200px] shrink-0 px-4 pt-6">
                <p className="mb-2 px-2 text-[13px] font-medium">Screens</p>
                <ul className="space-y-0.5">
                  {workspaceScreens.map((s, i) => {
                    const Icon = screenIcons[i];
                    const active = s.name === screen;
                    return (
                      <li key={s.name}>
                        <button
                          onClick={() => setScreen(s.name)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                            active ? "bg-accent-subtle font-medium" : "text-ink/80 hover:bg-line/50"
                          }`}
                        >
                          <Icon size={15} className={active ? "text-accent" : "text-muted"} />
                          {s.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>
              <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden">
                <span className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-line/70 px-2.5 py-1 text-[11px] font-medium text-muted">
                  Web preview
                </span>
                <PhoneFrame viewport={viewport}>
                  <ReadingTrackerApp screen={screen} />
                </PhoneFrame>
                {building && (
                  <div className="absolute inset-0 flex items-center justify-center bg-bg/60 backdrop-blur-[1px]">
                    <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium shadow-card">
                      Showing last working version while the build runs
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 p-4">
              <CodeView />
            </div>
          )}
        </section>

        {historyOpen && <SnapshotDrawer onClose={() => setHistoryOpen(false)} />}
      </div>

      {phoneOpen && <OpenOnPhoneModal onClose={() => setPhoneOpen(false)} />}
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "muted" }) {
  const cls = {
    ok: "bg-success-subtle text-success",
    warn: "bg-warn-subtle text-warn",
    muted: "bg-line/60 text-muted",
  }[tone];
  return (
    <span className={`rounded-full px-2.5 py-1 font-medium ${cls}`}>
      {label}: {value}
    </span>
  );
}
