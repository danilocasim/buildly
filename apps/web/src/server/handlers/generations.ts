import { analytics, generations, queue, schema } from "@buildly/db";
import type { Deps } from "../deps";
import { errorJson, json } from "../http";
import { requireUser } from "../session";

/** POST /api/generations/:id/cancel — asks the running job to stop at its next step. */
export async function cancelGeneration(
  request: Request,
  deps: Deps,
  generationId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const generation = await generations.getForUser(deps.db, user.id, generationId);
  if (!generation) return errorJson(404, "not_found", "Build not found.");
  if (!(schema.ACTIVE_GENERATION_STATUSES as readonly string[]).includes(generation.status)) {
    return errorJson(409, "not_active", "This build has already finished.");
  }
  const job = await generations.jobFor(deps.db, generation.id);
  if (!job || !(await queue.requestCancel(deps.db, job.id))) {
    return errorJson(409, "not_active", "This build has already finished.");
  }
  await analytics.track(
    deps.db,
    "build.cancelled",
    { generation_id: generation.id },
    { userId: user.id, projectId: generation.projectId },
  );
  return json({ cancelRequested: true }, 202);
}
