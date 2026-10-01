// The workspace's state in one JSON-able object: the project, its conversation, every
// generation with its recorded steps, and the id of the last progress event, from which
// the page's EventSource resumes. Served by GET /api/projects/:id and used by the page.
import { asc, eq, inArray, max } from "drizzle-orm";
import { projects, schema, type Db } from "@buildly/db";

export type WorkspaceState = NonNullable<Awaited<ReturnType<typeof loadWorkspace>>>;

export async function loadWorkspace(db: Db, userId: string, projectId: string) {
  const project = await projects.getForUser(db, userId, projectId);
  if (!project) return undefined;
  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.projectId, projectId))
    .orderBy(asc(schema.messages.createdAt));
  const generations = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.projectId, projectId))
    .orderBy(asc(schema.generations.createdAt));
  const steps = generations.length
    ? await db
        .select()
        .from(schema.generationSteps)
        .where(
          inArray(
            schema.generationSteps.generationId,
            generations.map((g) => g.id),
          ),
        )
        .orderBy(asc(schema.generationSteps.startedAt))
    : [];
  const [last] = await db
    .select({ id: max(schema.projectEvents.id) })
    .from(schema.projectEvents)
    .where(eq(schema.projectEvents.projectId, projectId));

  return {
    project: {
      id: project.id,
      name: project.name,
      starterSlug: project.starterSlug,
      currentSnapshotId: project.currentSnapshotId,
      snackSessionId: project.snackSessionId,
      updatedAt: project.updatedAt.toISOString(),
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      generationId: m.generationId,
      createdAt: m.createdAt.toISOString(),
    })),
    generations: generations.map((g) => ({
      id: g.id,
      kind: g.kind,
      status: g.status,
      errorCode: g.errorCode,
      errorDetail: g.errorDetail,
      triggerMessageId: g.triggerMessageId,
      resultSnapshotId: g.resultSnapshotId,
      repairAttempts: g.repairAttempts,
      createdAt: g.createdAt.toISOString(),
      steps: steps
        .filter((s) => s.generationId === g.id)
        .map((s) => ({
          step: s.step,
          status: s.status,
          detail: s.detail as Record<string, unknown> | null,
          startedAt: s.startedAt.toISOString(),
          finishedAt: s.finishedAt.toISOString(),
        })),
    })),
    lastEventId: Number(last?.id ?? 0),
  };
}
