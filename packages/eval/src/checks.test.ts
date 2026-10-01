// TODO 4.7.2: each task's checks against a passing and a failing fixture. Passing
// fixtures are the committed starters (or small edits of them), so the checks are known
// to accept real, working apps.
import { describe, expect, it } from "vitest";
import { loadTemplateFiles } from "@buildly/foundation";
import { emptyUsage, type FileSet, type RunResult } from "@buildly/generator";
import { loadStarterFiles } from "@buildly/starters";
import { changedPaths, runChecks, type RunOutcome } from "./checks";
import { T7_INJECTED, TASKS, baseFilesFor, selectTasks, type TaskId } from "./tasks";

const task = (id: TaskId) => TASKS.find((t) => t.id === id)!;

function outcome(
  over: Omit<Partial<RunOutcome>, "result"> & { result?: Partial<RunResult> },
): RunOutcome {
  const files = over.files ?? {};
  return {
    baseFiles: over.baseFiles ?? files,
    files,
    steps: over.steps ?? [
      { step: "typecheck", status: "succeeded" },
      { step: "bundle", status: "succeeded" },
    ],
    messages: over.messages ?? ["Plan: build it.", "Done."],
    smoke: over.smoke,
    result: {
      status: "succeeded",
      model: "gpt-6-luna",
      modelsCalled: [],
      repairAttempts: 0,
      usage: emptyUsage(),
      costUsd: 0,
      turns: 2,
      rejections: 0,
      ...over.result,
    },
  };
}

/** Names of the failed checks. */
const failures = (id: TaskId, o: RunOutcome) =>
  runChecks(task(id).checks, o)
    .filter((c) => !c.ok)
    .map((c) => c.name);

const smokeOk = { ok: true, passed: 2, failed: 0 };
const journal = loadStarterFiles("journal");
const habits = loadStarterFiles("habit-tracker");
const inventory = loadStarterFiles("inventory");
const template = loadTemplateFiles();

