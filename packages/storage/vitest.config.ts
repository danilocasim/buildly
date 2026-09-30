import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Integration tests use a throwaway bucket on the docker-compose S3 server.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
