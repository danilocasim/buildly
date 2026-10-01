"use client";

// A starter card (TODO 6.2.1): thumbnail, description, screens, and Use starter, which
// creates the project from the fixture files without a build (6.2.2).
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage, type StarterSummary } from "./types";

export function StarterCard({
  starter,
  large = false,
}: {
  starter: StarterSummary;
  large?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function use() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ starterSlug: starter.slug }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/app/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="starter-card"
      data-slug={starter.slug}
      className="flex items-center gap-3 overflow-hidden rounded-card border border-line bg-surface pr-4 shadow-card transition-colors hover:border-accent/50"
    >
      {/* A static PNG copied from packages/starters/thumbnails (a test keeps them equal). */}
      <img
        src={`/starters/${starter.slug}.png`}
        alt={`${starter.name} screenshot`}
        width={96}
        height={192}
        className="h-48 w-24 shrink-0 object-cover object-top"
      />
      <div className="min-w-0 flex-1 py-4">
        <p className="text-[15px] font-semibold">{starter.name}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">{starter.description}</p>
        {large && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {starter.screens.map((s) => (
              <span
                key={s}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-danger">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void use()}
          disabled={busy}
          className="mt-3 flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-bg disabled:opacity-50"
        >
          {busy ? "Opening…" : "Use starter"} <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
