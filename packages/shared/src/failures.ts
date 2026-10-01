// User-facing copy for a build's terminal state (TODO 7.3.3). The worker stores an
// `error_code`; the workspace shows this title and help line instead of the raw code.
import type { CapCode } from "./limits";

/** Every error code a generation can end with (packages/generator ErrorCode). */
export const GENERATION_ERROR_CODES = [
  "typecheck",
  "bundle",
  "timeout",
  "cancelled",
  "context_too_large",
  "dependency_not_allowed",
  "too_many_rejections",
  "no_finish",
  "provider_error",
] as const;

export type GenerationErrorCode = (typeof GENERATION_ERROR_CODES)[number];

/** Cap codes the worker can record when it re-checks caps on claim. */
type BuildCapCode = Exclude<CapCode, "projects" | "generation_active">;

export interface FailureCopy {
  title: string;
  help: string;
}

const UNCHANGED = "Your last working version is unchanged.";

const PLAN_LIMIT: FailureCopy = {
  title: "Build refused by your plan's limits",
  help: "Settings shows your usage and when it resets.",
};

export const FAILURE_COPY: Record<GenerationErrorCode | BuildCapCode, FailureCopy> = {
  typecheck: {
    title: "Build failed: the code has type errors",
    help: `Buildly tried to repair it and could not. ${UNCHANGED} Try a smaller change, or describe it differently.`,
  },
  bundle: {
    title: "Build failed: the preview could not be bundled",
    help: `The code passed the type check, but the preview could not load it. ${UNCHANGED} Try again, or ask for a smaller change.`,
  },
  timeout: {
    title: "Build timed out",
    help: `Builds stop after 4 minutes. ${UNCHANGED} Split the request into smaller steps.`,
  },
  cancelled: {
    title: "Cancelled",
    help: UNCHANGED,
  },
  context_too_large: {
    title: "This project is too large to edit in one build",
    help: "Its files no longer fit in one request to the AI. Export the code to keep working on it, or start a new project with a smaller scope.",
  },
  dependency_not_allowed: {
    title: "Build failed: that needs a package Buildly does not support",
    help: `Generated apps can use only the packages in Buildly's foundation. ${UNCHANGED} Ask for the feature without that library, or export the code and add it yourself.`,
  },
  too_many_rejections: {
    title: "Build failed: too many invalid edits",
    help: `The AI kept trying edits Buildly does not allow. ${UNCHANGED} Try rephrasing the request.`,
  },
  no_finish: {
    title: "Build failed: the AI did not finish",
    help: `It ran out of turns before completing the change. ${UNCHANGED} Try a smaller change.`,
  },
  provider_error: {
    title: "Build failed: the AI service had a problem",
    help: `This was not caused by your request. ${UNCHANGED} Try again in a minute.`,
  },
  monthly_builds: PLAN_LIMIT,
  hourly_builds: PLAN_LIMIT,
  concurrent_builds: PLAN_LIMIT,
};

const FALLBACK: FailureCopy = { title: "Build failed", help: `${UNCHANGED} Try again.` };

/** The copy for a terminal build, or null for a success. Unknown codes get a generic line. */
export function failureCopy(
  status: string,
  errorCode: string | null | undefined,
): FailureCopy | null {
  if (status === "succeeded") return null;
  if (status === "cancelled") return FAILURE_COPY.cancelled;
  if (status === "timed_out") return FAILURE_COPY.timeout;
  if (errorCode && Object.hasOwn(FAILURE_COPY, errorCode))
    return FAILURE_COPY[errorCode as keyof typeof FAILURE_COPY];
  return FALLBACK;
}
