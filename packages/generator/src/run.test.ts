import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@buildly/shared";
import {
  loadFoundationFiles,
  loadTemplateFiles,
  readApiDigest,
  readManifest,
} from "@buildly/foundation";
import type { Provider, ProviderEvent, ProviderRequest, Usage } from "./provider";
import { costFor } from "./rates";
import {
  runGeneration,
  type CheckOutcome,
  type GenerationEventType,
  type GenerationInput,
  type GenerationPorts,
  type GenerationStatus,
  type RunResult,
  type StepName,
} from "./run";

const manifest = readManifest();
const models = { plan: "gpt-6.1-sol", edit: "gpt-6-luna" };
const USAGE: Usage = {
  inputTokens: 10_000,
  cachedTokens: 6_000,
  cacheWriteTokens: 1_000,
  outputTokens: 800,
};

// ---- scripted model turns -------------------------------------------------------------
type Turn = {
  text?: string;
  calls?: { name: string; args: Record<string, unknown> }[];
  onTurn?: () => void;
};

const writeHome = {
  name: "write_file",
  args: {
    path: "src/screens/HomeScreen.tsx",
    contents:
      'import { EmptyState, Screen } from "../components";\n\nexport function HomeScreen() {\n  return <Screen><EmptyState title="Hi" /></Screen>;\n}\n',
  },
};
const finishCall = {
  name: "finish",
  args: { summary: "Built the home screen.", screens: ["Home"] },
};
const PLAN = "Plan: one Home screen, no data models, a single tab.";

class ScriptedProvider implements Provider {
  readonly requests: ProviderRequest[] = [];
  private index = 0;
  constructor(private readonly turns: Turn[]) {}
  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.requests.push(request);
    const turn = this.turns[Math.min(this.index++, this.turns.length - 1)]!;
    turn.onTurn?.();
    for (const chunk of (turn.text ?? "").match(/.{1,12}/g) ?? [])
      yield { type: "text_delta", delta: chunk };
    for (const [i, call] of (turn.calls ?? []).entries()) {
      yield {
        type: "tool_call",
        callId: `call_${this.index}_${i}`,
        name: call.name,
        arguments: JSON.stringify(call.args),
      };
    }
    yield { type: "done", responseId: `resp_${this.index}`, model: request.model, usage: USAGE };
  }
}

// ---- fakes for the other ports ---------------------------------------------------------
const diag = (message: string): Diagnostic => ({
  source: "typecheck",
  file: "src/screens/HomeScreen.tsx",
  line: 4,
  col: 3,
  code: "TS2322",
  message,
});
const pass: CheckOutcome = { ok: true, diagnostics: [] };
const fail = (message: string): CheckOutcome => ({ ok: false, diagnostics: [diag(message)] });

function harness(
  turns: Turn[],
  options: {
    kind?: "initial" | "edit";
    typecheck?: CheckOutcome[];
    bundle?: CheckOutcome[];
    cancelAfterTurns?: number;
  } = {},
) {
  const provider = new ScriptedProvider(turns);
  const clock = { now: new Date("2026-10-01T10:00:00Z") };
  const log = {
    statuses: [] as GenerationStatus[],
    steps: [] as { step: StepName; status: string; detail?: Record<string, unknown> }[],
    events: [] as GenerationEventType[],
    deltas: "",
    messages: [] as string[],
    snapshots: [] as Record<string, string>[],
    currentSnapshot: [] as string[],
    finished: undefined as RunResult | undefined,
  };
  const typecheck = [...(options.typecheck ?? [pass])];
  const bundle = [...(options.bundle ?? [pass])];
  const controller = new AbortController();
  const ports: GenerationPorts = {
    provider,
    models,
    typecheck: async () => typecheck.shift() ?? pass,
    bundle: async () => bundle.shift() ?? pass,
    store: {
      setStatus: async (status) => void log.statuses.push(status),
      recordStep: async (step) =>
        void log.steps.push({ step: step.step, status: step.status, detail: step.detail }),
      saveAssistantMessage: async (content) => void log.messages.push(content),
      createSnapshot: async (files) => {
        log.snapshots.push(files);
        return `snap-${log.snapshots.length}`;
      },
      setCurrentSnapshot: async (id) => void log.currentSnapshot.push(id),
      finish: async (result) => void (log.finished = result),
    },
    events: {
      publish: async (type) => void log.events.push(type),
      delta: (text) => void (log.deltas += text),
    },
    now: () => clock.now,
    isCancelled: async () =>
      options.cancelAfterTurns !== undefined &&
      provider.requests.length >= options.cancelAfterTurns,
    signal: controller.signal,
  };
  const input: GenerationInput = {
    kind: options.kind ?? "initial",
    baseFiles: loadTemplateFiles(),
    history: [],
    userMessage: "A simple app with a home screen",
    manifest,
    apiDigest: readApiDigest(),
    foundationFiles: loadFoundationFiles(),
    cacheKey: "project-1",
  };
  return { provider, clock, log, ports, input, controller, run: () => runGeneration(input, ports) };
}

