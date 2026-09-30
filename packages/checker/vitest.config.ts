import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Each case spawns tsc against the React Native type definitions.
    testTimeout: 60_000,
  },
});
