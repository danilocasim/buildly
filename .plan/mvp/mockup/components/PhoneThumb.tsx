import type { StarterSlug } from "@/lib/mock";

/** Small phone thumbnail with a simplified rendering of each starter's first screen. */
export function PhoneThumb({ slug }: { slug: StarterSlug }) {
  return (
    <div className="relative h-[124px] w-[112px] shrink-0 overflow-hidden">
      <div className="absolute inset-x-1 top-1 h-[160px] rounded-[18px] border-[5px] border-ink bg-ink shadow-md">
        <div className="h-full w-full overflow-hidden rounded-[13px] bg-white">
          <div className="flex items-center justify-between px-2 pt-1 text-[6px] text-ink">
            <span className="font-semibold">9:41</span>
            <span className="h-1 w-3 rounded-sm bg-ink" />
          </div>
          <div className="px-2 pt-1.5">{content[slug]}</div>
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, sub, color }: { label: string; sub?: string; color: string }) => (
  <div className="mt-1 flex items-center gap-1">
    <span className={`h-3 w-3 rounded-[3px] ${color}`} />
    <div className="leading-none">
      <p className="text-[6px] font-medium text-ink">{label}</p>
      {sub && <p className="mt-0.5 text-[5px] text-muted">{sub}</p>}
    </div>
  </div>
);

const content: Record<StarterSlug, React.ReactNode> = {
  journal: (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-semibold text-ink">My Journal</p>
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </div>
      <p className="mt-1 text-[5px] text-muted">Today</p>
      <div className="mt-0.5 rounded bg-accent-subtle px-1 py-0.5">
        <p className="text-[6px] font-medium text-ink">A calmer day</p>
        <p className="text-[5px] text-muted">Grateful for the little things…</p>
      </div>
      <p className="mt-1 text-[5px] text-muted">Yesterday</p>
      <Row label="Ideas" sub="Three things to try" color="bg-line" />
    </>
  ),
  "habit-tracker": (
    <>
      <p className="text-[8px] font-semibold text-ink">My Habits</p>
      <div className="mt-1 flex justify-between text-[5px] text-muted">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex flex-col items-center gap-0.5">
            {d}
            <span className={`h-2 w-2 rounded-full border ${i < 4 ? "border-accent bg-accent" : "border-line"}`} />
          </span>
        ))}
      </div>
      <Row label="Read" sub="12 day streak" color="bg-accent" />
      <Row label="Exercise" sub="4 day streak" color="bg-success" />
    </>
  ),
  inventory: (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[8px] font-semibold text-ink">Items</p>
        <span className="text-[6px] text-accent">+</span>
      </div>
      <Row label="Laptop" sub="Electronics · 2 in stock" color="bg-line" />
      <Row label="Coffee Mug" sub="Kitchen · 12 in stock" color="bg-accent-subtle" />
      <Row label="Notebook" sub="Office · 30 in stock" color="bg-line" />
    </>
  ),
};
