import { analytics, isRollback, projects } from "@buildly/db";
import { z } from "zod";
import { checkBuildFor, startBuild, type StartBuildRefusal } from "../builds";
import type { Deps } from "../deps";
import { capDenied, errorJson, json, readJson } from "../http";
import { requireUser } from "../session";

const bodySchema = z.object({ content: z.string().trim().min(1).max(8000) });

/** The response for a refusal decided inside the build transaction. */
export function refusalResponse(refusal: StartBuildRefusal): Response {
  return "capDenied" in refusal
    ? capDenied(refusal.capDenied)
    : errorJson(409, refusal.code, refusal.message, { resetAt: null });
}

/**
 * POST /api/projects/:id/messages — records the user's message and starts a build.
 * Caps are checked first (429 / 409 with { code, message, resetAt }); the message,
 * generation, usage event, the top-up credit when the plan allowance is used up, and
 * the queue job are then written in one transaction.
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

  const allowed = await checkBuildFor(deps, user, project.id);
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

  // Why a transaction was rolled back, if it was.
  let refused: Response | undefined;
  const result = await deps.db
    .transaction(async (tx) => {
      // The base snapshot is read under the project lock, so a concurrent restore either
      // finishes first (and becomes the base) or waits for this build to be recorded.
      const locked = (await projects.lock(tx, project.id))!;
      const started = await startBuild(tx, {
        userId: user.id,
        projectId: project.id,
        baseSnapshotId: locked.currentSnapshotId,
        content: parsed.data.content,
        paidBy: allowed.value.paidBy,
        now: deps.now(),
      });
      if (!started.ok) {
        refused = refusalResponse(started.refusal);
        tx.rollback();
        return undefined;
      }
      return {
        messageId: started.messageId,
        generationId: started.generationId,
        paidBy: allowed.value.paidBy,
      };
    })
    .catch((error: unknown) => {
      // tx.rollback() throws to abort the transaction; `refused` says why.
      if (isRollback(error) && refused) return undefined;
      throw error;
    });

  if (!result) return refused!;
  return json(result, 202);
}
