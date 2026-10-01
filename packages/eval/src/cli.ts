// pnpm eval --plan-model <m> --edit-model <m> | --model <m>
//           [--tasks smoke|all|T1,T4] [--runs N] [--out file.json] [--dry-run] [--keep-files dir]
// Real runs call the OpenAI API (OPENAI_API_KEY; models default to GENERATION_MODEL_PLAN
// and GENERATION_MODEL_EDIT) and Snack; --dry-run uses a scripted provider and skips Snack.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { typecheckFiles } from "@buildly/checker";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import {
  createOpenAIProvider,
  modelsFromConfig,
  type CheckOutcome,
  type ModelConfig,
} from "@buildly/generator";
import { createSnackManager } from "@buildly/snack";
import { dryRunProvider } from "./dry-run";
import { renderMarkdown, type EvalReport } from "./report";
import { runTask, type EvalPorts, type RunRecord } from "./runner";
import { runSmokeTests } from "./smoke";
import { selectTasks, type EvalTask } from "./tasks";

export interface EvalOptions {
  tasks: string;
  runs: number;
  models: ModelConfig;
  dryRun: boolean;
  /** Directory for each run's final files and messages (`--keep-files <dir>`). */
  keepFiles?: string;
}

/**
 * Runs every selected task `runs` times, sequentially, and returns the report. `onRun` gets
 * each record and the report so far, so a caller can save partial results as it goes.
 */
export async function runEval(
  options: EvalOptions,
  portsFor: (task: EvalTask) => EvalPorts,
  onRun: (record: RunRecord, soFar: EvalReport) => void | Promise<void> = () => {},
): Promise<EvalReport> {
  const startedAt = new Date().toISOString();
  const runs: RunRecord[] = [];
  const report = (): EvalReport => ({
    version: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    config: {
      planModel: options.models.plan,
      editModel: options.models.edit,
      tasks: options.tasks,
      runs: options.runs,
      dryRun: options.dryRun,
    },
    runs: [...runs],
  });
  for (const task of selectTasks(options.tasks)) {
    for (let run = 1; run <= options.runs; run++) {
      const record = await runTask(task, run, portsFor(task));
      runs.push(record);
      await onRun(record, report());
    }
  }
  return report();
}

const BUNDLE_TIMEOUT_MS = 60_000;

/** Real type check and smoke tests; the provider and bundle are real unless dry-run. */
export function defaultPorts(models: ModelConfig, dryRun: boolean): (task: EvalTask) => EvalPorts {
  const foundationFiles = loadFoundationFiles();
  const ok: CheckOutcome = { ok: true, diagnostics: [] };
  const provider = dryRun
    ? undefined
    : createOpenAIProvider({
        apiKey: requiredEnv("OPENAI_API_KEY"),
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      });
  const snack = dryRun
    ? undefined
    : createSnackManager({ manifest: readManifest(), foundationFiles });
  return (task) => ({
    provider: provider ?? dryRunProvider(task),
    models,
    typecheck: (files) => typecheckFiles(foundationFiles, files),
    bundle: snack
      ? (files) =>
          snack.checkBundle({ id: `eval-${task.id}`, name: task.title }, files, BUNDLE_TIMEOUT_MS)
      : () => Promise.resolve(ok),
    smoke: (slug, files) => runSmokeTests(slug, files, { rewriteTest: task.smokeTest }),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (put it in .env or the environment).`);
  return value;
}

export function parseOptions(argv: string[]): EvalOptions & { out?: string } {
  const { values } = parseArgs({
    args: argv,
    options: {
      "plan-model": { type: "string" },
      "edit-model": { type: "string" },
      model: { type: "string" },
      tasks: { type: "string", default: "smoke" },
      runs: { type: "string", default: "1" },
      out: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "keep-files": { type: "string" },
    },
    strict: true,
  });
  const runs = Number(values.runs);
  if (!Number.isInteger(runs) || runs < 1) throw new Error("--runs must be a positive integer");
  const plan = values.model ?? values["plan-model"] ?? process.env.GENERATION_MODEL_PLAN;
  const edit = values.model ?? values["edit-model"] ?? process.env.GENERATION_MODEL_EDIT;
  if (!plan || !edit)
    throw new Error("Pass --plan-model and --edit-model, or --model (or set GENERATION_MODEL_*)");
  return {
    tasks: values.tasks,
    runs,
    models: modelsFromConfig({ GENERATION_MODEL_PLAN: plan, GENERATION_MODEL_EDIT: edit }),
    dryRun: values["dry-run"],
    keepFiles: values["keep-files"],
    out: values.out,
  };
}

export function defaultOutPath(options: EvalOptions, date = new Date()): string {
  const config =
    options.models.plan === options.models.edit
      ? options.models.plan
      : `${options.models.plan}+${options.models.edit}`;
  return `.eval/${date.toISOString().slice(0, 10)}-${config}${options.dryRun ? "-dry-run" : ""}.json`;
}

export async function main(argv: string[]): Promise<void> {
  const options = parseOptions(argv);
  const out = resolve(options.out ?? defaultOutPath(options));
  await mkdir(dirname(out), { recursive: true });
  const save = (report: EvalReport) => writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  const portsFor = defaultPorts(options.models, options.dryRun);
  const keepDir = options.keepFiles ? resolve(options.keepFiles) : undefined;
  const ports = (task: EvalTask): EvalPorts => ({
    ...portsFor(task),
    keep: keepDir
      ? async (t, run, files, messages) => {
          const dir = join(keepDir, `${t.id}-${run}`);
          for (const [path, contents] of Object.entries(files)) {
            await mkdir(dirname(join(dir, "files", path)), { recursive: true });
            await writeFile(join(dir, "files", path), contents);
          }
          await writeFile(join(dir, "messages.md"), messages.join("\n\n---\n\n"));
        }
      : undefined,
  });
  const report = await runEval(options, ports, async (r, soFar) => {
    // Saved after every run, so a stopped eval keeps what it finished.
    await save(soFar);
    process.stderr.write(
      `${r.task} #${r.run} ${r.passed ? "passed" : "FAILED"} ${r.status} ${r.wall_seconds}s $${r.cost_usd.toFixed(4)}` +
        `${
          r.passed
            ? ""
            : ` (${r.checks
                .filter((c) => !c.ok)
                .map((c) => c.name)
                .join("; ")})`
        }\n`,
    );
  });
  await save(report);
  process.stdout.write(renderMarkdown(report));
  process.stderr.write(`Report written to ${out}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
