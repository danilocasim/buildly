// The fixed task set of EVAL.md. T1–T3 and T10 are initial builds (plan model); T4–T9
// edit a starter (edit model). `--tasks smoke` is the nightly subset.
import { loadTemplateFiles } from "@buildly/foundation";
import type { BuildKind, FileSet } from "@buildly/generator";
import { loadStarterFiles } from "@buildly/starters";
import {
  bundleOk,
  dependencyRefused,
  flowUpdates,
  hasModels,
  newRouteRegistered,
  noCrash,
  noIdentifier,
  noTimeout,
  onlyChanged,
  planProduced,
  repairedWithin,
  routesInclude,
  schemaVersionBumped,
  seedAtLeast,
  smokePasses,
  succeeded,
  tscOk,
  type Check,
} from "./checks";

export type TaskId = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "T8" | "T9" | "T10";
export type StarterSlug = "journal" | "habit-tracker" | "inventory";
/** Report groups: H1 (initial builds), H2 (edits), and guardrails. */
export type TaskGroup = "initial" | "edit" | "guardrail";

export interface EvalTask {
  id: TaskId;
  title: string;
  group: TaskGroup;
  kind: BuildKind;
  base: "foundation" | StarterSlug;
  prompt: string;
  checks: Check[];
  /** Applied to the base files before the run (T7's injected type error). */
  prepare?: (files: FileSet) => FileSet;
  /** Rewrites the starter's smoke test source to match an intended rename (T6). */
  smokeTest?: (source: string) => string;
}

export const SMOKE_TASK_IDS: TaskId[] = ["T1", "T4", "T7"];

/** The type error T7 asks the model to fix. */
export const T7_INJECTED = '\nexport const entriesTitle: number = "Entries";\n';
const T7_FILE = "src/screens/EntriesScreen.tsx";

/** Replaces `from` once, and fails loudly when the starter test no longer contains it. */
function replaceOnce(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`T6 smoke rewrite: "${from}" not found`);
  return source.replace(from, to);
}

/**
 * T6's version of the inventory smoke test. "Everywhere" lets a correct rename also touch
 * compound names and test IDs, so the test accepts both spellings of those: `quantityAfter`
 * or `stockLevelAfter`, and the stock label's test ID as item-quantity, item-stockLevel, or
 * item-stock-level. Plain `quantity` identifiers must become `stockLevel`.
 */
export function t6SmokeTest(source: string): string {
  let test = replaceOnce(
    source,
    'expect(recorded).toEqual([expect.objectContaining({ reason: "Damaged", quantityAfter: 22 })]);',
    'expect(recorded).toEqual([expect.objectContaining({ reason: "Damaged" })]);\n' +
      "    expect(recorded[0]!.stockLevelAfter ?? recorded[0]!.quantityAfter).toBe(22);",
  );
  test = test.replace(/\bquantity\b/g, "stockLevel");
  // After the word rename, so the pattern keeps the original spelling too.
  return replaceOnce(
    test,
    'findByTestId("item-stockLevel")',
    "findByTestId(/^item-(quantity|stock-?level)$/i)",
  );
}

export const TASKS: EvalTask[] = [
  {
    id: "T1",
    title: "Initial build: journal",
    group: "initial",
    kind: "initial",
    base: "foundation",
    prompt: "A journal app with entries, tags, and search",
    checks: [
      tscOk,
      bundleOk,
      routesInclude("entries list and entry detail", /^entr(y|ies)(list)?$/, /^entr(y|ies)detail/),
      hasModels("Entry"),
      seedAtLeast(/entr/i, 3, "seed has ≥ 3 entries"),
    ],
  },
  {
    id: "T2",
    title: "Initial build: habit tracker",
    group: "initial",
    kind: "initial",
    base: "foundation",
    prompt: "Habit tracker with daily check-ins, streaks, and history",
    checks: [
      tscOk,
      bundleOk,
      hasModels("Habit", "CheckIn"),
      routesInclude("a Today screen", /today/),
    ],
  },
  {
    id: "T3",
    title: "Initial build: inventory",
    group: "initial",
    kind: "initial",
    base: "foundation",
    prompt: "Inventory app: items, quantities, adjust stock, search",
    checks: [
      tscOk,
      bundleOk,
      hasModels("Item", "Adjustment"),
      flowUpdates(/adjust/i, "quantity", "adjust flow updates quantity"),
    ],
  },
  {
    id: "T4",
    title: "Add screen: Favorites tab",
    group: "edit",
    kind: "edit",
    base: "journal",
    prompt: "Add a Favorites tab showing starred entries",
    checks: [tscOk, bundleOk, smokePasses, newRouteRegistered(/favou?rite/, "new tab registered")],
  },
  {
    id: "T5",
    title: "Change model: weekly target",
    group: "edit",
    kind: "edit",
    base: "habit-tracker",
    prompt: "Add a target frequency per week to habits and show it on the habit card",
    checks: [tscOk, bundleOk, schemaVersionBumped, smokePasses],
  },
  {
    id: "T6",
    title: "Rename field: quantity → stockLevel",
    group: "edit",
    kind: "edit",
    base: "inventory",
    prompt: "Rename quantity to stockLevel everywhere",
    checks: [tscOk, noIdentifier("quantity"), smokePasses],
    // The smoke test reads item.quantity; it follows the same rename.
    smokeTest: t6SmokeTest,
  },
  {
    id: "T7",
    title: "Repair: injected type error",
    group: "edit",
    kind: "edit",
    base: "journal",
    prompt: "Fix the build",
    checks: [repairedWithin(2), onlyChanged(T7_FILE)],
    prepare: (files) => ({ ...files, [T7_FILE]: files[T7_FILE]! + T7_INJECTED }),
  },
  {
    id: "T8",
    title: "Visual change: low-stock badge",
    group: "edit",
    kind: "edit",
    base: "inventory",
    prompt: "Make low-stock items show a red badge",
    checks: [tscOk, bundleOk, smokePasses],
  },
  {
    id: "T9",
    title: "Guardrail: unavailable dependency",
    group: "guardrail",
    kind: "edit",
    base: "journal",
    prompt: "Add react-native-maps and show entries on a map",
    checks: [dependencyRefused("react-native-maps"), noCrash],
  },
  {
    id: "T10",
    title: "Ambiguity: an app for my shop",
    group: "initial",
    kind: "initial",
    base: "foundation",
    prompt: "An app for my shop",
    checks: [planProduced, succeeded, noTimeout],
  },
];

/** `smoke`, `all`, or a comma list such as `T1,T4`. */
export function selectTasks(spec: string): EvalTask[] {
  if (spec === "all") return TASKS;
  const ids =
    spec === "smoke" ? SMOKE_TASK_IDS : spec.split(",").map((s) => s.trim().toUpperCase());
  const unknown = ids.filter((id) => !TASKS.some((t) => t.id === id));
  if (unknown.length)
    throw new Error(`Unknown task: ${unknown.join(", ")} (use smoke, all, or T1–T10)`);
  return TASKS.filter((t) => ids.includes(t.id));
}

/** The task's starting files: the bare template or a starter, then any preparation. */
export function baseFilesFor(task: EvalTask): FileSet {
  const files = task.base === "foundation" ? loadTemplateFiles() : loadStarterFiles(task.base);
  return task.prepare ? task.prepare(files) : files;
}
