import { describe, expect, it } from "vitest";
import {
  checkBuild,
  checkProject,
  startOfMonthUtc,
  startOfNextMonthUtc,
  type BuildUsage,
} from "./limits";

const now = new Date("2026-10-15T12:00:00Z");
const base: BuildUsage = {
  plan: "free",
  buildsThisMonth: 0,
  buildsLastHour: 0,
  activeGeneration: false,
  now,
};
const code = (usage: Partial<BuildUsage>) => {
  const result = checkBuild({ ...base, ...usage });
  return result.ok ? "ok" : result.error.code;
};

describe("build caps", () => {
  it.each([
    // [description, usage, expected]
    ["free: 15th build of the month is allowed", { buildsThisMonth: 14 }, "ok"],
    ["free: 16th build of the month is blocked", { buildsThisMonth: 15 }, "monthly_builds"],
    ["free: 10th build in an hour is allowed", { buildsLastHour: 9 }, "ok"],
    ["free: 11th build in an hour is blocked", { buildsLastHour: 10 }, "hourly_builds"],
    [
      "free: month cap wins over hour cap",
      { buildsThisMonth: 15, buildsLastHour: 10 },
      "monthly_builds",
    ],
    ["pro: 200th build is allowed", { plan: "pro" as const, buildsThisMonth: 199 }, "ok"],
    [
      "pro: 201st build is blocked",
      { plan: "pro" as const, buildsThisMonth: 200 },
      "monthly_builds",
    ],
    ["pro: no hourly cap", { plan: "pro" as const, buildsLastHour: 50 }, "ok"],
    ["one active build per project", { activeGeneration: true }, "generation_active"],
    [
      "active build wins over caps",
      { activeGeneration: true, buildsThisMonth: 99 },
      "generation_active",
    ],
  ])("%s", (_name, usage, expected) => {
    expect(code(usage)).toBe(expected);
  });

  it("answers 429 with the next UTC month as resetAt", () => {
    const result = checkBuild({ ...base, buildsThisMonth: 15 });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ status: 429, resetAt: "2026-11-01T00:00:00.000Z" }),
    });
  });

  it("frees the hourly window an hour after the oldest build in it", () => {
    const result = checkBuild({
      ...base,
      buildsLastHour: 10,
      oldestBuildLastHour: new Date("2026-10-15T11:20:00Z"),
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ status: 429, resetAt: "2026-10-15T12:20:00.000Z" }),
    });
  });

  it("answers 409 for an active build", () => {
    expect(checkBuild({ ...base, activeGeneration: true })).toEqual({
      ok: false,
      error: expect.objectContaining({ status: 409, resetAt: null }),
    });
  });

  it("rolls over at the UTC month boundary, including December → January", () => {
    expect(startOfMonthUtc(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(startOfNextMonthUtc(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(startOfMonthUtc(new Date("2027-01-01T00:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    // 15 builds last month do not count once the month rolls over; the caller counts from startOfMonthUtc.
    expect(code({ buildsThisMonth: 0, now: new Date("2027-01-01T00:00:00Z") })).toBe("ok");
  });
});

describe("project cap", () => {
  it.each([
    ["free", 1, true],
    ["free", 2, false],
    ["pro", 500, true],
  ] as const)("%s with %i active projects → allowed %s", (plan, activeProjects, allowed) => {
    const result = checkProject({ plan, activeProjects });
    expect(result.ok).toBe(allowed);
    if (!result.ok)
      expect(result.error).toMatchObject({ code: "projects", status: 403, resetAt: null });
  });
});
