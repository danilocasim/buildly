import { fileURLToPath } from "node:url";

export const E2E_PORT = 3310;
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
