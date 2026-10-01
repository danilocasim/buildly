import { describe, expect, it } from "vitest";
import { FAILURE_COPY, GENERATION_ERROR_CODES, failureCopy } from "./failures";

describe("failure copy (7.3.3)", () => {
  it("covers every generation error code with a title and a help line, never the raw code", () => {
    for (const code of GENERATION_ERROR_CODES) {
      const copy = failureCopy("failed", code)!;
      expect(copy).toBe(FAILURE_COPY[code]);
      expect(copy.title.length).toBeGreaterThan(5);
      expect(copy.help).toMatch(/\.$/);
      // Snake-case codes are internal; the copy must not leak them.
      if (code.includes("_")) expect(`${copy.title} ${copy.help}`).not.toContain(code);
    }
  });

  it("names the specific failures the brief lists", () => {
    expect(failureCopy("failed", "typecheck")!.title).toBe(
      "Build failed: the code has type errors",
    );
    expect(failureCopy("failed", "bundle")!.title).toContain("preview could not be bundled");
    expect(failureCopy("timed_out", "timeout")!.title).toBe("Build timed out");
    expect(failureCopy("cancelled", "cancelled")!.title).toBe("Cancelled");
    expect(failureCopy("failed", "context_too_large")!.title).toContain("too large");
    expect(failureCopy("failed", "dependency_not_allowed")!.title).toContain("package");
  });

  it("maps statuses and caps, and falls back for unknown codes", () => {
    expect(failureCopy("succeeded", null)).toBeNull();
    expect(failureCopy("timed_out", null)).toBe(FAILURE_COPY.timeout);
    expect(failureCopy("failed", "hourly_builds")!.title).toBe(
      "Build refused by your plan's limits",
    );
    expect(failureCopy("failed", "something_new")!.title).toBe("Build failed");
    expect(failureCopy("failed", null)!.title).toBe("Build failed");
    expect(failureCopy("failed", "toString")!.title).toBe("Build failed");
  });
});
