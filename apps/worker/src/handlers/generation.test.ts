import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { events, schema, usage } from "@buildly/db";
import { createTestDatabase, type TestDatabase } from "@buildly/db/testing";
import {
  costFor,
  type CheckOutcome,
  type Provider,
  type ProviderEvent,
  type ProviderRequest,
  type Usage,
} from "@buildly/generator";
import { createTestStorage } from "@buildly/storage/testing";
import { createLogger } from "../log";
import type { JobContext } from "../runner";
import { createGenerationHandler } from "./generation";

let t: TestDatabase;
let s: Awaited<ReturnType<typeof createTestStorage>>;
beforeAll(async () => {
  [t, s] = await Promise.all([createTestDatabase(), createTestStorage()]);
});
afterAll(async () => Promise.all([t?.cleanup(), s?.cleanup()]));

const models = { plan: "gpt-6.1-sol", edit: "gpt-6-luna" };
const USAGE: Usage = {
  inputTokens: 12_000,
  cachedTokens: 7_000,
  cacheWriteTokens: 2_000,
  outputTokens: 900,
};
const PLAN = "Plan: a Home screen with a welcome message.";
const HOME =
  'import { EmptyState, Screen } from "../components";\n\nexport function HomeScreen() {\n  return <Screen><EmptyState title="Welcome" /></Screen>;\n}\n';

