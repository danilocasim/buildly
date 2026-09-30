"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { StarterCard } from "./StarterCard";
import { ProjectIcon } from "./ProjectIcon";
import { projects, starters } from "@/lib/mock";

type Tab = "recent" | "starters";

/** The bottom strip on Home (like the reference dashboard) plus the content it reveals below the fold. */
export function HomeBrowse() {
  const [tab, setTab] = useState<Tab>("recent");
  const contentRef = useRef<HTMLDivElement>(null);

  const select = (t: Tab) => {
    setTab(t);
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-line bg-bg px-10">
        <nav className="flex items-center gap-4 text-[15px]">
          <TabButton active={tab === "recent"} onClick={() => select("recent")}>
            Recent apps
          </TabButton>
          <span className="h-1.5 w-1.5 rounded-sm bg-accent" />
          <TabButton active={tab === "starters"} onClick={() => select("starters")}>
            Starters
          </TabButton>
        </nav>
        <Link href={tab === "starters" ? "/starters" : "/"} className="flex items-center gap-1 text-[15px] hover:text-accent">
          Browse all <ArrowUpRight size={16} />
        </Link>
      </div>

      <div ref={contentRef} className="border-t border-line px-10 py-8">
        {tab === "recent" ? (
          <div className="grid grid-cols-3 gap-4">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/app/${p.id}`}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-accent/50"
              >
                <ProjectIcon kind={p.icon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{p.name}</p>
                  <p className="text-[12px] text-muted">Updated {p.updatedAgo}</p>
                </div>
                <span className="rounded-md p-1 text-muted hover:bg-line/60" aria-label="More">
                  <MoreHorizontal size={18} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {starters.map((s) => (
              <StarterCard key={s.slug} starter={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={active ? "font-medium text-ink" : "text-muted hover:text-ink"}>
      {children}
    </button>
  );
}
