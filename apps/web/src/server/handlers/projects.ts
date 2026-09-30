import { analytics, projects, schema } from "@buildly/db";
import { checkProject } from "@buildly/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { capDenied, errorJson, json, readJson } from "../http";
import { requireUser } from "../session";

const createSchema = z.object({ name: z.string().trim().min(1).max(80).optional() });

/** GET /api/projects — the user's projects. */
export async function listProjects(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const rows = await projects.listForUser(deps.db, user.id);
  return json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      starterSlug: p.starterSlug,
      updatedAt: p.updatedAt,
    })),
  );
}

/**
 * POST /api/projects — creates an empty project, subject to the plan's project cap.
 * Creating from a prompt or a starter builds on this in TODO 6.1.2 and 6.2.2.
 */
export async function createProject(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const parsed = createSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success)
    return errorJson(400, "invalid_request", "The project name must be 1 to 80 characters.");

  const allowed = checkProject({
    plan: user.plan,
    activeProjects: await projects.countActiveForUser(deps.db, user.id),
  });
  if (!allowed.ok) {
    await analytics.track(deps.db, "cap.hit", { cap: allowed.error.code }, { userId: user.id });
    return capDenied(allowed.error);
  }
  const [project] = await deps.db
    .insert(schema.projects)
    .values({ userId: user.id, name: parsed.data.name ?? "Untitled app" })
    .returning();
  await analytics.track(
    deps.db,
    "project.created",
    { source: "prompt" },
    { userId: user.id, projectId: project!.id },
  );
  return json({ id: project!.id, name: project!.name }, 201);
}
