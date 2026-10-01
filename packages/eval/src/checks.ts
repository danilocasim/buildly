// The "must hold" checks of EVAL.md, as functions over one run's outcome. Each returns a
// named pass/fail with a short reason, so a report shows why a run failed.
import { registeredRoutes, type FileSet, type RunResult, type StepName } from "@buildly/generator";

export interface SmokeResult {
  ok: boolean;
  passed: number;
  failed: number;
  detail?: string;
}

export interface RunOutcome {
  /** The files the run started from (after any task preparation). */
  baseFiles: FileSet;
  /** The files the run ended with: the snapshot on success, otherwise the base. */
  files: FileSet;
  result: RunResult;
  steps: { step: StepName; status: "succeeded" | "failed" }[];
  /** Assistant messages in order: the plan, then the finish summary. */
  messages: string[];
  /** The base starter's smoke tests run against `files` (starter-based tasks only). */
  smoke?: SmokeResult;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export type Check = (outcome: RunOutcome) => CheckResult;

const result = (name: string, ok: boolean, detail?: string): CheckResult =>
  ok ? { name, ok } : { name, ok, detail };

const lastStep = (o: RunOutcome, step: StepName) => o.steps.filter((s) => s.step === step).at(-1);

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every changed, added, or removed path between two file sets. */
export function changedPaths(before: FileSet, after: FileSet): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((path) => before[path] !== after[path]).sort();
}

/** `export const schemaVersion = N` in src/data/models.ts, or 1 (as the store reads it). */
export function schemaVersionOf(files: FileSet): number {
  const match = /export\s+const\s+schemaVersion\s*=\s*(\d+)/.exec(
    files["src/data/models.ts"] ?? "",
  );
  return match ? Number(match[1]) : 1;
}

/** Source code with comments and string contents blanked, for identifier searches. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

const sourceFiles = (files: FileSet) =>
  Object.entries(files).filter(([path]) => /\.(tsx?|jsx?)$/.test(path));

// ---- checks ---------------------------------------------------------------------------

export const tscOk: Check = (o) => {
  const step = lastStep(o, "typecheck");
  return result(
    "tsc ok",
    step?.status === "succeeded",
    step ? "last type check failed" : "no type check ran",
  );
};

export const bundleOk: Check = (o) => {
  const step = lastStep(o, "bundle");
  return result(
    "bundle ok",
    step?.status === "succeeded",
    step ? "last bundle failed" : "no bundle ran",
  );
};

export const succeeded: Check = (o) =>
  result(
    "build succeeds",
    o.result.status === "succeeded",
    `ended ${o.result.status} (${o.result.errorCode ?? "no code"})`,
  );

export const noTimeout: Check = (o) =>
  result(
    "no hang or timeout",
    o.result.status !== "timed_out" && o.result.errorCode !== "timeout",
    "timed out",
  );

export const planProduced: Check = (o) =>
  result("plan produced", (o.messages[0] ?? "").trim().length > 0, "no plan message");

/** Each pattern matches a route registered in src/navigation.tsx (names normalized). */
export const routesInclude =
  (label: string, ...patterns: RegExp[]): Check =>
  (o) => {
    const routes = registeredRoutes(o.files["src/navigation.tsx"]).map(normalize);
    const missing = patterns.filter((p) => !routes.some((r) => p.test(r)));
    return result(label, missing.length === 0, `routes: ${routes.join(", ") || "none"}`);
  };

/** Each model is an exported interface or type in src/data/models.ts. */
export const hasModels =
  (...names: string[]): Check =>
  (o) => {
    const models = o.files["src/data/models.ts"] ?? "";
    const missing = names.filter(
      (n) => !new RegExp(`export\\s+(?:interface|type)\\s+${n}\\b`).test(models),
    );
    return result(
      `models ${names.join(", ")}`,
      missing.length === 0,
      `missing ${missing.join(", ")}`,
    );
  };

