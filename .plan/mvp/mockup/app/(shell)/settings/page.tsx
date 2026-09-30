import { Check, Zap } from "lucide-react";
import { user } from "@/lib/mock";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent";

export default function SettingsPage() {
  const pct = Math.round((user.buildsUsed / user.buildsCap) * 100);
  return (
    <div className="mx-auto max-w-[760px] px-10 pt-12 pb-16">
      <h1 className="text-[26px] font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 flex flex-col gap-5">
        <Section title="Profile">
          <label className="block text-[12px] font-medium text-muted">Display name</label>
          <input defaultValue={user.name} className={`${input} mt-1.5`} />
          <p className="mt-3 text-[12px] text-muted">Signed in as {user.email}</p>
        </Section>

        <Section title="Plan and usage" description="A build is one message that runs a generation, including up to two repairs.">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] font-medium">{user.plan} plan</p>
              <p className="text-[13px] text-muted">
                {user.buildsUsed} of {user.buildsCap} builds used this month · resets {user.resetsOn}
              </p>
            </div>
            <button className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover">
              Upgrade to Pro · $12/mo
            </button>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] text-muted">
            {["200 builds a month", "Unlimited projects", "Unlimited snapshot history", "Priority queue", "No attribution in exports", "Cancel anytime"].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check size={14} className="text-success" /> {f}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Need more builds this month?" description="Top-ups add builds to any plan and never expire.">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                <Zap size={18} />
              </span>
              <div>
                <p className="text-[14px] font-medium">50 builds for $5</p>
                <p className="text-[13px] text-muted">One-time purchase · $0.10 per build</p>
              </div>
            </div>
            <button className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-medium hover:bg-bg">Buy top-up</button>
          </div>
        </Section>

        <div className="flex justify-between text-[13px]">
          <button className="text-muted hover:text-ink">Sign out</button>
          <span className="text-faint">Buildly beta · invite only</span>
        </div>
      </div>
    </div>
  );
}
