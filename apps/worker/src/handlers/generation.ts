// The `generation` job (ARCHITECTURE.md §3): re-check the plan's caps, load the base
// snapshot and the conversation, then run the state machine with database-backed ports.
import { and, asc, eq, lt } from "drizzle-orm";
import { analytics, createSnapshot, events, recheckBuildCaps, schema, type Db } from "@buildly/db";
import {
  loadFoundationFiles,
  loadTemplateFiles,
  readApiDigest,
  readManifest,
} from "@buildly/foundation";
import {
  primaryModel,
  runGeneration,
  type CheckOutcome,
  type FileSet,
  type GenerationPorts,
  type HistoryMessage,
  type ModelConfig,
  type Provider,
  type RunResult,
} from "@buildly/generator";
import type { Storage } from "@buildly/storage";
import type { JobContext, JobHandler } from "../runner";
import { pushPreview, type PreviewPusher } from "./preview";

export interface GenerationHandlerDeps {
  db: Db;
  storage: Pick<Storage, "getSnapshot" | "putSnapshot" | "delete">;
  provider: Provider;
  models: ModelConfig;
  typecheck(files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  /** Snack bundle for the project (packages/snack, TODO 4.5). */
  bundle(projectId: string, files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  /** Pushes the new snapshot to the project's live Snack session (TODO 4.6.1). */
  preview: PreviewPusher;
  now?: () => Date;
}

const TERMINAL_EVENT = "finished";

export function createGenerationHandler(
  deps: GenerationHandlerDeps,
): JobHandler<{ generationId: string; projectId: string }> {
  const now = deps.now ?? (() => new Date());
  const manifest = readManifest();
  const foundationFiles = loadFoundationFiles();
  const apiDigest = readApiDigest();

  return {
    async run(ctx: JobContext<{ generationId: string; projectId: string }>) {
      const { db } = deps;
      const { generationId, projectId } = ctx.payload;
      const [generation] = await db
        .select()
        .from(schema.generations)
        .where(eq(schema.generations.id, generationId));
      if (!generation) throw new Error(`Generation ${generationId} not found`);
      const model = primaryModel(generation.kind, deps.models);

      const publish = (type: string, payload: Record<string, unknown> = {}) =>
        events.publish(db, { projectId, generationId, type, payload }).then(() => undefined);

      // Two requests can pass the API's cap check at once; refuse anything over the plan.
      const caps = await recheckBuildCaps(db, generationId, now());
      if (!caps.ok) {
        await db
          .update(schema.generations)
          .set({
            status: "failed",
            model,
            errorCode: caps.error.code,
            errorDetail: caps.error.message,
            finishedAt: now(),
          })
          .where(eq(schema.generations.id, generationId));
        await publish(TERMINAL_EVENT, { status: "failed", errorCode: caps.error.code });
        ctx.log.warn("generation refused by cap re-check", { cap: caps.error.code });
        return;
      }

      // Base files: the current snapshot, or the bare template for a new project.
      let baseFiles: FileSet = loadTemplateFiles();
      if (generation.baseSnapshotId) {
        const [base] = await db
          .select()
          .from(schema.snapshots)
          .where(eq(schema.snapshots.id, generation.baseSnapshotId));
        if (base) baseFiles = await deps.storage.getSnapshot(base.storageKey);
      }

      // Conversation: earlier messages are history; the trigger message is the request.
      const [trigger] = generation.triggerMessageId
        ? await db
            .select()
            .from(schema.messages)
            .where(eq(schema.messages.id, generation.triggerMessageId))
        : [];
      const earlier = await db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.projectId, projectId),
            trigger ? lt(schema.messages.createdAt, trigger.createdAt) : undefined,
          ),
        )
        .orderBy(asc(schema.messages.createdAt));
      const history: HistoryMessage[] = earlier
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const startedAt = now();
      await analytics.track(
        db,
        "build.started",
        { generation_id: generationId, kind: generation.kind, model },
        { userId: generation.userId, projectId },
      );

      const ports: GenerationPorts = {
        provider: deps.provider,
        models: deps.models,
        typecheck: (files, signal) => deps.typecheck(files, signal),
        bundle: (files, signal) => deps.bundle(projectId, files, signal),
        now,
        isCancelled: () => ctx.isCancelRequested(),
        signal: ctx.signal,
        events: {
          publish: (type, payload) => publish(type, payload),
          delta: (text) =>
            void events.publishDelta(db, projectId, generationId, text).catch(() => undefined),
        },
        store: {
          async setStatus(status) {
            await db
              .update(schema.generations)
              .set({ status, ...(status === "planning" ? { startedAt: now() } : {}) })
              .where(eq(schema.generations.id, generationId));
          },
          async recordStep(step) {
            await db.insert(schema.generationSteps).values({ generationId, ...step });
            await analytics.track(
              db,
              "build.step",
              {
                generation_id: generationId,
                step: step.step,
                status: step.status,
                duration_ms: step.finishedAt.getTime() - step.startedAt.getTime(),
              },
              { userId: generation.userId, projectId },
            );
            if (step.step === "repair") {
              await analytics.track(
                db,
                "build.repair",
                {
                  generation_id: generationId,
                  attempt: Number(step.detail?.attempt),
                  source: step.detail?.source === "bundle" ? "bundle" : "typecheck",
                },
                { userId: generation.userId, projectId },
              );
            }
          },
          async saveAssistantMessage(content) {
            await db
              .insert(schema.messages)
              .values({ projectId, role: "assistant", content, generationId });
          },
          async createSnapshot(files) {
            const snapshot = await createSnapshot(db, deps.storage, {
              projectId,
              files,
              parentId: generation.baseSnapshotId,
              generationId,
            });
            return snapshot.id;
          },
          async setCurrentSnapshot(snapshotId) {
            await db
              .update(schema.projects)
              .set({ currentSnapshotId: snapshotId })
              .where(eq(schema.projects.id, projectId));
          },
          async finish(result: RunResult) {
            await db
              .update(schema.generations)
              .set({
                status: result.status,
                model: result.model,
                repairAttempts: result.repairAttempts,
                inputTokens: result.usage.inputTokens,
                cachedTokens: result.usage.cachedTokens,
                outputTokens: result.usage.outputTokens,
                costUsd: result.costUsd.toFixed(6),
                errorCode: result.errorCode ?? null,
                errorDetail: result.errorDetail ?? null,
                resultSnapshotId: result.snapshotId ?? null,
                screens: result.finish?.screens ?? null,
                finishedAt: now(),
              })
              .where(eq(schema.generations.id, generationId));
            await analytics.track(
              db,
              "build.finished",
              {
                generation_id: generationId,
                kind: generation.kind,
                status: result.status,
                repair_attempts: result.repairAttempts,
                wall_ms: now().getTime() - startedAt.getTime(),
                input_tokens: result.usage.inputTokens,
                cached_tokens: result.usage.cachedTokens,
                output_tokens: result.usage.outputTokens,
                cost_usd: result.costUsd,
              },
              { userId: generation.userId, projectId },
            );
          },
        },
      };

      const result = await runGeneration(
        {
          kind: generation.kind,
          baseFiles,
          history,
          userMessage: trigger?.content ?? "",
          manifest,
          apiDigest,
          foundationFiles,
          cacheKey: projectId,
        },
        ports,
      );
      // The build already succeeded; a preview push failure only leaves the old preview.
      if (result.status === "succeeded" && result.snapshotId && result.files) {
        await pushPreview(db, deps.preview, {
          projectId,
          snapshotId: result.snapshotId,
          files: result.files,
        }).catch((error: unknown) =>
          ctx.log.warn("preview push failed", { error: (error as Error).message }),
        );
      }
      ctx.log.info("generation finished", {
        status: result.status,
        error_code: result.errorCode,
        cost_usd: result.costUsd,
        turns: result.turns,
      });
    },
  };
}
