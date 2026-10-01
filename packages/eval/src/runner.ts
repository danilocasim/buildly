// Runs one task through the real generation loop (`runGeneration`) with in-memory store
// and event ports, then scores it. The provider, type check, bundle, and smoke tests are
// injected: real ones for model runs, fakes for --dry-run and tests.
import { loadFoundationFiles, readApiDigest, readManifest } from "@buildly/foundation";
import {
  GENERATION_TIMEOUT_MS,
  runGeneration,
  type CheckOutcome,
  type FileSet,
  type ModelConfig,
  type Provider,
  type StepName,
} from "@buildly/generator";
import {
  runChecks,
  smokePasses,
  type CheckResult,
  type RunOutcome,
  type SmokeResult,
} from "./checks";
import { baseFilesFor, type EvalTask, type StarterSlug, type TaskGroup } from "./tasks";

export interface EvalPorts {
  provider: Provider;
  models: ModelConfig;
  typecheck(files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  bundle(files: FileSet, signal: AbortSignal): Promise<CheckOutcome>;
  smoke(slug: StarterSlug, files: FileSet, task: EvalTask): Promise<SmokeResult>;
  now?: () => Date;
  /** Receives each run's final files and assistant messages (`--keep-files`), for diagnosis. */
  keep?(task: EvalTask, run: number, files: FileSet, messages: string[]): Promise<void>;
}

/** One row of the JSON report (EVAL.md "Scoring per run"). */
export interface RunRecord {
  task: EvalTask["id"];
  group: TaskGroup;
  kind: EvalTask["kind"];
  run: number;
  model: string;
  passed: boolean;
  checks: CheckResult[];
  status: string;
  error_code: string | null;
  repair_attempts: number;
  turns: number;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  cost_usd: number;
  wall_seconds: number;
  rejections: number;
}

export async function runTask(task: EvalTask, run: number, ports: EvalPorts): Promise<RunRecord> {
  const now = ports.now ?? (() => new Date());
  const baseFiles = baseFilesFor(task);
  const steps: RunOutcome["steps"] = [];
  const messages: string[] = [];
  let snapshots = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS + 5_000);
  const started = Date.now();

  const result = await runGeneration(
    {
      kind: task.kind,
      baseFiles,
      history: [],
      userMessage: task.prompt,
      manifest: readManifest(),
      apiDigest: readApiDigest(),
      foundationFiles: loadFoundationFiles(),
      cacheKey: `eval-${task.id}`,
    },
    {
      provider: ports.provider,
      models: ports.models,
      typecheck: (files, signal) => ports.typecheck(files, signal),
      bundle: (files, signal) => ports.bundle(files, signal),
      now,
      isCancelled: () => Promise.resolve(false),
      signal: controller.signal,
      events: { publish: () => Promise.resolve(), delta: () => {} },
      store: {
        setStatus: () => Promise.resolve(),
        recordStep: (step: { step: StepName; status: "succeeded" | "failed" }) => {
          steps.push({ step: step.step, status: step.status });
          return Promise.resolve();
        },
        saveAssistantMessage: (content) => {
          messages.push(content);
          return Promise.resolve();
        },
        createSnapshot: () => Promise.resolve(`snapshot-${++snapshots}`),
        setCurrentSnapshot: () => Promise.resolve(),
        finish: () => Promise.resolve(),
      },
    },
  ).finally(() => clearTimeout(timer));
  const wallSeconds = (Date.now() - started) / 1000;

  const files = result.files ?? baseFiles;
  const outcome: RunOutcome = { baseFiles, files, result, steps, messages };
  if (task.base !== "foundation" && task.checks.includes(smokePasses)) {
    outcome.smoke = await ports.smoke(task.base, files, task);
  }
  const checks = runChecks(task.checks, outcome);
  await ports.keep?.(task, run, files, messages);

  return {
    task: task.id,
    group: task.group,
    kind: task.kind,
    run,
    model: result.model,
    passed: checks.every((c) => c.ok),
    checks,
    status: result.status,
    error_code: result.errorCode ?? null,
    repair_attempts: result.repairAttempts,
    turns: result.turns,
    input_tokens: result.usage.inputTokens,
    cached_tokens: result.usage.cachedTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: result.costUsd,
    wall_seconds: Math.round(wallSeconds * 10) / 10,
    rejections: result.rejections,
  };
}
