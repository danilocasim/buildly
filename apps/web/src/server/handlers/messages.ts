import { analytics, generations, projects, queue, schema, usage } from "@buildly/db";
import { checkBuild, HOUR_MS, startOfMonthUtc } from "@buildly/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { capDenied, errorJson, json, readJson } from "../http";
import { requireUser } from "../session";

const bodySchema = z.object({ content: z.string().trim().min(1).max(8000) });

/**
 * POST /api/projects/:id/messages — records the user's message and starts a build.
 * Caps are checked first (429 / 409 with { code, message, resetAt }); the message,
 * generation, usage event, and queue job are then written in one transaction.
 */
export async function postMessage(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success)
    return errorJson(400, "invalid_request", "Write a message of up to 8,000 characters.");
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");

  const now = deps.now();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const allowed = checkBuild({
    plan: user.plan,
    buildsThisMonth: await usage.countBuildsSince(deps.db, user.id, startOfMonthUtc(now)),
    buildsLastHour: await usage.countBuildsSince(deps.db, user.id, hourAgo),
    oldestBuildLastHour: await usage.oldestBuildSince(deps.db, user.id, hourAgo),
    activeGeneration: await generations.hasActive(deps.db, project.id),
    now,
  });
  if (!allowed.ok) {
    if (allowed.error.code !== "generation_active") {
      await analytics.track(
        deps.db,
        "cap.hit",
        { cap: allowed.error.code },
        { userId: user.id, projectId: project.id },
      );
    }
    return capDenied(allowed.error);
  }

  const result = await deps.db
    .transaction(async (tx) => {
      const [message] = await tx
        .insert(schema.messages)
        .values({ projectId: project.id, role: "user", content: parsed.data.content })
        .returning();
      const started = await generations.startExclusive(tx, {
        projectId: project.id,
        userId: user.id,
        kind: project.currentSnapshotId ? "edit" : "initial",
        triggerMessageId: message!.id,
        baseSnapshotId: project.currentSnapshotId,
      });
      if (!started.ok) {
        tx.rollback();
        return started;
      }
      await usage.record(tx, {
        userId: user.id,
        projectId: project.id,
        type: "build",
        occurredAt: now,
      });
      await queue.enqueue(tx, {
        type: "generation",
        payload: { generationId: started.value.id, projectId: project.id },
      });
      return { ok: true as const, messageId: message!.id, generationId: started.value.id };
    })
    .catch((error: unknown) => {
      // tx.rollback() throws to abort the transaction; the conflict is reported below.
      if ((error as Error).name === "TransactionRollbackError") return { ok: false as const };
      throw error;
    });

  if (!result.ok)
    return errorJson(
      409,
      "generation_active",
      "A build is already running for this project. Wait for it or cancel it.",
      { resetAt: null },
    );
  return json({ messageId: result.messageId, generationId: result.generationId }, 202);
}
