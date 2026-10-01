// The signed-in app: sidebar (Home, Starters, Settings) plus the page. Signed-out
// visitors go to /sign-in. The sidebar's plan card shows real usage against the cap.
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { credits, usage } from "@buildly/db";
import { PLAN_LIMITS, startOfNextMonthUtc } from "@buildly/shared";
import { currentUser } from "@/src/server/current-user";
import { getDeps } from "@/src/server/deps";
import { Shell } from "@/src/ui/Shell";
import { Sidebar } from "@/src/ui/Sidebar";

export const dynamic = "force-dynamic";

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const deps = getDeps();
  const now = deps.now();
  const name = user.displayName?.trim() || user.email.split("@")[0]!;
  const sidebar = (
    <Sidebar
      me={{
        name,
        email: user.email,
        initials: initialsOf(name),
        plan: user.plan,
        buildsUsed: await usage.countBuildsThisMonth(deps.db, user.id, now),
        buildsCap: PLAN_LIMITS[user.plan].buildsPerMonth,
        credits: await credits.balance(deps.db, user.id),
        resetsOn: startOfNextMonthUtc(now).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
      }}
    />
  );
  return <Shell sidebar={sidebar}>{children}</Shell>;
}

function initialsOf(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
}
