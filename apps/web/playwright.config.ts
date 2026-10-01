import { defineConfig, devices } from "@playwright/test";
import {
  E2E_BASE_URL,
  E2E_DATABASE_URL,
  E2E_PORT,
  E2E_SERVER_LOG,
  E2E_WORKER_PORT,
} from "./e2e/env";

const E2E_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: E2E_BASE_URL,
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "buildly-e2e",
  STORAGE_ACCESS_KEY: "buildly-dev",
  STORAGE_SECRET_KEY: "buildly-dev-secret",
  STORAGE_ENDPOINT: "http://localhost:9000",
  SNACK_SDK_VERSION: "54.0.0",
  EMAIL_PROVIDER_API_KEY: "console",
  EMAIL_FROM: "login@localhost",
  SESSION_SECRET: "e2e-only-session-secret-at-least-32-chars",
};

// E2E runs the real Next.js server against the buildly_e2e database on the
// docker-compose Postgres (`pnpm services:up`).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Output is teed to a log the sign-in test reads magic links from (console email adapter).
      command: `pnpm exec next dev --port ${E2E_PORT} 2>&1 | tee ${JSON.stringify(E2E_SERVER_LOG)}`,
      url: `${E2E_BASE_URL}/api/me`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: E2E_ENV,
    },
    {
      // The real worker loop with a scripted model (e2e/fake-worker.ts), for the chat specs.
      command: "pnpm exec tsx e2e/fake-worker.ts",
      url: `http://localhost:${E2E_WORKER_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...E2E_ENV, FAKE_WORKER_PORT: String(E2E_WORKER_PORT) },
    },
  ],
});
