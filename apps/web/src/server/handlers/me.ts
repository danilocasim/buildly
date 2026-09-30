import { credits, usage } from "@buildly/db";
import { PLAN_LIMITS } from "@buildly/shared";
import type { Deps } from "../deps";
import { json } from "../http";
import { requireUser } from "../session";

/** GET /api/me — the signed-in user's profile and usage against the plan cap. */
export async function getMe(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const buildsThisMonth = await usage.countBuildsThisMonth(deps.db, user.id, deps.now());
  return json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    plan: user.plan,
    isAdmin: user.isAdmin,
    usage: {
      buildsThisMonth,
      buildsPerMonth: PLAN_LIMITS[user.plan].buildsPerMonth,
      credits: await credits.balance(deps.db, user.id),
    },
  });
}
