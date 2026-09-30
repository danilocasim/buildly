import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Integration tests create a database per file on the docker-compose Postgres.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
