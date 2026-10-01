import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { events, schema, usage } from "@buildly/db";
import { createTestDatabase, type TestDatabase } from "@buildly/db/testing";
import {
  costFor,
  type CheckOutcome,
  type FileSet,
  type Provider,
  type ProviderEvent,
  type ProviderRequest,
  type Usage,
} from "@buildly/generator";
import { createTestStorage } from "@buildly/storage/testing";
import { createLogger } from "../log";
import type { JobContext } from "../runner";
import { createGenerationHandler } from "./generation";
import { createPreviewHandler, type PreviewPusher } from "./preview";

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

/** Polls `condition` until it holds; fails after `timeoutMs` (CI runners are slow). */
async function waitFor(condition: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("waitFor: condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
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

/** Records pushes to the live preview; the first push opens channel "chan-1". */
function fakePreview() {
  const pushes: { projectId: string; channel: string | null; files: FileSet }[] = [];
  const push: PreviewPusher = (project, files) => {
    pushes.push({ projectId: project.id, channel: project.channel, files });
    return Promise.resolve({ channel: project.channel ?? "chan-1" });
  };
  return { pushes, push };
}

/** A follow-up edit build on the project's current snapshot, as postMessage starts it. */
async function nextBuild(project: { id: string; userId: string }, content: string) {
  const [current] = await t.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, project.id));
  const [message] = await t.db
    .insert(schema.messages)
    .values({ projectId: project.id, role: "user", content })
    .returning();
  const [generation] = await t.db
    .insert(schema.generations)
    .values({
      projectId: project.id,
      userId: project.userId,
      kind: "edit",
      triggerMessageId: message!.id,
      baseSnapshotId: current!.currentSnapshotId,
    })
    .returning();
  await usage.record(t.db, {
    userId: project.userId,
    projectId: project.id,
    type: "build",
    occurredAt: new Date(Date.UTC(2026, 9, 10, 9)),
  });
  return generation!;
}

describe("generation job", () => {
  it("publishes plan ready, files written, types checked, preview bundled in order, each only after its step (4.4.4)", async () => {
    const { project, generation } = await newBuild("events@example.com");
    const typecheckGate = deferred();
    const bundleGate = deferred();
    let typecheckEntered = false;
    let bundleEntered = false;
    const received: { type: string; createdAt: Date }[] = [];
    const types = () => received.map((e) => e.type);
    const subscription = await events.subscribe(t.pool, t.db, project.id, {
      onEvent: (event) => void received.push({ type: event.type, createdAt: event.createdAt }),
    });
    const handler = createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => {
        typecheckEntered = true;
        await typecheckGate.promise;
        return ok;
      },
      bundle: async () => {
        bundleEntered = true;
        await bundleGate.promise;
        return ok;
      },
      preview: fakePreview().push,
    });

    const running = handler.run(jobContext({ generationId: generation.id, projectId: project.id }));
    try {
      // The build is parked in the type check: the edit step is done and nothing later ran.
      await waitFor(() => typecheckEntered && received.length >= 2);
      expect(types()).toEqual(["plan_ready", "files_written"]);
      typecheckGate.resolve();
      await waitFor(() => bundleEntered && received.length >= 3);
      expect(types()).toEqual(["plan_ready", "files_written", "types_checked"]);
      bundleGate.resolve();
      await running;
      await waitFor(() => received.length >= 7);
    } finally {
      // A failed assertion must not leave the build parked, holding a connection.
      typecheckGate.resolve();
      bundleGate.resolve();
      await running.catch(() => undefined);
      await subscription.close();
    }

    expect(types()).toEqual([
      "plan_ready",
      "files_written",
      "types_checked",
      "preview_bundled",
      "snapshot_created",
      "finished",
      "preview_updated",
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
      preview: fakePreview().push,
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
      preview: fakePreview().push,
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

  it("chains snapshots across builds and pushes each one to the live preview (4.6.1)", async () => {
    const { project, generation } = await newBuild("chain@example.com");
    const preview = fakePreview();
    const handler = createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => ok,
      bundle: async () => ok,
      preview: preview.push,
      now: () => new Date("2026-10-15T12:00:00Z"),
    });
    await handler.run(jobContext({ generationId: generation.id, projectId: project.id }));
    const second = await nextBuild(project, "Say hello instead");
    expect(second.baseSnapshotId).not.toBeNull();
    // A fresh scripted provider: its first turn plans and writes again.
    await createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => ok,
      bundle: async () => ok,
      preview: preview.push,
      now: () => new Date("2026-10-15T12:00:00Z"),
    }).run(jobContext({ generationId: second.id, projectId: project.id }));

    const [after] = await t.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    // Walk the parent chain from the current snapshot.
    const chain: (typeof schema.snapshots.$inferSelect)[] = [];
    for (let id = after!.currentSnapshotId; id;) {
      const [row] = await t.db.select().from(schema.snapshots).where(eq(schema.snapshots.id, id));
      chain.push(row!);
      id = row!.parentSnapshotId;
    }
    expect(chain).toHaveLength(2);
    expect(chain[0]!.createdByGenerationId).toBe(second.id);
    expect(chain[1]!.id).toBe(second.baseSnapshotId);
    expect(chain[1]!.createdByGenerationId).toBe(generation.id);

    // Both snapshots reached the live preview; the second push reused the stored channel.
    expect(preview.pushes.map((p) => p.channel)).toEqual([null, "chan-1"]);
    expect(preview.pushes[1]!.files).toEqual(await s.storage.getSnapshot(chain[0]!.storageKey));
    expect(after!.snackSessionId).toBe("chan-1");
    const types = (await events.since(t.db, project.id)).map((e) => e.type);
    expect(types.filter((type) => type === "preview_updated")).toHaveLength(2);
  });

  it("a failed build keeps the current snapshot and does not touch the preview", async () => {
    const { project, generation } = await newBuild("failed-build@example.com");
    const preview = fakePreview();
    await createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => ({
        ok: false,
        diagnostics: [{ source: "typecheck", message: "Type error." }],
      }),
      bundle: async () => ok,
      preview: preview.push,
      now: () => new Date("2026-10-15T12:00:00Z"),
    }).run(jobContext({ generationId: generation.id, projectId: project.id }));
    const [after] = await t.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(after!.currentSnapshotId).toBeNull();
    expect(preview.pushes).toHaveLength(0);
  });
});

describe("preview job", () => {
  it("pushes the project's current snapshot to its stored channel", async () => {
    const { project, generation } = await newBuild("preview-job@example.com");
    const first = fakePreview();
    await createGenerationHandler({
      db: t.db,
      storage: s.storage,
      provider: scriptedProvider(),
      models,
      typecheck: async () => ok,
      bundle: async () => ok,
      preview: first.push,
      now: () => new Date("2026-10-15T12:00:00Z"),
    }).run(jobContext({ generationId: generation.id, projectId: project.id }));

    const preview = fakePreview();
    await createPreviewHandler({ db: t.db, storage: s.storage, preview: preview.push }).run({
      ...jobContext({ generationId: "", projectId: project.id }),
      payload: { projectId: project.id },
    });
    expect(preview.pushes).toHaveLength(1);
    expect(preview.pushes[0]).toMatchObject({ projectId: project.id, channel: "chan-1" });
    expect(preview.pushes[0]!.files["src/screens/HomeScreen.tsx"]).toBe(HOME);
  });
});
