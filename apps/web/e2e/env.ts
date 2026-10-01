import { fileURLToPath } from "node:url";

export const E2E_PORT = 3310;
export const E2E_WORKER_PORT = 3311;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://buildly:buildly@localhost:5433/postgres";
export const E2E_DATABASE = "buildly_e2e";
export const E2E_DATABASE_URL = (() => {
  const url = new URL(E2E_ADMIN_URL);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
})();
export const E2E_STATE = fileURLToPath(new URL(".state.json", import.meta.url));
/** The dev server's output; the console email adapter prints magic links here. */
export const E2E_SERVER_LOG = fileURLToPath(new URL(".server.log", import.meta.url));

/** The environment both e2e servers (web, fake worker) run with. */
export const E2E_ENV = {
  NEXT_DIST_DIR: ".next-e2e",
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: E2E_BASE_URL,
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "buildly-e2e",
  STORAGE_ACCESS_KEY: "buildly-dev",
  STORAGE_SECRET_KEY: "buildly-dev-secret",
  STORAGE_ENDPOINT: "http://localhost:9000",
  SNACK_SDK_VERSION: "54.0.0",
  // The deployed player (TODO 4b.0.1); localhost pages are always allowed to drive it.
  SNACK_WEB_PLAYER_URL: "https://d3tfrf3qzy19yc.cloudfront.net/v2/%%SDK_VERSION%%",
  EMAIL_PROVIDER_API_KEY: "console",
  EMAIL_FROM: "login@localhost",
  SESSION_SECRET: "e2e-only-session-secret-at-least-32-chars",
};
