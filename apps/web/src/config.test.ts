import { describe, expect, it } from "vitest";
import { loadWebConfig } from "./config";

describe("loadWebConfig", () => {
  it("validates the web variables and does not ask for worker-only ones", () => {
    let message = "";
    try {
      loadWebConfig({} as NodeJS.ProcessEnv);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/SESSION_SECRET is required/);
    expect(message).not.toMatch(/OPENAI/);
  });
});
