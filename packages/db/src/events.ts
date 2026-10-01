// Per-project progress events (TODO 4.4.4). A row in project_events plus a NOTIFY on the
// `project_events` channel in the same transaction, so a listener never sees an event
// before its row is committed. Streaming text deltas are NOTIFY-only (not stored).
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type pg from "pg";
import type { Db } from "./client";
import type { Executor } from "./queries";
import { projectEvents } from "./schema";

export const EVENTS_CHANNEL = "project_events";

export type ProjectEvent = typeof projectEvents.$inferSelect;

export async function publish(
  db: Db,
  event: {
    projectId: string;
    generationId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
  },
): Promise<ProjectEvent> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(projectEvents)
      .values({
        projectId: event.projectId,
        generationId: event.generationId ?? null,
        type: event.type,
        payload: event.payload ?? {},
      })
      .returning();
    await tx.execute(
      sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify({ projectId: event.projectId, id: row!.id })})`,
    );
    return row!;
  });
}

/** A streaming text chunk for live viewers; not stored, so it is not replayed. */
export async function publishDelta(
  db: Executor,
  projectId: string,
  generationId: string,
  text: string,
): Promise<void> {
  // NOTIFY payloads are limited to 8000 bytes.
  const payload = JSON.stringify({ projectId, generationId, delta: text.slice(0, 6000) });
  await db.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${payload})`);
}

/** Stored events after `afterId`, oldest first (SSE replay from Last-Event-ID). */
export async function since(db: Executor, projectId: string, afterId = 0): Promise<ProjectEvent[]> {
  return db
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.projectId, projectId), gt(projectEvents.id, afterId)))
    .orderBy(asc(projectEvents.id));
}

export interface Subscription {
  close(): Promise<void>;
}

/**
 * Delivers a project's stored events in order (starting after `afterId`) and its live
 * deltas, on a dedicated connection that LISTENs to the channel.
 */
export async function subscribe(
  pool: pg.Pool,
  db: Db,
  projectId: string,
  handlers: {
    onEvent(event: ProjectEvent): void;
    onDelta?(delta: { generationId: string; text: string }): void;
  },
  afterId = 0,
): Promise<Subscription> {
  const client = await pool.connect();
  let lastId = afterId;
  let draining = Promise.resolve();
  const drain = () => {
    draining = draining.then(async () => {
      for (const event of await since(db, projectId, lastId)) {
        lastId = event.id;
        handlers.onEvent(event);
      }
    });
    return draining;
  };
  client.on("notification", (message) => {
    if (message.channel !== EVENTS_CHANNEL || !message.payload) return;
    const data = JSON.parse(message.payload) as {
      projectId: string;
      id?: number;
      generationId?: string;
      delta?: string;
    };
    if (data.projectId !== projectId) return;
    if (data.delta !== undefined && data.generationId)
      handlers.onDelta?.({ generationId: data.generationId, text: data.delta });
    else void drain();
  });
  await client.query(`listen ${EVENTS_CHANNEL}`);
  await drain(); // anything published before LISTEN took effect
  return {
    async close() {
      await draining;
      await client.query(`unlisten ${EVENTS_CHANNEL}`).catch(() => undefined);
      client.release();
    },
  };
}
