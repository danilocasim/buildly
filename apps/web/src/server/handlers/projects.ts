import { eq, inArray } from "drizzle-orm";
import { analytics, projects, schema, snapshots } from "@buildly/db";
import { checkProject } from "@buildly/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { capDenied, errorJson, json, readJson } from "../http";
import { requireUser } from "../session";
import { loadWorkspace } from "../workspace";

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

/** GET /api/projects/:id — the workspace state (project, messages, generations, lastEventId). */
export async function getProject(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const state = await loadWorkspace(deps.db, deps.storage, user.id, projectId);
  if (!state) return errorJson(404, "not_found", "Project not found.");
  return json(state);
}

const renameSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** PATCH /api/projects/:id — rename (the toolbar's inline name, TODO 5.7.1). */
export async function renameProject(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const parsed = renameSchema.safeParse(await readJson(request));
  if (!parsed.success)
    return errorJson(400, "invalid_request", "The project name must be 1 to 80 characters.");
  const [updated] = await deps.db
    .update(schema.projects)
    .set({ name: parsed.data.name, updatedAt: deps.now() })
    .where(eq(schema.projects.id, project.id))
    .returning();
  return json({ id: updated!.id, name: updated!.name });
}

/** GET /api/projects/:id/snapshots — the history drawer (TODO 5.7.2), newest first. */
export async function listSnapshots(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const rows = await snapshots.listForProject(deps.db, project.id);
  const generationIds = rows.flatMap((r) =>
    r.createdByGenerationId ? [r.createdByGenerationId] : [],
  );
  const triggers = generationIds.length
    ? await deps.db
        .select({
          id: schema.generations.id,
          kind: schema.generations.kind,
          triggerMessageId: schema.generations.triggerMessageId,
        })
        .from(schema.generations)
        .where(inArray(schema.generations.id, generationIds))
    : [];
  const messageIds = triggers.flatMap((t) => (t.triggerMessageId ? [t.triggerMessageId] : []));
  const messages = messageIds.length
    ? await deps.db
        .select({ id: schema.messages.id, content: schema.messages.content })
        .from(schema.messages)
        .where(inArray(schema.messages.id, messageIds))
    : [];
  return json(
    rows.map((row) => {
      const generation = triggers.find((t) => t.id === row.createdByGenerationId);
      const prompt = messages.find((m) => m.id === generation?.triggerMessageId)?.content;
      return {
        id: row.id,
        parentSnapshotId: row.parentSnapshotId,
        createdAt: row.createdAt.toISOString(),
        fileCount: row.fileCount,
        current: row.id === project.currentSnapshotId,
        /** What produced it: the build's prompt, or a restore / starter. */
        label:
          prompt ?? (generation ? "Build" : row.parentSnapshotId ? "Restored version" : "Starter"),
        kind: generation?.kind ?? (row.parentSnapshotId ? "restore" : "initial"),
      };
    }),
  );
}
