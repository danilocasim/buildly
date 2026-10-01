import { describe, expect, it } from "vitest";
import { modelFor, modelsFromConfig, primaryModel } from "./routing";

const models = { plan: "gpt-6.1-sol", edit: "gpt-6-luna" };

describe("model routing", () => {
  it.each([
    ["initial", "plan", "gpt-6.1-sol"],
    ["initial", "build", "gpt-6.1-sol"],
    ["initial", "repair", "gpt-6-luna"],
    ["edit", "plan", "gpt-6-luna"],
    ["edit", "build", "gpt-6-luna"],
    ["edit", "repair", "gpt-6-luna"],
  ] as const)("%s build, %s stage → %s", (kind, stage, expected) => {
    expect(modelFor(kind, stage, models)).toBe(expected);
  });

  it("records the plan model for initial builds and the edit model for edits", () => {
    expect(primaryModel("initial", models)).toBe("gpt-6.1-sol");
    expect(primaryModel("edit", models)).toBe("gpt-6-luna");
  });

  it("rejects a configured model that has no rate", () => {
    expect(
      modelsFromConfig({
        GENERATION_MODEL_PLAN: "gpt-6.1-sol",
        GENERATION_MODEL_EDIT: "gpt-6-luna",
      }),
    ).toEqual(models);
    expect(() =>
      modelsFromConfig({ GENERATION_MODEL_PLAN: "gpt-9", GENERATION_MODEL_EDIT: "gpt-6-luna" }),
    ).toThrow('GENERATION_MODEL_PLAN="gpt-9" has no rate');
  });
});
