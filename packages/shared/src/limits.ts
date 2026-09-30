// Plan caps (brief §13, D10). Pure rules: callers pass counts from the database, so the
// web API and the worker (re-check on claim) apply identical logic. There is no
// bring-your-own-key path; usage is governed only by the plan.
import { err, ok, type Result } from "./result";

export type Plan = "free" | "pro";

export const PLAN_LIMITS: Record<
  Plan,
  { buildsPerMonth: number; buildsPerHour: number | null; projects: number | null }
> = {
  free: { buildsPerMonth: 15, buildsPerHour: 10, projects: 2 },
  pro: { buildsPerMonth: 200, buildsPerHour: null, projects: null },
};

export type CapCode = "monthly_builds" | "hourly_builds" | "projects" | "generation_active";

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

export interface BuildUsage {
  plan: Plan;
  /** Builds consumed since startOfMonthUtc(now). */
  buildsThisMonth: number;
  /** Builds consumed in the rolling hour before `now`. */
  buildsLastHour: number;
  /** The earliest build inside that hour; the hourly window frees up an hour after it. */
  oldestBuildLastHour?: Date;
  /** Whether the project already has a non-terminal generation. */
  activeGeneration: boolean;
  now: Date;
}

/** Whether one more build may start. Checked in order: active build, month, hour. */
export function checkBuild(usage: BuildUsage): Result<void, CapDenied> {
  const limits = PLAN_LIMITS[usage.plan];
  if (usage.activeGeneration) {
    return err({
      code: "generation_active",
      message: "A build is already running for this project. Wait for it or cancel it.",
      resetAt: null,
      status: 409,
    });
  }
  if (usage.buildsThisMonth >= limits.buildsPerMonth) {
    return err({
      code: "monthly_builds",
      message: `You have used all ${limits.buildsPerMonth} builds included in your plan this month.`,
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
  return ok(undefined);
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
