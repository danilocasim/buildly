// Plan caps and top-up credits (brief §13, D10, D21). Pure rules: callers pass counts
// from the database, so the web API and the worker (re-check on claim) apply identical
// logic. Usage is governed only by the plan and top-up build credits; every build runs
// on Buildly's own OpenAI access.
import { err, ok, type Result } from "./result";

export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<
  Plan,
  {
    buildsPerMonth: number;
    buildsPerHour: number | null;
    projects: number | null;
    concurrentBuilds: number;
  }
> = {
  free: { buildsPerMonth: 15, buildsPerHour: 10, projects: 2, concurrentBuilds: 1 },
  pro: { buildsPerMonth: 200, buildsPerHour: null, projects: null, concurrentBuilds: 2 },
};

/** A top-up: $5 for 50 build credits that never expire and add to any plan (brief §13). */
export const TOPUP = { priceUsd: 5, credits: 50 } as const;

export type CapCode =
  "monthly_builds" | "hourly_builds" | "concurrent_builds" | "projects" | "generation_active";

export interface CapDenied {
  code: CapCode;
  message: string;
  /** When the cap frees up again (ISO 8601), or null when it does not reset by time. */
  resetAt: string | null;
  /** HTTP status the API answers with. */
  status: 429 | 403 | 409;
}

/** Months are UTC calendar months. */
export function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function startOfNextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export const HOUR_MS = 60 * 60 * 1000;

/** Abuse controls outside the plan caps (TODO 7.2.3). */
export const ABUSE_LIMITS = {
  /** Magic links one email may request in a rolling hour. */
  magicLinksPerEmailPerHour: 5,
  /** API requests one session may make in a fixed one-minute window. */
  apiRequestsPerSessionPerMinute: 120,
} as const;

export interface BuildUsage {
  plan: Plan;
  /** Builds consumed since startOfMonthUtc(now), whether the plan or a credit paid. */
  buildsThisMonth: number;
  /** Builds consumed in the rolling hour before `now`. */
  buildsLastHour: number;
  /** The earliest build inside that hour; the hourly window frees up an hour after it. */
  oldestBuildLastHour?: Date;
  /** Whether the project already has a non-terminal generation. */
  activeGeneration: boolean;
  /** Non-terminal generations across all of the user's projects. */
  activeBuildsForUser: number;
  /** Unspent top-up build credits. */
  creditBalance: number;
  now: Date;
}

/** Who pays for an allowed build: the plan's monthly allowance, or one top-up credit. */
export type PaidBy = "plan" | "credit";

/**
 * Whether one more build may start, and what pays for it. Checked in order: an active
 * build on the project, concurrent builds, the monthly allowance (then credits), and the
 * Free hourly rate limit, an abuse control that applies to credit builds too.
 */
export function checkBuild(usage: BuildUsage): Result<{ paidBy: PaidBy }, CapDenied> {
  const limits = PLAN_LIMITS[usage.plan];
  if (usage.activeGeneration) {
    return err({
      code: "generation_active",
      message: "A build is already running for this project. Wait for it or cancel it.",
      resetAt: null,
      status: 409,
    });
  }
  if (usage.activeBuildsForUser >= limits.concurrentBuilds) {
    return err({
      code: "concurrent_builds",
      message:
        limits.concurrentBuilds === 1
          ? "Another of your projects is building. The Free plan runs one build at a time."
          : `You already have ${limits.concurrentBuilds} builds running. Wait for one to finish.`,
      resetAt: null,
      status: 429,
    });
  }
  const allowanceLeft = usage.buildsThisMonth < limits.buildsPerMonth;
  if (!allowanceLeft && usage.creditBalance <= 0) {
    return err({
      code: "monthly_builds",
      message: `You have used all ${limits.buildsPerMonth} builds included in your plan this month and have no build credits left. Add a top-up or wait for the monthly reset.`,
      resetAt: startOfNextMonthUtc(usage.now).toISOString(),
      status: 429,
    });
  }
  if (limits.buildsPerHour !== null && usage.buildsLastHour >= limits.buildsPerHour) {
    const freesAt = new Date((usage.oldestBuildLastHour ?? usage.now).getTime() + HOUR_MS);
    return err({
      code: "hourly_builds",
      message: `You can start ${limits.buildsPerHour} builds per hour on the Free plan. Try again shortly.`,
      resetAt: freesAt.toISOString(),
      status: 429,
    });
  }
  return ok({ paidBy: allowanceLeft ? "plan" : "credit" });
}

/** Whether the user may create another (non-archived) project. */
export function checkProject(usage: {
  plan: Plan;
  activeProjects: number;
}): Result<void, CapDenied> {
  const max = PLAN_LIMITS[usage.plan].projects;
  if (max !== null && usage.activeProjects >= max) {
    return err({
      code: "projects",
      message: `The Free plan includes ${max} projects. Archive one to start another.`,
      resetAt: null,
      status: 403,
    });
  }
  return ok(undefined);
}
