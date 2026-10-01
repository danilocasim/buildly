"use client";

// Below the fold on Home: Recent apps (TODO 6.1.3) with Rename and Archive, or the starters
// (6.2.1); an invitation when the user has no apps yet.
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProjectIcon } from "../ProjectIcon";
import { StarterCard } from "./StarterCard";
import { errorMessage, type ProjectSummary, type StarterSummary } from "./types";

type Tab = "recent" | "starters";

export function HomeBrowse({
  projects,
  starters,
}: {
  projects: ProjectSummary[];
  starters: StarterSummary[];
}) {
  const [tab, setTab] = useState<Tab>("recent");
  const contentRef = useRef<HTMLDivElement>(null);
  const select = (next: Tab) => {
    setTab(next);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-line bg-bg px-6 lg:px-10">
        <nav aria-label="Browse" className="flex items-center gap-4 text-[15px]">
          <TabButton active={tab === "recent"} onClick={() => select("recent")}>
            Recent apps
          </TabButton>
          <span className="h-1.5 w-1.5 rounded-sm bg-accent" aria-hidden="true" />
          <TabButton active={tab === "starters"} onClick={() => select("starters")}>
            Starters
          </TabButton>
        </nav>
        <Link
          href="/starters"
          className="flex items-center gap-1 text-[15px] hover:text-accent-text"
        >
          Browse all <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div ref={contentRef} className="border-t border-line px-6 py-8 lg:px-10">
        {tab === "recent" ? (
          <RecentApps projects={projects} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="starter-grid">
            {starters.map((s) => (
              <StarterCard key={s.slug} starter={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function RecentApps({ projects: initial }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [error, setError] = useState<string>();
  useEffect(() => setProjects(initial), [initial]);

  async function patch(id: string, body: { name?: string; archived?: boolean }) {
    const response = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError(await errorMessage(response));
      return false;
    }
    const updated = (await response.json()) as { name: string; archived: boolean };
    setProjects((current) =>
      updated.archived
        ? current.filter((p) => p.id !== id)
        : current.map((p) => (p.id === id ? { ...p, name: updated.name } : p)),
    );
    router.refresh();
    return true;
  }

  if (projects.length === 0) {
    return (
      <div
        data-testid="recent-empty"
        className="rounded-card border border-dashed border-line px-6 py-10 text-center"
      >
        <p className="text-[15px] font-medium">No apps yet</p>
        <p className="mt-1 text-[13px] text-muted">
          Describe your first app above, or start from a starter.
        </p>
      </div>
    );
  }
  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="recent-grid">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} onPatch={patch} />
        ))}
      </div>
    </>
  );
}

function ProjectCard({
  project,
  onPatch,
}: {
  project: ProjectSummary;
  onPatch: (id: string, body: { name?: string; archived?: boolean }) => Promise<boolean>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function saveName() {
    setRenaming(false);
    const next = name.trim();
    if (!next || next === project.name) {
      setName(project.name);
      return;
    }
    if (!(await onPatch(project.id, { name: next }))) setName(project.name);
  }

  return (
    <div
      data-testid="project-card"
      data-project-id={project.id}
      className="relative flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/50"
    >
      <ProjectIcon starterSlug={project.starterSlug} />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <input
            autoFocus
            aria-label="Project name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setName(project.name);
                setRenaming(false);
              }
            }}
            className="w-full rounded-md border border-line bg-bg px-2 py-1 text-[14px] font-medium outline-none focus:border-accent"
          />
        ) : (
          <Link href={`/app/${project.id}`} className="block truncate text-[14px] font-medium">
            <span className="absolute inset-0" aria-hidden="true" />
            {project.name}
          </Link>
        )}
        <p className="text-[12px] text-muted">Updated {relativeTime(project.updatedAt)}</p>
      </div>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`More options for ${project.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="relative z-10 rounded-md p-1 text-muted hover:bg-line/60"
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 z-20 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-float"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setRenaming(true);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-line/50"
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void onPatch(project.id, { archived: true });
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-line/50"
            >
              Archive
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active ? "font-medium text-ink" : "text-muted hover:text-ink"}
    >
      {children}
    </button>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} d ago`;
  return new Date(iso).toLocaleDateString();
}
