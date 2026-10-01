"use client";

// Viewport-locked layout: the sidebar stays put and only the page scrolls. Under 1024 px
// (Tailwind's lg) the sidebar becomes a drawer opened from the top bar's menu button.
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "./Wordmark";

export function Shell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the drawer; so does Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden h-full lg:flex">{sidebar}</div>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-bg px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="drawer"
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-ink hover:bg-line/50"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <Wordmark />
        </header>
        <main className="scroll-thin min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/30"
          />
          <div
            id="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex shadow-float"
          >
            {sidebar}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-1 text-muted hover:bg-line/50"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
