import { eq } from "drizzle-orm";
import { credits, schema, usage } from "@buildly/db";
import { PLAN_LIMITS, startOfNextMonthUtc } from "@buildly/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { errorJson, json, readJson } from "../http";
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
      resetsAt: startOfNextMonthUtc(deps.now()).toISOString(),
    },
  });
}

const patchSchema = z.object({ displayName: z.string().trim().max(60) });

/** PATCH /api/me — the display name (TODO 6.4.1); an empty name clears it. */
export async function patchMe(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success)
    return errorJson(400, "invalid_request", "The display name can be up to 60 characters.");
  const displayName = parsed.data.displayName || null;
  await deps.db.update(schema.users).set({ displayName }).where(eq(schema.users.id, user.id));
  return json({ id: user.id, displayName });
}