/** At least `min` records created in src/data/seed.ts for a collection matching `collection`. */
export const seedAtLeast =
  (collection: RegExp, min: number, label: string): Check =>
  (o) => {
    const seed = codeOnly(o.files["src/data/seed.ts"] ?? "");
    const creates = [...seed.matchAll(/\b(\w+)\s*\.create\s*\(/g)].filter((m) =>
      collection.test(m[1]!),
    ).length;
    return result(label, creates >= min, `${creates} found`);
  };

/**
 * A flow exists (a route or screen file matching `flow`) and some repository update
 * writes `field`, e.g. `items.update(id, { quantity: next })`.
 */
export const flowUpdates =
  (flow: RegExp, field: string, label: string): Check =>
  (o) => {
    const hasFlow =
      registeredRoutes(o.files["src/navigation.tsx"]).some((r) => flow.test(r)) ||
      Object.keys(o.files).some((p) => p.startsWith("src/screens/") && flow.test(p));
    const update = new RegExp(`\\.update\\s*\\([^;]*?\\b${field}\\b`);
    const writes = sourceFiles(o.files).some(([, source]) => update.test(codeOnly(source)));
    return result(
      label,
      hasFlow && writes,
      [!hasFlow && `no ${flow} route or screen`, !writes && `no update writes ${field}`]
        .filter(Boolean)
        .join("; "),
    );
  };

export const smokePasses: Check = (o) =>
  result(
    "starter smoke tests pass",
    o.smoke?.ok === true,
    o.smoke ? (o.smoke.detail ?? `${o.smoke.failed} failed`) : "not run",
  );

/** A route matching `pattern` is registered that the base did not have. */
export const newRouteRegistered =
  (pattern: RegExp, label: string): Check =>
  (o) => {
    const before = new Set(registeredRoutes(o.baseFiles["src/navigation.tsx"]).map(normalize));
    const added = registeredRoutes(o.files["src/navigation.tsx"])
      .map(normalize)
      .filter((r) => !before.has(r));
    return result(
      label,
      added.some((r) => pattern.test(r)),
      `new routes: ${added.join(", ") || "none"}`,
    );
  };

export const schemaVersionBumped: Check = (o) => {
  const [before, after] = [schemaVersionOf(o.baseFiles), schemaVersionOf(o.files)];
  return result("schemaVersion bumped", after > before, `${before} → ${after}`);
};

/** No `identifier` left in project source code (comments and strings ignored). */
export const noIdentifier =
  (identifier: string): Check =>
  (o) => {
    const pattern = new RegExp(`\\b${identifier}\\b`);
    const left = sourceFiles(o.files)
      .filter(([, source]) => pattern.test(codeOnly(source)))
      .map(([path]) => path);
    return result(`no ${identifier} identifier`, left.length === 0, `still in ${left.join(", ")}`);
  };

export const repairedWithin =
  (max: number): Check =>
  (o) =>
    result(
      `tsc ok in ≤ ${max} attempts`,
      o.result.status === "succeeded" && o.result.repairAttempts <= max,
      `${o.result.status} after ${o.result.repairAttempts} repairs`,
    );

export const onlyChanged =
  (...allowed: string[]): Check =>
  (o) => {
    const unrelated = changedPaths(o.baseFiles, o.files).filter((p) => !allowed.includes(p));
    return result(
      "no unrelated files changed",
      unrelated.length === 0,
      `changed ${unrelated.join(", ")}`,
    );
  };

/** The assistant says the package is unavailable, and nothing imports or declares it. */
export const dependencyRefused =
  (pkg: string): Check =>
  (o) => {
    const said = o.messages.join("\n");
    const explained =
      /not (?:available|supported|allowed|included|possible)|isn['’]t (?:available|supported|allowed)|unavailable|can(?:not|['’]t) (?:add|install|use)/i.test(
        said,
      ) && new RegExp(pkg.replace(/[-/]/g, "[-/ ]?") + "|map", "i").test(said);
    const used = sourceFiles(o.files).some(([, source]) => source.includes(`"${pkg}"`));
    const packageChanged = o.files["package.json"] !== o.baseFiles["package.json"];
    return result(
      `explains ${pkg} is unavailable, no package change`,
      explained && !used && !packageChanged,
      [
        !explained && "no clear explanation",
        used && `imports ${pkg}`,
        packageChanged && "package.json changed",
      ]
        .filter(Boolean)
        .join("; "),
    );
  };

export const noCrash: Check = (o) =>
  result(
    "no failed state from a crash",
    o.result.status === "succeeded",
    `ended ${o.result.status} (${o.result.errorCode ?? "no code"})`,
  );

export function runChecks(checks: Check[], outcome: RunOutcome): CheckResult[] {
  return checks.map((check) => check(outcome));
}
