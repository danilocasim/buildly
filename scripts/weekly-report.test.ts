import { describe, expect, it } from "vitest";
import { isoWeek, renderReport } from "./weekly-report";
import type { Metrics } from "@buildly/db";

const empty: Metrics = {
  from: "a",
  to: "b",
  h1: { numerator: 0, denominator: 0, value: null },
  h2: { numerator: 3, denominator: 4, value: 0.75 },
  h3: { numerator: 1, denominator: 2, value: 0.5 },
  timeToPreviewMs: 90_000,
  costPerSuccessfulBuildUsd: 0.0312,
  repairRate: { numerator: 1, denominator: 4, value: 0.25 },
  capPressure: { hourly_builds: 2 },
  counts: { finishedBuilds: 4, succeededBuilds: 3, signIns: 2, projectsCreated: 1 },
};

describe("weekly report", () => {
  it("names ISO weeks", () => {
    expect(isoWeek(new Date("2026-10-01T00:00:00Z"))).toBe("2026-W40");
    expect(isoWeek(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2026-01-04T00:00:00Z"))).toBe("2026-W01");
  });

  it("renders the formula table with targets and flags", () => {
    const md = renderReport("2026-W40", new Date("2026-10-01T00:00:00Z"), empty, empty);
    expect(md).toContain("# Weekly metrics report 2026-W40");
    expect(md).toContain("| H1 pass rate (initial builds) | n/a – | n/a – | ≥ 70% |");
    expect(md).toContain("| H2 pass rate (edits) | 75% (3/4) ❌ | 75% (3/4) ❌ | ≥ 80% |");
    expect(md).toContain("| H3 code intent | 50% (1/2) ✅ | 50% (1/2) ✅ | ≥ 30% |");
    expect(md).toContain("| Time to preview (median) | 90 s ✅ |");
    expect(md).toContain("| Cap pressure | hourly_builds: 2 – |");
  });
});
