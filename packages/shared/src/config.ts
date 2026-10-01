import { z } from "zod";

// Server-only. Variables per service follow .plan/mvp/HOSTING.md §4; the full
// list is ARCHITECTURE.md §9 and .env.example. The OpenAI key is worker-only.

const required = z.string().trim().min(1, "is required");

// Empty strings count as unset, so `STORAGE_ENDPOINT=` in a .env means "real S3".
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const shared = {
  DATABASE_URL: z.url(),
  STORAGE_REGION: required,
  STORAGE_BUCKET: required,
  STORAGE_ACCESS_KEY: required,
  STORAGE_SECRET_KEY: required,
  STORAGE_ENDPOINT: optional(z.url()),
  APP_URL: z.url(),
  SNACK_SDK_VERSION: required,
  // Unset disables Sentry, e.g. in local development.
  SENTRY_DSN: optional(z.url()),
};

const schemas = {
  web: z.object({
    ...shared,
    // Buildly's self-hosted Snack web player (D18, packages/web-player), with
    // %%SDK_VERSION%% where snack-sdk puts the SDK major. Unset falls back to Expo's
    // hosted player, which only works from Expo's own origins and localhost.
    SNACK_WEB_PLAYER_URL: optional(z.url()),
    EMAIL_PROVIDER_API_KEY: required,
    EMAIL_FROM: required,
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  }),
  worker: z.object({
    ...shared,
    OPENAI_API_KEY: required,
    OPENAI_BASE_URL: optional(z.url()),
    GENERATION_MODEL_PLAN: required,
    GENERATION_MODEL_EDIT: required,
  }),
};

export type Service = keyof typeof schemas;
export type WebConfig = z.infer<typeof schemas.web>;
export type WorkerConfig = z.infer<typeof schemas.worker>;

/** Every variable any service reads. The secret guard scans outputs for these names. */
export const ENV_NAMES: readonly string[] = [
  ...new Set([...Object.keys(schemas.web.shape), ...Object.keys(schemas.worker.shape)]),
].sort();

export class ConfigError extends Error {
  constructor(
    readonly service: Service,
    readonly variables: string[],
    details: string[],
  ) {
    super(`Invalid environment for ${service}: ${details.join("; ")}`);
    this.name = "ConfigError";
  }
}

/**
 * Validates the environment for one service and returns only the variables it reads.
 * Throws ConfigError naming each missing or invalid variable. Values never appear in
 * the message, so it is safe to log.
 */
export function loadConfig(service: "web", env?: NodeJS.ProcessEnv): WebConfig;
export function loadConfig(service: "worker", env?: NodeJS.ProcessEnv): WorkerConfig;
export function loadConfig(
  service: Service,
  env: NodeJS.ProcessEnv = process.env,
): WebConfig | WorkerConfig {
  const result = schemas[service].safeParse(env);
  if (result.success) return result.data;

  const variables = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
  const details = result.error.issues.map(
    (issue) => `${String(issue.path[0])} ${describeIssue(issue)}`,
  );
  throw new ConfigError(service, variables, details);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  if (issue.code === "invalid_type") return "is required";
  if (issue.code === "invalid_format") return `must be a valid ${issue.format}`;
  return issue.message;
}