describe("task checks", () => {
  it("T1: the journal starter passes; the bare template fails", () => {
    expect(failures("T1", outcome({ baseFiles: template, files: journal }))).toEqual([]);
    expect(failures("T1", outcome({ baseFiles: template, files: template }))).toEqual([
      "entries list and entry detail",
      "models Entry",
      "seed has ≥ 3 entries",
    ]);
  });

  it("T2: the habit tracker passes; a failed type check and the template fail", () => {
    expect(failures("T2", outcome({ files: habits }))).toEqual([]);
    expect(
      failures(
        "T2",
        outcome({ files: template, steps: [{ step: "typecheck", status: "failed" }] }),
      ),
    ).toEqual(["tsc ok", "bundle ok", "models Habit, CheckIn", "a Today screen"]);
  });

  it("T3: the inventory starter passes; dropping the quantity update fails", () => {
    expect(failures("T3", outcome({ files: inventory }))).toEqual([]);
    const noUpdate = {
      ...inventory,
      "src/data/models.ts": inventory["src/data/models.ts"]!.replace(
        "await items.update(itemId, { quantity: quantityAfter });",
        "",
      ),
    };
    expect(failures("T3", outcome({ files: noUpdate }))).toEqual(["adjust flow updates quantity"]);
  });

  it("T4: a registered Favorites tab passes; the unchanged starter or failing smoke tests fail", () => {
    const withFavorites = {
      ...journal,
      "src/navigation.tsx": journal["src/navigation.tsx"]!.replace(
        '<Tabs.Screen\n        name="Tags"',
        '<Tabs.Screen name="Favorites" component={FavoritesScreen} />\n      <Tabs.Screen\n        name="Tags"',
      ),
    };
    expect(
      failures("T4", outcome({ baseFiles: journal, files: withFavorites, smoke: smokeOk })),
    ).toEqual([]);
    expect(
      failures(
        "T4",
        outcome({ baseFiles: journal, files: journal, smoke: { ok: false, passed: 1, failed: 1 } }),
      ),
    ).toEqual(["starter smoke tests pass", "new tab registered"]);
  });

  it("T5: a bumped schemaVersion passes; an unchanged one fails", () => {
    const bumped = {
      ...habits,
      "src/data/models.ts": habits["src/data/models.ts"]!.replace(
        "schemaVersion = 1",
        "schemaVersion = 2",
      ),
    };
    expect(failures("T5", outcome({ baseFiles: habits, files: bumped, smoke: smokeOk }))).toEqual(
      [],
    );
    expect(failures("T5", outcome({ baseFiles: habits, files: habits, smoke: smokeOk }))).toEqual([
      "schemaVersion bumped",
    ]);
  });

  it("T6: a full rename passes (quantityAfter may stay); a leftover identifier fails", () => {
    const renamed: FileSet = Object.fromEntries(
      Object.entries(inventory).map(([p, s]) => [p, s.replace(/\bquantity\b/g, "stockLevel")]),
    );
    expect(
      failures("T6", outcome({ baseFiles: inventory, files: renamed, smoke: smokeOk })),
    ).toEqual([]);
    // A comment or a UI string mentioning quantity is not an identifier.
    const withText = {
      ...renamed,
      "src/screens/ItemsScreen.tsx": `// quantity\n${renamed["src/screens/ItemsScreen.tsx"]}\nconst label = "quantity";\n`,
    };
    expect(failures("T6", outcome({ files: withText, smoke: smokeOk }))).toEqual([]);
    expect(failures("T6", outcome({ files: inventory, smoke: smokeOk }))).toEqual([
      "no quantity identifier",
    ]);
  });

  it("T7: fixing only the broken file within 2 repairs passes; touching others or giving up fails", () => {
    const broken = baseFilesFor(task("T7"));
    expect(broken["src/screens/EntriesScreen.tsx"]).toContain(T7_INJECTED.trim());
    expect(
      failures("T7", outcome({ baseFiles: broken, files: journal, result: { repairAttempts: 1 } })),
    ).toEqual([]);
    const sprawl = { ...journal, "src/screens/TagsScreen.tsx": "// rewritten\n" };
    expect(failures("T7", outcome({ baseFiles: broken, files: sprawl }))).toEqual([
      "no unrelated files changed",
    ]);
    expect(
      failures(
        "T7",
        outcome({
          baseFiles: broken,
          files: broken,
          result: { status: "failed", errorCode: "typecheck", repairAttempts: 2 },
        }),
      ),
    ).toEqual(["tsc ok in ≤ 2 attempts"]);
  });

  it("T8: checks and smoke tests passing passes; a failed bundle fails", () => {
    expect(failures("T8", outcome({ files: inventory, smoke: smokeOk }))).toEqual([]);
    expect(
      failures(
        "T8",
        outcome({
          files: inventory,
          smoke: smokeOk,
          steps: [
            { step: "typecheck", status: "succeeded" },
            { step: "bundle", status: "failed" },
          ],
        }),
      ),
    ).toEqual(["bundle ok"]);
  });

  it("T9: a clear refusal passes; importing the package or a crash fails", () => {
    const refusal = [
      "Plan: explain the limitation.",
      "react-native-maps is not available in Buildly apps, so I listed entries by place instead.",
    ];
    expect(
      failures("T9", outcome({ baseFiles: journal, files: journal, messages: refusal })),
    ).toEqual([]);
    const usesMaps = {
      ...journal,
      "src/screens/MapScreen.tsx": 'import MapView from "react-native-maps";\n',
    };
    expect(
      failures(
        "T9",
        outcome({
          baseFiles: journal,
          files: usesMaps,
          messages: ["Added a map."],
          result: { status: "failed", errorCode: "too_many_rejections" },
        }),
      ),
    ).toEqual([
      "explains react-native-maps is unavailable, no package change",
      "no failed state from a crash",
    ]);
  });

  it("T10: a plan and a succeeded build pass; a timeout without a plan fails", () => {
    expect(failures("T10", outcome({ files: journal }))).toEqual([]);
    expect(
      failures(
        "T10",
        outcome({
          files: template,
          messages: [],
          result: { status: "timed_out", errorCode: "timeout" },
        }),
      ),
    ).toEqual(["plan produced", "build succeeds", "no hang or timeout"]);
  });
});

describe("tasks", () => {
  it("selects the smoke subset, all tasks, or a list", () => {
    expect(selectTasks("smoke").map((t) => t.id)).toEqual(["T1", "T4", "T7"]);
    expect(selectTasks("all")).toHaveLength(10);
    expect(selectTasks("t2, T9").map((t) => t.id)).toEqual(["T2", "T9"]);
    expect(() => selectTasks("T11")).toThrow(/Unknown task: T11/);
  });

  it("routes T1–T3 and T10 to the plan model and T4–T9 to the edit model", () => {
    expect(TASKS.filter((t) => t.kind === "initial").map((t) => t.id)).toEqual([
      "T1",
      "T2",
      "T3",
      "T10",
    ]);
  });

  it("changedPaths lists added, removed, and modified files", () => {
    expect(changedPaths({ a: "1", b: "2", c: "3" }, { a: "1", b: "x", d: "4" })).toEqual([
      "b",
      "c",
      "d",
    ]);
  });
});
