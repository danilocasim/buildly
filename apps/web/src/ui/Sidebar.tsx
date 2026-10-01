"use client";

import { Home, LayoutGrid, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";

export interface SidebarUser {
  name: string;
  email: string;
  initials: string;
  plan: "free" | "pro";
  buildsUsed: number;
  buildsCap: number;
  credits: number;
  resetsOn: string;
}

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/starters", label: "Starters", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ me }: { me: SidebarUser }) {
  const pathname = usePathname();
  const pct = Math.min(100, Math.round((me.buildsUsed / me.buildsCap) * 100));

  return (
    <aside
      data-testid="sidebar"
      className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-bg"
    >
      <div className="px-5 pt-5 pb-4">
        <Wordmark />
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors",
                active ? "bg-accent-subtle font-medium text-ink" : "text-ink/80 hover:bg-line/50",
              ].join(" ")}
            >
              <Icon
                size={17}
                strokeWidth={1.75}
                aria-hidden="true"
                className={active ? "text-accent-text" : "text-muted"}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <div className="rounded-card border border-line bg-surface p-3.5 shadow-card">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium capitalize">{me.plan} plan</span>
            <Link href="/settings" className="text-accent-text hover:underline">
              See plans
            </Link>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Builds used this month"
            aria-valuemin={0}
            aria-valuemax={me.buildsCap}
            aria-valuenow={me.buildsUsed}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-[12px] text-muted">
            <span>
              {me.buildsUsed}/{me.buildsCap} builds
              {me.credits > 0 ? ` · ${me.credits} credits` : ""}
            </span>
            <span>Resets {me.resetsOn}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-[12px] font-semibold text-accent-text"
        >
          {me.initials}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{me.name}</p>
          <p className="truncate text-[12px] text-muted" data-testid="sidebar-email">
            {me.email}
          </p>
        </div>
      </div>
    </aside>
  );
}
