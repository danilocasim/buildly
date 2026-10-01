// The generation state machine (ARCHITECTURE.md §3):
//   planning → editing (tool loop) → checking → bundling → snapshot → succeeded
// with up to two repairs (checking or bundling failure → repairing → editing), and
// cancellation and the 4-minute limit checked between steps. Every dependency is a port,
// so tests run it with fakes and the worker wires the real ones.
//
// Invariants: steps and progress events are recorded only after the operation they
// describe completed; the current snapshot changes only in the snapshot step.
import {
  formatDiagnostic,
  type Diagnostic,
  type FoundationManifest,
  type GenerationErrorCode,
} from "@buildly/shared";
import {
  buildContext,
  ContextTooLargeError,
  toProviderInput,
  type HistoryMessage,
} from "./context";
import {
  addUsage,
  emptyUsage,
  ProviderError,
  type InputItem,
  type Provider,
  type Usage,
} from "./provider";
import { costFor } from "./rates";
import { modelFor, primaryModel, type BuildKind, type ModelConfig, type Stage } from "./routing";
import {
  RejectionBudgetExceeded,
  TOOL_DEFINITIONS,
  ToolExecutor,
  type FinishResult,
} from "./tools/executor";
import { ProjectFiles, type FileSet } from "./tools/project-files";

export const GENERATION_TIMEOUT_MS = 240_000;
export const MAX_REPAIRS = 2;
/** Model turns allowed in one edit pass before the run gives up. */
export const MAX_TURNS_PER_PASS = 25;

export type GenerationStatus =
  | "queued"
  | "planning"
  | "editing"
  | "checking"
  | "bundling"
  | "repairing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type StepName = "plan" | "edit" | "typecheck" | "bundle" | "repair" | "snapshot";

export type GenerationEventType =
  | "plan_ready"
  | "files_written"
  | "types_checked"
  | "typecheck_failed"
  | "preview_bundled"
  | "bundle_failed"
  | "repair_started"
  | "snapshot_created"
  | "finished";

/** The codes and their user-facing copy live in @buildly/shared (failures.ts). */
export type ErrorCode = GenerationErrorCode;

export interface CheckOutcome {
  ok: boolean;
  diagnostics: Diagnostic[];
}

