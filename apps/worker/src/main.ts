// Worker entry point: `pnpm --filter @buildly/worker start`. SIGTERM/SIGINT stop claiming,
// finish the current job (up to 30 s), then exit 0.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleProject, runTypecheck } from "@buildly/checker";
import { createDb, createPool } from "@buildly/db";
import { loadFoundationFiles, readManifest } from "@buildly/foundation";
import { createOpenAIProvider, modelsFromConfig } from "@buildly/generator";
import { createSnackManager } from "@buildly/snack";
import { createStorage, storageConfigFrom } from "@buildly/storage";
import { loadWorkerConfig } from "./config";
import { createGenerationHandler } from "./handlers/generation";
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

const generation = createGenerationHandler({
  db,
  storage: createStorage(storageConfigFrom(config)),
  provider: createOpenAIProvider({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  }),
  // Fails at startup if a configured model has no rate (cost accounting needs one).
  models: modelsFromConfig(config),
  async typecheck(files) {
    const dir = await mkdtemp(join(tmpdir(), "buildly-check-"));
    try {
      return await runTypecheck(assembleProject(foundationFiles, files, dir));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  bundle: (projectId, files) =>
    snack.checkBundle({ id: projectId, name: "Preview" }, files, BUNDLE_TIMEOUT_MS),
});

const worker = startWorker({
  db,
  log,
  handlers: { generation, sleep: sleepHandler },
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