const happyTurns: Turn[] = [{ text: PLAN, calls: [writeHome] }, { calls: [finishCall] }];

describe("runGeneration — happy path (4.4.1)", () => {
  it("writes steps plan, edit, typecheck, bundle, snapshot and ends succeeded", async () => {
    const h = harness(happyTurns);
    const result = await h.run();

    expect(result.status).toBe("succeeded");
    expect(h.log.steps.map((s) => `${s.step}:${s.status}`)).toEqual([
      "plan:succeeded",
      "edit:succeeded",
      "typecheck:succeeded",
      "bundle:succeeded",
      "snapshot:succeeded",
    ]);
    expect(h.log.statuses).toEqual(["planning", "editing", "checking", "bundling"]);
    expect(h.log.events).toEqual([
      "plan_ready",
      "files_written",
      "types_checked",
      "preview_bundled",
      "snapshot_created",
      "finished",
    ]);
    expect(h.log.deltas).toBe(PLAN);
    expect(h.log.messages).toEqual([PLAN, "Built the home screen."]);
    expect(h.log.snapshots).toHaveLength(1);
    expect(h.log.snapshots[0]!["src/screens/HomeScreen.tsx"]).toContain("EmptyState");
    expect(h.log.currentSnapshot).toEqual(["snap-1"]);
    expect(result.finish).toEqual({
      summary: "Built the home screen.",
      screens: ["Home"],
      warnings: [],
    });
    expect(h.log.finished).toBe(result);
  });

  it("sends the same instructions and prefix on every turn, plus the growing tool exchange", async () => {
    const h = harness(happyTurns);
    await h.run();
    const [first, second] = h.provider.requests;
    expect(second!.instructions).toBe(first!.instructions);
    expect(second!.input.slice(0, first!.input.length)).toEqual(first!.input);
    expect(second!.input.slice(first!.input.length)).toEqual([
      { role: "assistant", content: PLAN },
      {
        type: "function_call",
        callId: "call_1_0",
        name: "write_file",
        arguments: JSON.stringify(writeHome.args),
      },
      {
        type: "function_call_output",
        callId: "call_1_0",
        output: "ok: wrote src/screens/HomeScreen.tsx",
      },
    ]);
    expect(second!.promptCacheKey).toBe("project-1");
  });

  it("accounts usage and cost per model actually called", async () => {
    const h = harness(happyTurns);
    const result = await h.run();
    expect(result.turns).toBe(2);
    expect(result.usage).toEqual({
      inputTokens: 20_000,
      cachedTokens: 12_000,
      cacheWriteTokens: 2_000,
      outputTokens: 1_600,
    });
    expect(result.costUsd).toBe(costFor(result.usage, "gpt-6.1-sol"));
  });
});

describe("model routing in a run (4.1.3)", () => {
  it("an initial build calls the plan model; its repair calls the edit model", async () => {
    const h = harness([...happyTurns, { calls: [finishCall] }], {
      typecheck: [fail("Type 'string' is not assignable")],
    });
    const result = await h.run();
    expect(result.status).toBe("succeeded");
    expect(h.provider.requests.map((r) => r.model)).toEqual([
      "gpt-6.1-sol",
      "gpt-6.1-sol",
      "gpt-6-luna",
    ]);
    expect(result.model).toBe("gpt-6.1-sol");
    expect(result.costUsd).toBe(
      Math.round(
        (costFor(
          {
            ...USAGE,
            inputTokens: 20_000,
            cachedTokens: 12_000,
            cacheWriteTokens: 2_000,
            outputTokens: 1_600,
          },
          "gpt-6.1-sol",
        ) +
          costFor(USAGE, "gpt-6-luna")) *
          1e6,
      ) / 1e6,
    );
  });

  it("a follow-up edit and its repair call the edit model only", async () => {
    const h = harness([...happyTurns, { calls: [finishCall] }], {
      kind: "edit",
      typecheck: [fail("broken")],
    });
    const result = await h.run();
    expect(new Set(h.provider.requests.map((r) => r.model))).toEqual(new Set(["gpt-6-luna"]));
    expect(result.model).toBe("gpt-6-luna");
  });
});

