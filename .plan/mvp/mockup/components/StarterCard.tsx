import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PhoneThumb } from "./PhoneThumb";
import type { Starter } from "@/lib/mock";

export function StarterCard({ starter, large = false }: { starter: Starter; large?: boolean }) {
  return (
    <Link
      href={`/app/${starter.slug}`}
      className="group flex items-center gap-3 overflow-hidden rounded-card border border-line bg-surface pr-4 shadow-card transition-colors hover:border-accent/50"
    >
      <PhoneThumb slug={starter.slug} />
      <div className="min-w-0 flex-1 py-4">
        <p className="text-[15px] font-semibold">{starter.name}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">{starter.description}</p>
        {large && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {starter.screens.map((s) => (
              <span key={s} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-faint transition-colors group-hover:text-accent" />
    </Link>
  );
}
