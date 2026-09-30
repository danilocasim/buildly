import { BookOpen, ChevronRight, MoreVertical, Plus, Search, Target, User } from "lucide-react";
import { books } from "@/lib/mock";

/** A mocked render of the generated app's Library screen, standing in for the Snack web player. */
export function ReadingTrackerApp({ screen }: { screen: string }) {
  return (
    <div className="flex h-full flex-col bg-[#faf9f7]">
      <div className="flex items-start justify-between px-5 pt-2">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{screen === "Goals" ? "Goals" : "My Library"}</h1>
          <p className="text-[12px] text-muted">Keep your reading moving</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="rounded-full bg-warn-subtle px-2 py-0.5 text-[10px] font-medium text-warn">Demo data</span>
          <Search size={20} className="text-ink" />
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-2xl bg-white p-3.5 shadow-[0_1px_2px_rgb(23_23_23/0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink">Monthly goal</p>
          <ChevronRight size={16} className="text-faint" />
        </div>
        <p className="text-[11px] text-muted">3 of 5 books</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full w-[60%] rounded-full bg-accent" />
          </div>
          <span className="text-[10px] text-muted">60%</span>
        </div>
      </div>

      <div className="mx-4 mt-3 flex rounded-xl bg-line/60 p-1 text-[12px]">
        {["All", "Reading", "Completed"].map((t, i) => (
          <span
            key={t}
            className={`flex-1 rounded-lg py-1 text-center ${i === 0 ? "bg-accent font-medium text-white" : "text-muted"}`}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="mt-2 flex-1 space-y-2 overflow-hidden px-4">
        {books.map((b) => (
          <div key={b.title} className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-[0_1px_2px_rgb(23_23_23/0.06)]">
            <div className={`h-[60px] w-[46px] shrink-0 rounded-lg bg-gradient-to-br ${b.cover}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between">
                <p className="truncate text-[13px] font-semibold text-ink">{b.title}</p>
                <MoreVertical size={14} className="text-faint" />
              </div>
              <p className="text-[11px] text-muted">{b.author}</p>
              <p className="mt-1.5 text-[10px] text-muted">Reading</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${b.progress * 100}%` }} />
                </div>
                <span className="text-[10px] text-muted">{Math.round(b.progress * 100)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="absolute right-5 bottom-[74px] flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg">
        <Plus size={22} />
      </button>

      <nav className="flex items-center justify-around border-t border-line bg-white px-2 pt-2 pb-5 text-[10px]">
        {[
          { label: "Library", icon: BookOpen, active: true },
          { label: "Goals", icon: Target, active: false },
          { label: "Profile", icon: User, active: false },
        ].map(({ label, icon: Icon, active }) => (
          <span key={label} className={`flex flex-col items-center gap-0.5 ${active ? "text-accent" : "text-muted"}`}>
            <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
            {label}
          </span>
        ))}
      </nav>
    </div>
  );
}
