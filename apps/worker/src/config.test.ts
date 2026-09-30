import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./config";

describe("loadWorkerConfig", () => {
  it("validates the worker variables and does not ask for web-only ones", () => {
    let message = "";
    try {
      loadWorkerConfig({});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/OPENAI_API_KEY is required/);
    expect(message).not.toMatch(/SESSION_SECRET/);
  });
});
