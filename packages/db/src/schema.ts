// Postgres schema (ARCHITECTURE.md §2). Change this file, then `pnpm db:generate` and
// write the matching down migration in migrations/down/.
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const planEnum = pgEnum("plan", ["free", "pro"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Stored lowercased; unique (one account per email, TODO 7.2.4). */
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  plan: planEnum("plan").notNull().default("free"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: createdAt(),
});

export const invites = pgTable("invites", {
  email: text("email").primaryKey(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 of the emailed token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("magic_links_email_idx").on(t.email, t.createdAt)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the cookie token. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    starterSlug: text("starter_slug"),
    currentSnapshotId: uuid("current_snapshot_id").references((): AnyPgColumn => snapshots.id, {
      onDelete: "set null",
    }),
    snackSessionId: text("snack_session_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("projects_user_idx").on(t.userId, t.updatedAt)],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentSnapshotId: uuid("parent_snapshot_id").references((): AnyPgColumn => snapshots.id, {
      onDelete: "set null",
    }),
    /** `snapshots/{projectId}/{snapshotId}.json` in object storage. */
    storageKey: text("storage_key").notNull(),
    fileCount: integer("file_count").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    createdByGenerationId: uuid("created_by_generation_id").references(
      (): AnyPgColumn => generations.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: createdAt(),
  },
  (t) => [index("snapshots_project_idx").on(t.projectId, t.createdAt)],
);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    generationId: uuid("generation_id").references((): AnyPgColumn => generations.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("messages_project_idx").on(t.projectId, t.createdAt)],
);

export const GENERATION_STATUSES = [
  "queued",
  "planning",
  "editing",
  "checking",
  "bundling",
  "repairing",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
] as const;
export const ACTIVE_GENERATION_STATUSES = [
  "queued",
  "planning",
  "editing",
  "checking",
  "bundling",
  "repairing",
] as const;

export const generationStatusEnum = pgEnum("generation_status", GENERATION_STATUSES);
export const generationKindEnum = pgEnum("generation_kind", ["initial", "edit"]);

export const generations = pgTable(
  "generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: generationKindEnum("kind").notNull(),
    status: generationStatusEnum("status").notNull().default("queued"),
    triggerMessageId: uuid("trigger_message_id").references((): AnyPgColumn => messages.id, {
      onDelete: "set null",
    }),
    baseSnapshotId: uuid("base_snapshot_id").references(() => snapshots.id, {
      onDelete: "set null",
    }),
    resultSnapshotId: uuid("result_snapshot_id").references(() => snapshots.id, {
      onDelete: "set null",
    }),
    repairAttempts: integer("repair_attempts").notNull().default(0),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // At most one non-terminal generation per project (ARCHITECTURE.md §3).
    uniqueIndex("generations_one_active_per_project")
      .on(t.projectId)
      .where(
        sql`${t.status} in ('queued', 'planning', 'editing', 'checking', 'bundling', 'repairing')`,
      ),
    index("generations_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const stepEnum = pgEnum("generation_step", [
  "plan",
  "edit",
  "typecheck",
  "bundle",
  "repair",
  "snapshot",
]);
export const stepStatusEnum = pgEnum("generation_step_status", ["succeeded", "failed"]);

export const generationSteps = pgTable(
  "generation_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    step: stepEnum("step").notNull(),
    status: stepStatusEnum("status").notNull(),
    detail: jsonb("detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("generation_steps_generation_idx").on(t.generationId, t.finishedAt)],
);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    status: jobStatusEnum("status").notNull().default("queued"),
    /** Claims so far; a job whose worker stopped heartbeating is requeued once. */
    attempts: integer("attempts").notNull().default(0),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_claim_idx").on(t.status, t.runAfter),
    index("jobs_running_heartbeat_idx")
      .on(t.heartbeatAt)
      .where(sql`${t.status} = 'running'`),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** "build" | "export" | "phone_open" */
    type: text("type").notNull(),
    quantity: integer("quantity").notNull().default(1),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_user_type_time_idx").on(t.userId, t.type, t.occurredAt)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default({}).$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("analytics_events_name_time_idx").on(t.name, t.occurredAt)],
);
