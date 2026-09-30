"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Settings, ChevronsUpDown, Bell } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { user } from "@/lib/mock";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/starters", label: "Starters", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const pct = Math.round((user.buildsUsed / user.buildsCap) * 100);

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-bg">
      <div className="px-5 pt-5 pb-4">
        <Wordmark />
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors",
                active ? "bg-accent-subtle font-medium text-ink" : "text-ink/80 hover:bg-line/50",
              ].join(" ")}
            >
              <Icon size={17} strokeWidth={1.75} className={active ? "text-accent" : "text-muted"} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <div className="rounded-card border border-line bg-surface p-3.5 shadow-card">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium">{user.plan} plan</span>
            <Link href="/settings" className="text-accent hover:underline">
              See plans
            </Link>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-[12px] text-muted">
            <span>
              {user.buildsUsed}/{user.buildsCap} builds
            </span>
            <span>Resets {user.resetsOn}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle text-[12px] font-semibold text-accent">
          {user.initials}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[12px] text-muted">{user.email}</p>
        </div>
        <ChevronsUpDown size={15} className="text-muted" />
        <span className="relative">
          <Bell size={16} className="text-muted" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
        </span>
      </div>
    </aside>
  );
}