export interface GenerationPorts {
  provider: Provider;
  models: ModelConfig;
  /** tsc --noEmit on foundation + project files (packages/checker). */
  typecheck(files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  /** Pushes to the project's Snack session and waits for the bundle (packages/snack). */
  bundle(files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  store: GenerationStore;
  events: GenerationEvents;
  now(): Date;
  isCancelled(): Promise<boolean>;
  /** Aborted by the worker's hard timeout or shutdown. */
  signal: AbortSignal;
}

export interface GenerationStore {
  setStatus(status: GenerationStatus): Promise<void>;
  recordStep(step: {
    step: StepName;
    status: "succeeded" | "failed";
    detail?: Record<string, unknown>;
    startedAt: Date;
    finishedAt: Date;
  }): Promise<void>;
  saveAssistantMessage(content: string): Promise<void>;
  /** Stores the files as a snapshot whose parent is the base snapshot; returns its id. */
  createSnapshot(files: FileSet): Promise<string>;
  /** The only place the project's current snapshot changes during a build. */
  setCurrentSnapshot(snapshotId: string): Promise<void>;
  finish(result: RunResult): Promise<void>;
}

export interface GenerationEvents {
  /** Persisted progress event, published after the step completed. */
  publish(type: GenerationEventType, payload?: Record<string, unknown>): Promise<void>;
  /** Streaming assistant text (not persisted). */
  delta(text: string): void;
}

export interface GenerationInput {
  kind: BuildKind;
  /** The project's files at the start (the base snapshot, or the bare template). */
  baseFiles: FileSet;
  history: HistoryMessage[];
  userMessage: string;
  manifest: FoundationManifest;
  apiDigest: string;
  foundationFiles: FileSet;
  /** Keys the provider's prompt cache (one per project). */
  cacheKey: string;
}

export interface RunResult {
  status: Extract<GenerationStatus, "succeeded" | "failed" | "cancelled" | "timed_out">;
  /** generations.model: the model that planned and built this kind of run. */
  model: string;
  /** Every model actually called, in order (repairs may use the edit model). */
  modelsCalled: string[];
  repairAttempts: number;
  usage: Usage;
  costUsd: number;
  turns: number;
  rejections: number;
  errorCode?: ErrorCode;
  errorDetail?: string;
  snapshotId?: string;
  finish?: FinishResult;
  files?: FileSet;
}

type StepOutcome<T> = { ok: boolean; value: T; detail?: Record<string, unknown> };

class Stop extends Error {
  constructor(
    readonly status: RunResult["status"],
    readonly errorCode: ErrorCode,
    readonly detail: string,
  ) {
    super(detail);
  }
}

const MAX_DETAIL = 4000;
const formatDiagnostics = (diagnostics: Diagnostic[]) =>
  diagnostics.slice(0, 20).map(formatDiagnostic).join("\n").slice(0, MAX_DETAIL) || "(no details)";

export async function runGeneration(
  input: GenerationInput,
  ports: GenerationPorts,
): Promise<RunResult> {
  const startedAt = ports.now();
  const files = new ProjectFiles(input.baseFiles);
  const tools = new ToolExecutor(files, input.foundationFiles, input.manifest);
  const usageByModel = new Map<string, Usage>();
  const modelsCalled: string[] = [];
  let turns = 0;
  let repairAttempts = 0;
  const items: InputItem[] = [];

  /** Between steps: cancelled or out of time? */
  async function checkpoint() {
    if (ports.signal.aborted) {
      const reason: unknown = ports.signal.reason;
      if (reason instanceof Error && reason.name === "JobCancelled")
        throw new Stop("cancelled", "cancelled", "Cancelled by the user.");
      throw new Stop("timed_out", "timeout", "The build took longer than 4 minutes.");
    }
    if (ports.now().getTime() - startedAt.getTime() > GENERATION_TIMEOUT_MS) {
      throw new Stop("timed_out", "timeout", "The build took longer than 4 minutes.");
    }
    if (await ports.isCancelled())
      throw new Stop("cancelled", "cancelled", "Cancelled by the user.");
  }

  async function step<T>(name: StepName, run: () => StepOutcome<T> | Promise<StepOutcome<T>>) {
    const began = ports.now();
    const outcome = await run();
    await ports.store.recordStep({
      step: name,
      status: outcome.ok ? "succeeded" : "failed",
      detail: outcome.detail,
      startedAt: began,
      finishedAt: ports.now(),
    });
    return outcome;
  }

  let context: ReturnType<typeof toProviderInput>;
  try {
    context = toProviderInput(
      buildContext({
        manifest: input.manifest,
        apiDigest: input.apiDigest,
        files: input.baseFiles,
        history: input.history,
        userMessage: input.userMessage,
      }),
    );
  } catch (error) {
    if (error instanceof ContextTooLargeError) {
      return finish({
        status: "failed",
        errorCode: "context_too_large",
        errorDetail: error.message,
      });
    }
    throw error;
  }

  /** One model turn: streams text, runs tool calls, appends both to the conversation. */
  async function turn(stage: Stage, streamText: boolean): Promise<string> {
    await checkpoint();
    const model = modelFor(input.kind, stage, ports.models);
    modelsCalled.push(model);
    turns += 1;
    let text = "";
    const calls: { callId: string; name: string; arguments: string }[] = [];
    try {
      for await (const event of ports.provider.stream({
        model,
        instructions: context.instructions,
        input: [...context.input, ...items],
        tools: TOOL_DEFINITIONS,
        promptCacheKey: input.cacheKey,
        signal: ports.signal,
      })) {
        if (event.type === "text_delta") {
          text += event.delta;
          if (streamText) ports.events.delta(event.delta);
        } else if (event.type === "tool_call") {
          calls.push(event);
        } else {
          usageByModel.set(model, addUsage(usageByModel.get(model) ?? emptyUsage(), event.usage));
        }
      }
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "aborted") await checkpoint();
      if (error instanceof ProviderError)
        throw new Stop("failed", "provider_error", `The AI provider failed: ${error.message}`);
      throw error;
    }
    if (text) items.push({ role: "assistant", content: text });
    for (const call of calls) {
      items.push({
        type: "function_call",
        callId: call.callId,
        name: call.name,
        arguments: call.arguments,
      });
      let output: string;
      try {
        output = tools.execute(call);
      } catch (error) {
        if (error instanceof RejectionBudgetExceeded) {
          // Mostly imports of packages outside the allowlist: the request needs a dependency
          // Buildly cannot add, which the user should hear as such (TODO 7.3.3).
          const imports = error.rejections.filter((r) => r.reason === "import_not_allowed");
          const code =
            imports.length * 2 >= error.rejections.length
              ? "dependency_not_allowed"
              : "too_many_rejections";
          throw new Stop("failed", code, error.message);
        }
        throw error;
      }
      items.push({ type: "function_call_output", callId: call.callId, output });
    }
    return text;
  }

  /** Model turns until it calls finish. The first turn of the run also produces the plan. */
  async function editPass(stage: Stage) {
    tools.resetFinish();
    let first = stage !== "repair";
    for (let i = 0; i < MAX_TURNS_PER_PASS; i++) {
      const text = await turn(first && turns === 0 ? "plan" : stage, true);
      if (first && turns === 1) {
        await step("plan", () => ({ ok: true, value: undefined, detail: { plan: text } }));
        if (text) await ports.store.saveAssistantMessage(text);
        await ports.events.publish("plan_ready", { plan: text });
        await ports.store.setStatus("editing");
        first = false;
      }
      const done = tools.finishResult();
      if (done) return done;
    }
    throw new Stop(
      "failed",
      "no_finish",
      `The model did not finish within ${MAX_TURNS_PER_PASS} turns.`,
    );
  }

  async function verify(): Promise<
    { source: "typecheck" | "bundle"; diagnostics: Diagnostic[] } | undefined
  > {
    await checkpoint();
    await ports.store.setStatus("checking");
    const typed = await step("typecheck", async () => {
      const outcome = await ports.typecheck(files.toFileSet(), ports.signal);
      return {
        ok: outcome.ok,
        value: outcome,
        detail: { diagnostics: outcome.diagnostics.slice(0, 20) },
      };
    });
    if (!typed.ok) {
      await ports.events.publish("typecheck_failed", {
        diagnostics: typed.value.diagnostics.length,
      });
      return { source: "typecheck", diagnostics: typed.value.diagnostics };
    }
    await ports.events.publish("types_checked");

    await checkpoint();
    await ports.store.setStatus("bundling");
    const bundled = await step("bundle", async () => {
      const outcome = await ports.bundle(files.toFileSet(), ports.signal);
      return {
        ok: outcome.ok,
        value: outcome,
        detail: { diagnostics: outcome.diagnostics.slice(0, 20) },
      };
    });
    if (!bundled.ok) {
      await ports.events.publish("bundle_failed", {
        diagnostics: bundled.value.diagnostics.length,
      });
      return { source: "bundle", diagnostics: bundled.value.diagnostics };
    }
    await ports.events.publish("preview_bundled");
    return undefined;
  }

  try {
    await ports.store.setStatus("planning");
    let finishResult = await editPass("build");
    await step("edit", () => ({
      ok: true,
      value: undefined,
      detail: { changed: files.changedPaths(), turns, rejections: tools.rejections.length },
    }));
    await ports.events.publish("files_written", { changed: files.changedPaths().length });

    for (;;) {
      const failure = await verify();
      if (!failure) break;
      if (repairAttempts >= MAX_REPAIRS) {
        throw new Stop("failed", failure.source, formatDiagnostics(failure.diagnostics));
      }
      repairAttempts += 1;
      await ports.store.setStatus("repairing");
      await ports.events.publish("repair_started", {
        attempt: repairAttempts,
        source: failure.source,
      });
      items.push({
        role: "developer",
        content: `The build failed ${failure.source === "typecheck" ? "type checking" : "bundling"} (repair ${repairAttempts} of ${MAX_REPAIRS}):\n${formatDiagnostics(failure.diagnostics)}\nFix these with the tools, then call finish again.`,
      });
      await ports.store.setStatus("editing");
      finishResult = await editPass("repair");
      await step("repair", () => ({
        ok: true,
        value: undefined,
        detail: { attempt: repairAttempts, source: failure.source, changed: files.changedPaths() },
      }));
    }

    await checkpoint();
    const snapshot = await step("snapshot", async () => {
      const snapshotId = await ports.store.createSnapshot(files.toFileSet());
      await ports.store.setCurrentSnapshot(snapshotId);
      return { ok: true, value: snapshotId, detail: { snapshotId, files: files.list().length } };
    });
    await ports.events.publish("snapshot_created", { snapshotId: snapshot.value });
    if (finishResult.summary) await ports.store.saveAssistantMessage(finishResult.summary);
    return finish({ status: "succeeded", snapshotId: snapshot.value, finish: finishResult });
  } catch (error) {
    if (error instanceof Stop) {
      return finish({
        status: error.status,
        errorCode: error.errorCode,
        errorDetail: error.detail,
      });
    }
    throw error;
  }

  async function finish(
    outcome: Pick<RunResult, "status" | "errorCode" | "errorDetail" | "snapshotId" | "finish">,
  ): Promise<RunResult> {
    let usage = emptyUsage();
    let costUsd = 0;
    for (const [model, modelUsage] of usageByModel) {
      usage = addUsage(usage, modelUsage);
      costUsd += costFor(modelUsage, model);
    }
    const result: RunResult = {
      ...outcome,
      model: primaryModel(input.kind, ports.models),
      modelsCalled,
      repairAttempts,
      usage,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      turns,
      rejections: tools.rejections.length,
      files: files.toFileSet(),
    };
    await ports.store.finish(result);
    await ports.events.publish("finished", {
      status: result.status,
      errorCode: result.errorCode ?? null,
    });
    return result;
  }
}
