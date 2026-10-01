"use client";

import { Check, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export interface SettingsMe {
  email: string;
  displayName: string;
  plan: "free" | "pro";
  buildsThisMonth: number;
  buildsPerMonth: number;
  credits: number;
  resetsAt: string;
}

const PRO_FEATURES = [
  "200 builds a month",
  "Unlimited projects",
  "Two builds at a time",
  "No attribution in exports",
];

export function SettingsForm({
  me,
  topup,
}: {
  me: SettingsMe;
  topup: { priceUsd: number; credits: number };
}) {
  const router = useRouter();
  const [name, setName] = useState(me.displayName);
  const [saved, setSaved] = useState(me.displayName);
  const [status, setStatus] = useState<string>();
  const pct = Math.min(100, Math.round((me.buildsThisMonth / me.buildsPerMonth) * 100));
  const resets = new Date(me.resetsAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  async function saveName() {
    const next = name.trim();
    if (next === saved) return;
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: next }),
    });
    if (response.ok) {
      setSaved(next);
      setName(next);
      setStatus("Saved.");
      router.refresh(); // the sidebar shows the new name
    } else setStatus("Could not save the name.");
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 pt-12 pb-16 lg:px-10">
      <h1 className="text-[26px] font-semibold tracking-tight">Settings</h1>
      <div className="mt-8 flex flex-col gap-5">
        <Section title="Profile">
          <label htmlFor="display-name" className="block text-[12px] font-medium text-muted">
            Display name
          </label>
          <input
            id="display-name"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <p className="mt-3 text-[12px] text-muted">
            Signed in as {me.email}
            {status && (
              <span role="status" className="ml-2 text-success">
                {status}
              </span>
            )}
          </p>
        </Section>

        <Section
          title="Plan and usage"
          description="A build is one message that runs a generation, including up to two repairs."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-medium capitalize">{me.plan} plan</p>
              <p className="text-[13px] text-muted" data-testid="usage-line">
                {me.buildsThisMonth} of {me.buildsPerMonth} builds used this month · resets {resets}
                {me.credits > 0 ? ` · ${me.credits} top-up credits` : ""}
              </p>
            </div>
            {me.plan === "free" && (
              <button
                type="button"
                disabled
                title="Billing arrives after the beta"
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-ink opacity-60"
              >
                Upgrade to Pro · $12/mo
              </button>
            )}
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Builds used this month"
            aria-valuemin={0}
            aria-valuemax={me.buildsPerMonth}
            aria-valuenow={me.buildsThisMonth}
          >
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-[13px] text-muted sm:grid-cols-2">
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2">
                <Check size={14} className="text-success" aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Plans and payments open after the beta; until then ask for a top-up.
          </p>
        </Section>

        <Section
          title="Need more builds this month?"
          description="Top-ups add builds to any plan and never expire."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent-text">
                <Zap size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[14px] font-medium">
                  {topup.credits} builds for ${topup.priceUsd}
                </p>
                <p className="text-[13px] text-muted">
                  One-time · ${(topup.priceUsd / topup.credits).toFixed(2)} per build · you have{" "}
                  {me.credits}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled
              title="Billing arrives after the beta"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-[13px] font-medium opacity-60"
            >
              Buy top-up
            </button>
          </div>
        </Section>

        <div className="flex justify-between text-[13px]">
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-muted hover:text-ink"
          >
            Sign out
          </button>
          <span className="text-muted">Buildly beta · invite only</span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
