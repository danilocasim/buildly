import { loadConfig, type WorkerConfig } from "@buildly/shared/config";

/** Validated env for the worker. Called once at startup so a bad env fails fast. */
export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return loadConfig("worker", env);
}
