// The worker's cap re-check when it claims a generation (TODO 3.5.2). The API checks
// before enqueueing, but two requests can pass that check at once; this counts again
// with the build already recorded and refuses anything over the plan.
import { eq } from "drizzle-orm";
import { checkBuild, HOUR_MS, startOfMonthUtc, type CapDenied, type Result } from "@buildly/shared";
import { usage, type Executor } from "./queries";
import { generations, users } from "./schema";

export async function recheckBuildCaps(
  db: Executor,
  generationId: string,
  now: Date,
): Promise<Result<void, CapDenied>> {
  const [row] = await db
    .select({ userId: generations.userId, plan: users.plan })
    .from(generations)
    .innerJoin(users, eq(users.id, generations.userId))
    .where(eq(generations.id, generationId));
  if (!row) throw new Error(`Generation ${generationId} not found`);
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  // The API recorded this build when it enqueued it, so exclude it from the counts.
  return checkBuild({
    plan: row.plan,
    buildsThisMonth: (await usage.countBuildsSince(db, row.userId, startOfMonthUtc(now))) - 1,
    buildsLastHour: (await usage.countBuildsSince(db, row.userId, hourAgo)) - 1,
    oldestBuildLastHour: await usage.oldestBuildSince(db, row.userId, hourAgo),
    activeGeneration: false,
    now,
  });
}
