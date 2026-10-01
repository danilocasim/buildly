// Starters (TODO 6.2.1): the same cards as Home's Starters tab, with screen chips.
import starters from "@buildly/starters/dist/starters-files.json";
import { StarterCard } from "@/src/ui/home/StarterCard";

export default function StartersPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-12 pb-16 lg:px-10">
      <h1 className="text-[26px] font-semibold tracking-tight">Starters</h1>
      <p className="mt-1 text-[14px] text-muted">
        Tested Expo foundations you can open instantly. Starting from one does not use a build.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2" data-testid="starter-grid">
        {starters.starters.map(({ slug, name, description, screens }) => (
          <StarterCard key={slug} starter={{ slug, name, description, screens }} large />
        ))}
        <div className="flex flex-col items-start justify-center rounded-card border border-dashed border-line p-6 text-[13px] text-muted">
          <p className="font-medium text-ink">Something else?</p>
          <p className="mt-1">
            Describe it on Home. Free-form prompts start from the same foundation.
          </p>
        </div>
      </div>
    </div>
  );
}
