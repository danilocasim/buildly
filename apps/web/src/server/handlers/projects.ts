import { eq, inArray } from "drizzle-orm";
import {
  analytics,
  createSnapshot,
  isRollback,
  projects,
  queue,
  schema,
  snapshots,
} from "@buildly/db";
import { checkProject } from "@buildly/shared";
import { z } from "zod";
import type { Deps } from "../deps";
import { capDenied, errorJson, json, readJson } from "../http";
import { requireUser } from "../session";
import { loadWorkspace } from "../workspace";

import starters from "@buildly/starters/dist/starters-files.json";
import { checkBuildFor, startBuild } from "../builds";
import { refusalResponse } from "./messages";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  prompt: z.string().trim().max(8000).optional(),
  starterSlug: z.string().optional(),
});

/** "A journal app with tags and search." → "A journal app with tags and search" (≤ 40 chars). */
export function nameFromPrompt(prompt: string): string {
  const firstLine = prompt
    .split(/[\n.!?]/)[0]!
    .trim()
    .replace(/\s+/g, " ");
  if (!firstLine) return "Untitled app";
  const cut = firstLine.length > 40 ? firstLine.slice(0, 40).replace(/\s+\S*$/, "") : firstLine;
  return (cut || firstLine.slice(0, 40)).replace(/^./, (c) => c.toUpperCase());
}

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
 * POST /api/projects — creates a project, subject to the plan's project cap. With `prompt`
 * (TODO 6.1.2) the first build starts in the same transaction, after the build caps pass;
 * with `starterSlug` (6.2.2) the starter's files become the initial snapshot without a
 * build, and a prompt on top is the first edit. Returns 201 { id, name, generationId? }.
 */
export async function createProject(request: Request, deps: Deps): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const parsed = createSchema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success)
    return errorJson(400, "invalid_request", "The project name must be 1 to 80 characters.");
  const { prompt, starterSlug } = parsed.data;
  const starter = starterSlug ? starters.starters.find((s) => s.slug === starterSlug) : undefined;
  if (starterSlug && !starter) return errorJson(400, "unknown_starter", "Unknown starter.");

  const projectCap = checkProject({
    plan: user.plan,
    activeProjects: await projects.countActiveForUser(deps.db, user.id),
  });
  if (!projectCap.ok) {
    await analytics.track(deps.db, "cap.hit", { cap: projectCap.error.code }, { userId: user.id });
    return capDenied(projectCap.error);
  }
  // A prompt is a build: its caps are checked before anything is created.
  const buildAllowance = prompt ? await checkBuildFor(deps, user, null) : undefined;
  if (buildAllowance && !buildAllowance.ok) {
    await analytics.track(
      deps.db,
      "cap.hit",
      { cap: buildAllowance.error.code },
      { userId: user.id },
    );
    return capDenied(buildAllowance.error);
  }

  const name =
    parsed.data.name ?? (prompt ? nameFromPrompt(prompt) : (starter?.name ?? "Untitled app"));
  let refused: Response | undefined;
  const created = await deps.db
    .transaction(async (tx) => {
      const [project] = await tx
        .insert(schema.projects)
        .values({ userId: user.id, name, starterSlug: starter?.slug ?? null })
        .returning();
      let baseSnapshotId: string | null = null;
      if (starter) {
        const files = (starters.files as Record<string, Record<string, string>>)[starter.slug]!;
        const snapshot = await createSnapshot(tx, deps.storage, {
          projectId: project!.id,
          files,
          parentId: null,
        });
        baseSnapshotId = snapshot.id;
        await tx
          .update(schema.projects)
          .set({ currentSnapshotId: snapshot.id })
          .where(eq(schema.projects.id, project!.id));
        // The live preview session for Open on phone and the web player.
        await queue.enqueue(tx, { type: "preview", payload: { projectId: project!.id } });
      }
      let generationId: string | undefined;
      if (prompt && buildAllowance?.ok) {
        const started = await startBuild(tx, {
          userId: user.id,
          projectId: project!.id,
          baseSnapshotId,
          content: prompt,
          paidBy: buildAllowance.value.paidBy,
          now: deps.now(),
        });
        if (!started.ok) {
          refused = refusalResponse(started.refusal);
          tx.rollback();
          return undefined;
        }
        generationId = started.generationId;
      }
      await analytics.track(
        tx,
        "project.created",
        { source: starter ? "starter" : "prompt" },
        { userId: user.id, projectId: project!.id },
      );
      return { id: project!.id, name: project!.name, generationId };
    })
    .catch((error: unknown) => {
      if (isRollback(error) && refused) return undefined;
      throw error;
    });
  if (!created) return refused!;
  return json(created, 201);
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

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  archived: z.boolean().optional(),
});

/** PATCH /api/projects/:id — rename (TODO 5.7.1) or archive/unarchive (6.1.3). */
export async function renameProject(
  request: Request,
  deps: Deps,
  projectId: string,
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.archived === undefined))
    return errorJson(400, "invalid_request", "The project name must be 1 to 80 characters.");
  const [updated] = await deps.db
    .update(schema.projects)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.archived !== undefined
        ? { archivedAt: parsed.data.archived ? deps.now() : null }
        : {}),
      updatedAt: deps.now(),
    })
    .where(eq(schema.projects.id, project.id))
    .returning();
  return json({ id: updated!.id, name: updated!.name, archived: updated!.archivedAt !== null });
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
