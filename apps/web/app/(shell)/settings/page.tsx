// Settings (TODO 6.4.1): display name, plan and usage against the cap, top-ups, sign out.
import { credits, usage } from "@buildly/db";
import { PLAN_LIMITS, startOfNextMonthUtc, TOPUP } from "@buildly/shared";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { SettingsForm } from "@/src/ui/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = (await currentUser())!;
  const deps = getDeps();
  const now = deps.now();
  return (
    <SettingsForm
      me={{
        email: user.email,
        displayName: user.displayName ?? "",
        plan: user.plan,
        buildsThisMonth: await usage.countBuildsThisMonth(deps.db, user.id, now),
        buildsPerMonth: PLAN_LIMITS[user.plan].buildsPerMonth,
        credits: await credits.balance(deps.db, user.id),
        resetsAt: startOfNextMonthUtc(now).toISOString(),
      }}
      topup={{ priceUsd: TOPUP.priceUsd, credits: TOPUP.credits }}
    />
  );
}
