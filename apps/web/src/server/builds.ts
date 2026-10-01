// Starting a build: the message, the generation, the usage event, the top-up credit when
// the plan's allowance is used up, and the queue job, all in one transaction under the
// project lock. Shared by POST /api/projects/:id/messages and POST /api/projects (a project
// created from a prompt starts its first build in the same transaction).
import { credits, generations, queue, schema, usage, type Executor } from "@buildly/db";
import {
  checkBuild,
  HOUR_MS,
  startOfMonthUtc,
  startOfNextMonthUtc,
  type CapDenied,
} from "@buildly/shared";
import type { Deps } from "./deps";

export type BuildAllowance = Awaited<ReturnType<typeof checkBuildFor>>;

/** The plan check a build must pass before anything is written (TODO 3.5.2). */
export async function checkBuildFor(
  deps: Deps,
  user: { id: string; plan: "free" | "pro" },
  projectId: string | null,
) {
  const now = deps.now();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  return checkBuild({
    plan: user.plan,
    buildsThisMonth: await usage.countBuildsSince(deps.db, user.id, startOfMonthUtc(now)),
    buildsLastHour: await usage.countBuildsSince(deps.db, user.id, hourAgo),
    oldestBuildLastHour: await usage.oldestBuildSince(deps.db, user.id, hourAgo),
    activeGeneration: projectId ? await generations.hasActive(deps.db, projectId) : false,
    activeBuildsForUser: await generations.countActiveForUser(deps.db, user.id),
    creditBalance: await credits.balance(deps.db, user.id),
    now,
  });
}

export type StartBuildRefusal =
  { code: "generation_active"; message: string } | { capDenied: CapDenied };

/**
 * Inside a transaction that already holds the project lock: records the message and starts
 * the generation. Returns the refusal to answer with when the transaction must roll back.
 */
export async function startBuild(
  tx: Executor,
  input: {
    userId: string;
    projectId: string;
    baseSnapshotId: string | null;
    content: string;
    paidBy: "plan" | "credit";
    now: Date;
  },
): Promise<
  { ok: true; messageId: string; generationId: string } | { ok: false; refusal: StartBuildRefusal }
> {
  const [message] = await tx
    .insert(schema.messages)
    .values({ projectId: input.projectId, role: "user", content: input.content })
    .returning();
  const started = await generations.startExclusive(tx, {
    projectId: input.projectId,
    userId: input.userId,
    kind: input.baseSnapshotId ? "edit" : "initial",
    triggerMessageId: message!.id,
    baseSnapshotId: input.baseSnapshotId,
  });
  if (!started.ok) return { ok: false, refusal: started.error };
  // Past the plan's allowance, this build spends one top-up credit (locked, so two requests
  // cannot both spend the last one).
  if (
    input.paidBy === "credit" &&
    !(await credits.consumeForBuild(tx, input.userId, started.value.id))
  ) {
    return {
      ok: false,
      refusal: {
        capDenied: {
          code: "monthly_builds",
          message:
            "Your last build credit was just used. Add a top-up or wait for the monthly reset.",
          resetAt: startOfNextMonthUtc(input.now).toISOString(),
          status: 429,
        },
      },
    };
  }
  await usage.record(tx, {
    userId: input.userId,
    projectId: input.projectId,
    type: "build",
    occurredAt: input.now,
  });
  await queue.enqueue(tx, {
    type: "generation",
    payload: { generationId: started.value.id, projectId: input.projectId },
  });
  return { ok: true, messageId: message!.id, generationId: started.value.id };
}
