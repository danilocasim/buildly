import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVENT_NAMES } from "./events";

describe("events", () => {
  it("has unique, non-empty string names", () => {
    for (const name of EVENT_NAMES) {
      expect(name).toBeTypeOf("string");
      expect(name).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
    expect(new Set(EVENT_NAMES).size).toBe(EVENT_NAMES.length);
  });

  it("matches the event table in METRICS.md", () => {
    const metrics = readFileSync(new URL("../../../.plan/mvp/METRICS.md", import.meta.url), "utf8");
    const documented = [...metrics.matchAll(/^\| `([a-z_.]+)` \|/gm)].map((m) => m[1]);
    expect([...EVENT_NAMES].sort()).toEqual(documented.sort());
  });
});
