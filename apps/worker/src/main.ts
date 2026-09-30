// Worker entry point: `pnpm --filter @buildly/worker start`. SIGTERM/SIGINT stop claiming,
// finish the current job (up to 30 s), then exit 0.
import { createDb, createPool } from "@buildly/db";
import { loadWorkerConfig } from "./config";
import { sleepHandler } from "./handlers/sleep";
import { createLogger } from "./log";
import { startWorker } from "./worker";

const config = loadWorkerConfig();
const log = createLogger({ service: "worker" });
const pool = createPool(config.DATABASE_URL, 4);
const worker = startWorker({
  db: createDb(pool),
  log,
  handlers: { sleep: sleepHandler },
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