describe("repair path (4.4.2)", () => {
  it("fail, fail, pass → succeeded with repair_attempts = 2", async () => {
    const h = harness([...happyTurns, { calls: [finishCall] }, { calls: [finishCall] }], {
      typecheck: [fail("first error"), fail("second error"), pass],
    });
    const result = await h.run();
    expect(result).toMatchObject({ status: "succeeded", repairAttempts: 2 });
    expect(h.log.steps.map((s) => `${s.step}:${s.status}`)).toEqual([
      "plan:succeeded",
      "edit:succeeded",
      "typecheck:failed",
      "repair:succeeded",
      "typecheck:failed",
      "repair:succeeded",
      "typecheck:succeeded",
      "bundle:succeeded",
      "snapshot:succeeded",
    ]);
    // The diagnostics went back to the model.
    const repairPrompt = h.provider.requests[2]!.input.find(
      (i) => "role" in i && i.role === "developer" && i.content.includes("first error"),
    );
    expect(repairPrompt).toBeDefined();
  });

  it("fail, fail, fail → failed with the last diagnostics; no snapshot, current snapshot unchanged", async () => {
    const h = harness([...happyTurns, { calls: [finishCall] }, { calls: [finishCall] }], {
      typecheck: [
        fail("one"),
        fail("two"),
        fail("three: Type 'string' is not assignable to type 'number'"),
      ],
    });
    const result = await h.run();
    expect(result).toMatchObject({ status: "failed", repairAttempts: 2, errorCode: "typecheck" });
    expect(result.errorDetail).toContain("three: Type 'string' is not assignable to type 'number'");
    expect(result.errorDetail).toContain("src/screens/HomeScreen.tsx:4:3");
    expect(h.log.snapshots).toEqual([]);
    expect(h.log.currentSnapshot).toEqual([]);
    expect(h.log.events.at(-1)).toBe("finished");
  });

  it("repairs a bundle failure too", async () => {
    const h = harness([...happyTurns, { calls: [finishCall] }], {
      bundle: [
        { ok: false, diagnostics: [{ source: "bundle", message: "Unexpected token" }] },
        pass,
      ],
    });
    const result = await h.run();
    expect(result).toMatchObject({ status: "succeeded", repairAttempts: 1 });
    expect(h.log.events).toContain("bundle_failed");
  });
});

describe("cancel and timeout (4.4.3)", () => {
  it("cancel during editing → cancelled, no snapshot", async () => {
    const h = harness(
      [{ text: PLAN, calls: [writeHome] }, { calls: [writeHome] }, { calls: [finishCall] }],
      { cancelAfterTurns: 2 },
    );
    const result = await h.run();
    expect(result).toMatchObject({ status: "cancelled", errorCode: "cancelled" });
    expect(h.log.statuses).toContain("editing");
    expect(h.provider.requests).toHaveLength(2);
    expect(h.log.snapshots).toEqual([]);
    expect(h.log.currentSnapshot).toEqual([]);
    expect(h.log.steps.map((s) => s.step)).toEqual(["plan"]);
  });

  it("a clock jump past 240 s → timed_out", async () => {
    const h = harness([{ text: PLAN, calls: [writeHome] }, { calls: [finishCall] }]);
    h.provider["turns"][1]!.onTurn = () => {
      h.clock.now = new Date(h.clock.now.getTime() + 241_000);
    };
    const result = await h.run();
    expect(result).toMatchObject({ status: "timed_out", errorCode: "timeout" });
    expect(h.log.snapshots).toEqual([]);
  });

  it("an aborted signal (the worker's hard limit) → timed_out", async () => {
    const h = harness(happyTurns);
    h.controller.abort(new Error("timed out after 240000 ms"));
    expect((await h.run()).status).toBe("timed_out");
  });
});

describe("other failures", () => {
  it("11 rejected tool calls → failed too_many_rejections", async () => {
    const bad = { name: "write_file", args: { path: "package.json", contents: "{}" } };
    const h = harness([{ text: PLAN, calls: Array.from({ length: 11 }, () => bad) }]);
    const result = await h.run();
    expect(result).toMatchObject({
      status: "failed",
      errorCode: "too_many_rejections",
      rejections: 11,
    });
  });

  it("a model that never calls finish → failed no_finish after 25 turns", async () => {
    const h = harness([
      { text: PLAN, calls: [writeHome] },
      { calls: [{ name: "list_files", args: {} }] },
    ]);
    const result = await h.run();
    expect(result).toMatchObject({ status: "failed", errorCode: "no_finish", turns: 25 });
  });

  it("an oversized project → failed context_too_large before any model call", async () => {
    const h = harness(happyTurns);
    for (let i = 0; i < 40; i++)
      h.input.baseFiles[`src/screens/Big${i}.tsx`] =
        `export const x${i} = ${JSON.stringify("word ".repeat(2000))};\n`;
    const result = await h.run();
    expect(result).toMatchObject({ status: "failed", errorCode: "context_too_large", turns: 0 });
    expect(h.provider.requests).toEqual([]);
  });
});

describe("provider failure", () => {
  it("a provider error ends the run as failed provider_error, with what was used so far", async () => {
    const { ProviderError } = await import("./provider");
    const h = harness(happyTurns);
    h.ports.provider = {
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new ProviderError("Incorrect API key provided", "auth", false, 401);
      },
    };
    const result = await h.run();
    expect(result).toMatchObject({ status: "failed", errorCode: "provider_error", turns: 1 });
    expect(result.errorDetail).toContain("Incorrect API key provided");
  });
});
