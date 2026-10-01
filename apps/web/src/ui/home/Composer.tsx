"use client";

// The Home composer (TODO 6.1.1): a prompt and/or a starter chip; Build app creates the
// project (and its first build) and opens the workspace. Errors keep the prompt (6.1.4).
import { ArrowRight, ChevronDown, LayoutGrid, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { errorMessage, type StarterSummary } from "./types";

export function Composer({ starters }: { starters: StarterSummary[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [starter, setStarter] = useState<StarterSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const menuRef = useRef<HTMLDivElement>(null);
  const canBuild = (prompt.trim().length > 0 || starter !== null) && !submitting;

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function build() {
    if (!canBuild) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          ...(starter ? { starterSlug: starter.slug } : {}),
        }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/app/${id}`);
    } catch {
      setError("Could not reach Buildly. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative rounded-card border border-line bg-surface shadow-card">
      <label htmlFor="home-prompt" className="sr-only">
        Describe your mobile app
      </label>
      <textarea
        id="home-prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void build();
        }}
        placeholder="Describe your mobile app..."
        rows={3}
        maxLength={8000}
        className="w-full resize-none bg-transparent px-6 pt-5 pb-2 text-[17px] leading-relaxed outline-none placeholder:text-faint"
      />
      {error && (
        <p role="alert" data-testid="composer-error" className="px-6 pb-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="relative flex items-center gap-2" ref={menuRef}>
          {starter ? (
            <span
              data-testid="starter-chip"
              className="flex items-center gap-1.5 rounded-full bg-accent-subtle py-1 pr-1.5 pl-3 text-[13px] font-medium text-ink"
            >
              {starter.name}
              <button
                type="button"
                onClick={() => setStarter(null)}
                aria-label="Remove starter"
                className="rounded-full p-0.5 text-muted hover:bg-white hover:text-ink"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink/80 hover:bg-line/50"
            >
              <LayoutGrid size={15} className="text-muted" aria-hidden="true" />
              Choose starter
              <ChevronDown size={14} className="text-muted" aria-hidden="true" />
            </button>
          )}
          {menuOpen && (
            <div
              role="menu"
              aria-label="Starters"
              className="absolute top-full left-0 z-10 mt-1 w-72 rounded-xl border border-line bg-surface p-1 shadow-float"
            >
              {starters.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  role="menuitem"
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
          type="button"
          onClick={() => void build()}
          disabled={!canBuild}
          className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[14px] font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Starting…" : "Build app"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
