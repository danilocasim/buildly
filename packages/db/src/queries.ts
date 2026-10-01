// Query helpers used by the web app and the worker. Each takes a Db (or a transaction).
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { err, ok, startOfMonthUtc, type Result } from "@buildly/shared";
import type { Db } from "./client";
import {
  ACTIVE_GENERATION_STATUSES,
  analyticsEvents,
  generations as generationsTable,
  jobs as jobsTable,
  projects as projectsTable,
  snapshots as snapshotsTable,
  usageEvents,
} from "./schema";

/** A Db or the `tx` inside `db.transaction(...)`. */
export type Executor = Pick<Db, "select" | "insert" | "update" | "delete" | "execute">;

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  // drizzle wraps the driver error in `cause`.
  for (let depth = 0; current && depth < 3; depth++) {
    const e = current as { code?: string; constraint?: string; cause?: unknown };
    if (e.code === UNIQUE_VIOLATION && e.constraint === constraint) return true;
    current = e.cause;
  }
  return false;
}

export const projects = {
  /** The project if it exists, belongs to the user, and is not archived. */
  async getForUser(db: Executor, userId: string, projectId: string) {
    const [row] = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.id, projectId),
          eq(projectsTable.userId, userId),
          isNull(projectsTable.archivedAt),
        ),
      );
    return row;
  },
  /** The user's projects, most recently updated first. */
  async listForUser(db: Executor, userId: string) {
    return db
      .select()
      .from(projectsTable)
      .where(and(eq(projectsTable.userId, userId), isNull(projectsTable.archivedAt)))
      .orderBy(desc(projectsTable.updatedAt));
  },
  /**
   * Locks the project row until the transaction ends. Starting a build and restoring a
   * snapshot both take it, so a restore cannot slip in while a build is being started.
   */
  async lock(db: Executor, projectId: string) {
    const [row] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .for("update");
    return row;
  },
  async countActiveForUser(db: Executor, userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(and(eq(projectsTable.userId, userId), isNull(projectsTable.archivedAt)));
    return row?.count ?? 0;
  },
};

export const snapshots = {
  /** Inserts the row only; `createSnapshot` in ./snapshot-service writes storage first. */
  async create(
    db: Executor,
    input: {
      id?: string;
      projectId: string;
      parentSnapshotId: string | null;
      storageKey: string;
      fileCount: number;
      schemaVersion: number;
      createdByGenerationId?: string | null;
    },
  ) {
    const [row] = await db.insert(snapshotsTable).values(input).returning();
    return row!;
  },
  async get(db: Executor, id: string) {
    const [row] = await db.select().from(snapshotsTable).where(eq(snapshotsTable.id, id));
    return row;
  },
  /** A project's snapshots, newest first (the history drawer). */
  async listForProject(db: Executor, projectId: string) {
    return db
      .select()
      .from(snapshotsTable)
      .where(eq(snapshotsTable.projectId, projectId))
      .orderBy(desc(snapshotsTable.createdAt));
  },
};

export type EventName = import("@buildly/shared").EventName;
export type EventProps = import("@buildly/shared").EventProps;

export const analytics = {
  /** Writes one analytics_events row (METRICS.md). Props are typed per event: ids and numbers, never prompt text. */
  async track<N extends EventName>(
    db: Executor,
    name: N,
    props: EventProps[N],
    ids: { userId?: string | null; projectId?: string | null } = {},
  ) {
    await db
      .insert(analyticsEvents)
      .values({ name, props, userId: ids.userId ?? null, projectId: ids.projectId ?? null });
  },
};

export type StartGenerationError = { code: "generation_active"; message: string };

export const generations = {
  /**
   * Inserts a queued generation unless the project already has an active one. The
   * partial unique index decides, so concurrent callers cannot both succeed.
   */
  async startExclusive(
    db: Executor,
    input: {
      projectId: string;
      userId: string;
      kind: "initial" | "edit";
      triggerMessageId?: string | null;
      baseSnapshotId?: string | null;
    },
  ): Promise<Result<typeof generationsTable.$inferSelect, StartGenerationError>> {
    try {
      const [row] = await db
        .insert(generationsTable)
        .values({ ...input, status: "queued" })
        .returning();
      return ok(row!);
    } catch (error) {
      if (isUniqueViolation(error, "generations_one_active_per_project")) {
        return err({
          code: "generation_active",
          message: "A build is already running for this project.",
        });
      }
      throw error;
    }
  },
  async getForUser(db: Executor, userId: string, generationId: string) {
    const [row] = await db
      .select()
      .from(generationsTable)
      .where(and(eq(generationsTable.id, generationId), eq(generationsTable.userId, userId)));
    return row;
  },
  /** Non-terminal generations across all of a user's projects (concurrent build cap). */
  async countActiveForUser(db: Executor, userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(generationsTable)
      .where(
        and(
          eq(generationsTable.userId, userId),
          inArray(generationsTable.status, [...ACTIVE_GENERATION_STATUSES]),
        ),
      );
    return row?.n ?? 0;
  },
  async hasActive(db: Executor, projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: generationsTable.id })
      .from(generationsTable)
      .where(
        and(
          eq(generationsTable.projectId, projectId),
          inArray(generationsTable.status, [...ACTIVE_GENERATION_STATUSES]),
        ),
      );
    return Boolean(row);
  },
  /** The queue job that runs this generation (payload.generationId). */
  async jobFor(db: Executor, generationId: string) {
    const [row] = await db
      .select()
      .from(jobsTable)
      .where(sql`${jobsTable.payload}->>'generationId' = ${generationId}`)
      .orderBy(desc(jobsTable.createdAt))
      .limit(1);
    return row;
  },
};

export const usage = {
  async record(
    db: Executor,
    input: {
      userId: string;
      projectId?: string | null;
      type: "build" | "export" | "phone_open";
      quantity?: number;
      occurredAt?: Date;
    },
  ) {
    await db.insert(usageEvents).values(input);
  },
  async countBuildsSince(db: Executor, userId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)::int` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.type, "build"),
          gte(usageEvents.occurredAt, since),
        ),
      );
    return row?.total ?? 0;
  },
  /** The earliest build since `since`, for the rolling hourly window's reset time. */
  async oldestBuildSince(db: Executor, userId: string, since: Date): Promise<Date | undefined> {
    const [row] = await db
      .select({ at: usageEvents.occurredAt })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.type, "build"),
          gte(usageEvents.occurredAt, since),
        ),
      )
      .orderBy(asc(usageEvents.occurredAt))
      .limit(1);
    return row?.at;
  },
  /** Builds consumed in the current UTC calendar month. */
  async countBuildsThisMonth(
    db: Executor,
    userId: string,
    now: Date = new Date(),
  ): Promise<number> {
    return usage.countBuildsSince(db, userId, startOfMonthUtc(now));
  },
};
