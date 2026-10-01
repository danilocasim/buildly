// Worker entry point: `pnpm --filter @buildly/worker start`. SIGTERM/SIGINT stop claiming,
// finish the current job (up to 30 s), then exit 0.
import { typecheckFiles } from "@buildly/checker";
import { createDb, createPool } from "@buildly/db";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { createOpenAIProvider, modelsFromConfig } from "@buildly/generator";
import { createSnackManager } from "@buildly/snack";
import { createStorage, storageConfigFrom } from "@buildly/storage";
import { loadWorkerConfig } from "./config";
import { createGenerationHandler } from "./handlers/generation";
import { createPreviewHandler, type PreviewPusher } from "./handlers/preview";
import { sleepHandler } from "./handlers/sleep";
import { createLogger } from "./log";
import { startWorker } from "./worker";

const BUNDLE_TIMEOUT_MS = 60_000;

const config = loadWorkerConfig();
const log = createLogger({ service: "worker" });
const pool = createPool(config.DATABASE_URL, 4);
const db = createDb(pool);
const foundationFiles = loadFoundationFiles();
const snack = createSnackManager({ manifest: readManifest(), foundationFiles });

const storage = createStorage(storageConfigFrom(config));
const preview: PreviewPusher = (project, files) => {
  const session = snack.ensureSession(project);
  snack.pushFiles(session, project, files);
  return Promise.resolve({ channel: session.channel });
};

const generation = createGenerationHandler({
  db,
  storage,
  provider: createOpenAIProvider({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  }),
  // Fails at startup if a configured model has no rate (cost accounting needs one).
  models: modelsFromConfig(config),
  typecheck: (files) => typecheckFiles(foundationFiles, files),
  bundle: (projectId, files) =>
    snack.checkBundle({ id: projectId, name: "Preview" }, files, BUNDLE_TIMEOUT_MS),
  preview,
});

const worker = startWorker({
  db,
  log,
  handlers: {
    generation,
    preview: createPreviewHandler({ db, storage, preview }),
    sleep: sleepHandler,
  },
  pollMs: Number(process.env.WORKER_POLL_MS ?? 1000),
});

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  log.info("shutdown requested", { signal });
  await worker.stop();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
