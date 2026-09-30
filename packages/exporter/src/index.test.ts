import { describe, expect, it } from "vitest";
import * as mod from "./index";

// Placeholder until the package has real behavior (see .plan/mvp/TODO.md).
describe("@buildly/exporter", () => {
  it("loads its entry point", () => {
    expect(mod).toBeTypeOf("object");
  });
});
