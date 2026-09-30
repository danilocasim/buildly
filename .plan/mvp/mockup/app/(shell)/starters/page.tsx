import { StarterCard } from "@/components/StarterCard";
import { starters } from "@/lib/mock";

export default function StartersPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-10 pt-12 pb-16">
      <h1 className="text-[26px] font-semibold tracking-tight">Starters</h1>
      <p className="mt-1 text-[14px] text-muted">
        Tested Expo foundations you can open instantly. Starting from one does not use a build.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4">
        {starters.map((s) => (
          <StarterCard key={s.slug} starter={s} large />
        ))}
        <div className="flex flex-col items-start justify-center rounded-card border border-dashed border-line p-6 text-[13px] text-muted">
          <p className="font-medium text-ink">Something else?</p>
          <p className="mt-1">Describe it on Home. Free-form prompts start from the same foundation.</p>
        </div>
      </div>
    </div>
  );
}