/** Two turns: plan + write, then finish. */
function scriptedProvider(): Provider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];
  return {
    calls,
    async *stream(request): AsyncIterable<ProviderEvent> {
      calls.push(request);
      if (calls.length === 1) {
        yield { type: "text_delta", delta: PLAN };
        yield {
          type: "tool_call",
          callId: "c1",
          name: "write_file",
          arguments: JSON.stringify({ path: "src/screens/HomeScreen.tsx", contents: HOME }),
        };
      } else {
        yield {
          type: "tool_call",
          callId: "c2",
          name: "finish",
          arguments: JSON.stringify({ summary: "Added a welcome message.", screens: ["Home"] }),
        };
      }
      yield { type: "done", responseId: `r${calls.length}`, model: request.model, usage: USAGE };
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function newBuild(email: string, buildsAlready = 0) {
  const [user] = await t.db.insert(schema.users).values({ email }).returning();
  const [project] = await t.db
    .insert(schema.projects)
    .values({ userId: user!.id, name: "Welcome" })
    .returning();
  const [message] = await t.db
    .insert(schema.messages)
    .values({ projectId: project!.id, role: "user", content: "A welcome app" })
    .returning();
  const [generation] = await t.db
    .insert(schema.generations)
    .values({
      projectId: project!.id,
      userId: user!.id,
      kind: "initial",
      triggerMessageId: message!.id,
    })
    .returning();
  for (let i = 0; i <= buildsAlready; i++) {
    // Fixed mid-month dates, so the count never straddles a real month boundary.
    await usage.record(t.db, {
      userId: user!.id,
      projectId: project!.id,
      type: "build",
      occurredAt: new Date(Date.UTC(2026, 9, 10, 8, i)),
    });
  }
  return { user: user!, project: project!, generation: generation! };
}

function jobContext(payload: {
  generationId: string;
  projectId: string;
}): JobContext<{ generationId: string; projectId: string }> {
  return {
    jobId: "job-1",
    payload,
    signal: new AbortController().signal,
    log: createLogger({}, () => {}),
    isCancelRequested: async () => false,
    step: (_name, fn) => fn(),
    onCleanup: () => {},
  };
}

const ok: CheckOutcome = { ok: true, diagnostics: [] };

describe("generation job", () => {
  it("publishes plan ready, files written, types checked, preview bundled in order, each only after its step (4.4.4)", async () => {
    const { project, generation } = await newBuild("events@example.com");
    const typecheckGate = deferred();
    const bundleGate = deferred();
    const received: { type: string; createdAt: Date }[] = [];
    const subscription = await events.subscribe(t.pool, t.db, project.id, {
      onEvent: (event) => void received.push({ type: event.type, createdAt: event.createdAt }),
    });
    const handler = createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => {
        await typecheckGate.promise;
        return ok;
      },
      bundle: async () => {
        await bundleGate.promise;
        return ok;
      },
    });

    const running = handler.run(jobContext({ generationId: generation.id, projectId: project.id }));
    const settle = () => new Promise((r) => setTimeout(r, 300));

    await settle();
    expect(received.map((e) => e.type)).toEqual(["plan_ready", "files_written"]); // type check still running
    typecheckGate.resolve();
    await settle();
    expect(received.map((e) => e.type)).toEqual(["plan_ready", "files_written", "types_checked"]); // bundle still running
    bundleGate.resolve();
    await running;
    await settle();
    await subscription.close();

    expect(received.map((e) => e.type)).toEqual([
      "plan_ready",
      "files_written",
      "types_checked",
      "preview_bundled",
      "snapshot_created",
      "finished",
    ]);

    // Each progress event was written after its step finished.
    const steps = await t.db
      .select()
      .from(schema.generationSteps)
      .where(eq(schema.generationSteps.generationId, generation.id));
    const stepFor: Record<string, string> = {
      plan_ready: "plan",
      files_written: "edit",
      types_checked: "typecheck",
      preview_bundled: "bundle",
    };
    for (const event of received.filter((e) => stepFor[e.type])) {
      const step = steps.find((s) => s.step === stepFor[event.type])!;
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(step.finishedAt.getTime());
    }
  });

  it("writes cost and tokens on the terminal state and emits build.* events (4.4.5)", async () => {
    const { project, generation } = await newBuild("accounting@example.com");
    const provider = scriptedProvider();
    const handler = createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider,
      models,
      typecheck: async () => ok,
      bundle: async () => ok,
    });
    await handler.run(jobContext({ generationId: generation.id, projectId: project.id }));

    const [row] = await t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, generation.id));
    const summed = {
      inputTokens: 24_000,
      cachedTokens: 14_000,
      cacheWriteTokens: 4_000,
      outputTokens: 1_800,
    };
    expect(row).toMatchObject({
      status: "succeeded",
      model: "gpt-6.1-sol",
      inputTokens: 24_000,
      cachedTokens: 14_000,
      outputTokens: 1_800,
      repairAttempts: 0,
      errorCode: null,
    });
    expect(row!.costUsd).toBe(costFor(summed, "gpt-6.1-sol").toFixed(6));
    expect(row!.startedAt).not.toBeNull();
    expect(row!.finishedAt).not.toBeNull();

    const tracked = await t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.projectId, project.id))
      .orderBy(asc(schema.analyticsEvents.occurredAt));
    const names = tracked.map((e) => e.name);
    expect(names[0]).toBe("build.started");
    expect(names.filter((n) => n === "build.step").length).toBeGreaterThanOrEqual(4);
    const finished = tracked.find((e) => e.name === "build.finished");
    expect(finished?.props).toMatchObject({
      generation_id: generation.id,
      status: "succeeded",
      cost_usd: costFor(summed, "gpt-6.1-sol"),
      input_tokens: 24_000,
    });

    // The snapshot became current, and the plan and summary are in the conversation.
    const [after] = await t.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(after!.currentSnapshotId).toBe(row!.resultSnapshotId);
    const [snapshot] = await t.db
      .select()
      .from(schema.snapshots)
      .where(eq(schema.snapshots.id, row!.resultSnapshotId!));
    expect(await s.storage.getSnapshot(snapshot!.storageKey)).toMatchObject({
      "src/screens/HomeScreen.tsx": HOME,
    });
    const assistant = await t.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.projectId, project.id), eq(schema.messages.role, "assistant")))
      .orderBy(asc(schema.messages.createdAt));
    expect(assistant.map((m) => m.content)).toEqual([PLAN, "Added a welcome message."]);
    expect(provider.calls[0]!.promptCacheKey).toBe(project.id);
  });

  it("re-checks caps on claim: a build over the plan fails without calling the model", async () => {
    const { project, generation } = await newBuild("over-cap@example.com", 15);
    const provider = scriptedProvider();
    const handler = createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider,
      models,
      typecheck: async () => ok,
      bundle: async () => ok,
      now: () => new Date("2026-10-15T12:00:00Z"),
    });
    await handler.run(jobContext({ generationId: generation.id, projectId: project.id }));
    const [row] = await t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, generation.id));
    expect(row).toMatchObject({ status: "failed", errorCode: "monthly_builds" });
    expect(provider.calls).toHaveLength(0);
    expect((await events.since(t.db, project.id)).map((e) => e.type)).toEqual(["finished"]);
  });
});
