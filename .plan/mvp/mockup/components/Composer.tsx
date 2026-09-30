"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, LayoutGrid, X } from "lucide-react";
import { starters, type Starter } from "@/lib/mock";

export function Composer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [starter, setStarter] = useState<Starter | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const canBuild = prompt.trim().length > 0 || starter !== null;

  const build = () => {
    if (!canBuild) return;
    router.push(starter ? `/app/${starter.slug}` : "/app/reading-tracker?building=1");
  };

  return (
    <div className="relative rounded-card border border-line bg-surface shadow-card">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build();
        }}
        placeholder="Describe your mobile app..."
        rows={3}
        className="w-full resize-none bg-transparent px-6 pt-5 pb-2 text-[17px] leading-relaxed outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="relative flex items-center gap-2">
          {starter ? (
            <span className="flex items-center gap-1.5 rounded-full bg-accent-subtle py-1 pl-3 pr-1.5 text-[13px] font-medium text-ink">
              {starter.name}
              <button
                onClick={() => setStarter(null)}
                aria-label="Remove starter"
                className="rounded-full p-0.5 text-muted hover:bg-white hover:text-ink"
              >
                <X size={13} />
              </button>
            </span>
          ) : (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink/80 hover:bg-line/50"
            >
              <LayoutGrid size={15} className="text-muted" />
              Choose starter
              <ChevronDown size={14} className="text-muted" />
            </button>
          )}
          {menuOpen && (
            <div className="fade-up absolute top-full left-0 z-10 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-float">
              {starters.map((s) => (
                <button
                  key={s.slug}
                  onClick={() => {
                    setStarter(s);
                    setMenuOpen(false);
                  }}
                  className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-accent-subtle"
                >
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="text-[12px] text-muted">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={build}
          disabled={!canBuild}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[14px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Build app
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
