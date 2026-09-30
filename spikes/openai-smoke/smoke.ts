// SPIKES.md S3: OpenAI tool calling and cost smoke.
//
//   OPENAI_API_KEY in the environment or in ./.env (gitignored), then:
//   pnpm smoke [--models gpt-6.1-sol,gpt-5.3-codex,gpt-6-luna] [--runs 5]
//              [--edit-model gpt-6-luna] [--edit-runs 1]
//
// Each initial run asks for a two-screen app and loops over tool calls until `finish`.
// Follow-up edits ("add a Favorites tab") start from the first successful flagship
// result. Results go to results/<timestamp>.json; the key is never printed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { FunctionTool, ResponseInputItem, ResponseUsage } from "openai/resources/responses/responses";
import { RATES, RATES_SOURCE, type RatedModel } from "../../packages/generator/src/rates";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(here, ".env"));
} catch {
  // No .env; rely on the environment.
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>(
    (pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1] ?? ""]] : pairs),
    [],
  ),
);
const MODELS = (args.models ?? "gpt-6.1-sol,gpt-5.3-codex,gpt-6-luna").split(",") as RatedModel[];
const RUNS = Number(args.runs ?? 5);
const EDIT_MODEL = (args["edit-model"] ?? "gpt-6-luna") as RatedModel;
const EDIT_RUNS = Number(args["edit-runs"] ?? 1);
const MAX_TURNS = 30;
const REJECTION_BUDGET = 10;
const MAX_FILE_BYTES = 64 * 1024;

// ---------- Foundation surface (stand-in for packages/foundation until Phase 2) ----------

// The S4 fixture's theme, components, and store are the foundation's read-only files.
const FIXTURE = join(here, "../checker-speed/fixture");
const FOUNDATION_FILES: Record<string, string> = Object.fromEntries(
  ["App.tsx", "src/theme/index.tsx", "src/components/index.tsx", "src/data/store.ts", "tsconfig.json"].map((p) => [
    p,
    readFileSync(join(FIXTURE, p), "utf8"),
  ]),
);

const ALLOWED_IMPORTS = [
  "react",
  "react-native",
  "@react-navigation/native",
  "@react-navigation/native-stack",
  "@react-navigation/bottom-tabs",
  "react-native-screens",
  "react-native-safe-area-context",
  "@react-native-async-storage/async-storage",
  "expo-status-bar",
  "@expo/vector-icons",
];

const API_DIGEST = `# Foundation API (read-only; import with relative paths)

## src/theme/index.tsx
- \`useTheme(): Theme\` with \`color\` (bg, surface, text, muted, line, accent, danger), \`space\` (xs 4, sm 8, md 12, lg 16, xl 24), \`radius\` (card, pill), \`type\` (body, small, title, heading).

## src/components/index.tsx
- \`Screen({ children, scroll?, testID? })\` safe-area page, scrolls by default.
- \`Card({ children, style?, testID? })\`
- \`ListRow({ title, subtitle?, onPress?, testID? })\`
- \`Button({ label, onPress, disabled?, variant?: "primary" | "danger", testID? })\`
- \`TextField({ label, value, onChangeText, multiline?, testID? })\`
- \`EmptyState({ title, body?, testID? })\`
- \`FAB({ onPress, testID? })\` floating add button.

## src/data/store.ts
- \`interface BaseRecord { id; createdAt; updatedAt; isDemo? }\`
- \`defineCollection<T extends BaseRecord>(name, searchFields: (keyof T)[])\`
- \`createRepository(collection)\` returns \`{ list(), get(id), create(input), update(id, patch), remove(id), search(query) }\`, all async. \`create\` takes the record without id/createdAt/updatedAt.

## Navigation (project-owned src/navigation.tsx)
- Export \`RootStackParamList\` and a \`Navigation\` component: a native stack whose first screen \`Tabs\` hosts a bottom tab navigator. Register every screen there. App.tsx renders \`<Navigation />\`.
`;

const SYSTEM = `You build and edit React Native + Expo (SDK 54) + TypeScript apps on a fixed foundation, using only the provided tools.

Rules:
- You may write only: src/screens/**/*.tsx, src/data/models.ts, src/data/seed.ts, src/navigation.tsx.
- Foundation files are read-only: App.tsx, src/theme/**, src/components/**, src/data/store.ts, package.json, tsconfig.json.
- Import only these packages: ${ALLOWED_IMPORTS.join(", ")}; everything else must be a relative import of project or foundation files.
- Persist data only through createRepository from src/data/store.ts. Export \`schemaVersion\` from src/data/models.ts and bump it when a model's shape changes. Seed demo records with isDemo: true.
- TypeScript strict must pass. Use the foundation components and useTheme() instead of raw colors.
- Read files before editing them. When done, call finish with a one-paragraph summary and the screen names.

${API_DIGEST}`;

const INITIAL_PROJECT: Record<string, string> = {
  "src/navigation.tsx": `import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "./screens/HomeScreen";

export type RootStackParamList = { Tabs: undefined };

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

function TabsNavigator() {
  return (
    <Tabs.Navigator>
      <Tabs.Screen name="Home" component={HomeScreen} />
    </Tabs.Navigator>
  );
}

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
`,
  "src/screens/HomeScreen.tsx": `import { EmptyState, Screen } from "../components";

export function HomeScreen() {
  return (
    <Screen>
      <EmptyState title="Your app starts here" />
    </Screen>
  );
}
`,
  "src/data/models.ts": "export const schemaVersion = 1;\n",
  "src/data/seed.ts": "export async function seed(): Promise<void> {}\n",
};

const INITIAL_PROMPT =
  "Build a recipe box app with two screens: Recipes (a searchable list with a + button to add one) and Recipe detail. A recipe has a title, a list of ingredients, cooking minutes, and a favorite flag that can be toggled on the detail screen. Seed three demo recipes.";
const EDIT_PROMPT = "Add a Favorites tab that lists only favorite recipes and opens the same detail screen.";

// ---------- Tools (ARCHITECTURE.md §4), strict schemas ----------

const tool = (name: string, description: string, properties: Record<string, unknown>): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

const TOOLS: FunctionTool[] = [
  tool("list_files", "List project-owned file paths.", {}),
  tool("read_file", "Read a project file or a read-only foundation file.", { path: { type: "string" } }),
  tool("write_file", "Create or replace a project file with the full contents.", {
    path: { type: "string" },
    contents: { type: "string" },
  }),
  tool("delete_file", "Delete a project-owned file.", { path: { type: "string" } }),
  tool("finish", "End the edit loop.", {
    summary: { type: "string" },
    screens: { type: "array", items: { type: "string" } },
  }),
];

const WRITABLE = [/^src\/screens\/[\w\-/]+\.tsx$/, /^src\/data\/models\.ts$/, /^src\/data\/seed\.ts$/, /^src\/navigation\.tsx$/];

function writeRejection(path: string, contents: string): string | undefined {
  if (posix.normalize(path) !== path || path.startsWith("/") || path.includes("..")) return "path traversal";
  if (!WRITABLE.some((re) => re.test(path))) return `not writable: ${path}`;
  if (Buffer.byteLength(contents) > MAX_FILE_BYTES) return "file larger than 64 KB";
  for (const [, spec] of contents.matchAll(/from\s+["']([^"']+)["']/g)) {
    if (spec!.startsWith(".")) continue;
    const pkg = spec!.startsWith("@") ? spec!.split("/").slice(0, 2).join("/") : spec!.split("/")[0]!;
    if (!ALLOWED_IMPORTS.includes(pkg)) return `import not allowed: ${spec}`;
  }
  return undefined;
}

// ---------- Run loop ----------

interface Usage {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
}

interface RunResult {
  kind: "initial" | "edit";
  model: RatedModel;
  run: number;
  status: "finished" | "no_finish" | "rejection_budget" | "error";
  error?: string;
  turns: number;
  toolCalls: number;
  parseErrors: number;
  rejections: string[];
  usage: Usage;
  usageReportsCachedTokens: boolean;
  costUsd: number;
  wallMs: number;
  screens?: string[];
  summary?: string;
  typecheck?: { ok: boolean; diagnostics: number; first?: string };
  files?: Record<string, string>;
}

function costOf(model: RatedModel, u: Usage): number {
  const r: { input: number; cachedInput: number; cacheWrite?: number; output: number } = RATES[model];
  const uncached = u.input - u.cached - u.cacheWrite;
  const usd = uncached * r.input + u.cached * r.cachedInput + u.cacheWrite * (r.cacheWrite ?? r.input) + u.output * r.output;
  return Math.round((usd / 1e6) * 1e6) / 1e6;
}

async function runOnce(
  client: OpenAI,
  kind: RunResult["kind"],
  model: RatedModel,
  run: number,
  startFiles: Record<string, string>,
  prompt: string,
): Promise<RunResult> {
  const files = { ...startFiles };
  const result: RunResult = {
    kind,
    model,
    run,
    status: "no_finish",
    turns: 0,
    toolCalls: 0,
    parseErrors: 0,
    rejections: [],
    usage: { input: 0, cached: 0, cacheWrite: 0, output: 0 },
    usageReportsCachedTokens: true,
    costUsd: 0,
    wallMs: 0,
  };
  const started = Date.now();
  let input: ResponseInputItem[] | string = prompt;
  let previous: string | undefined;

  try {
    while (result.turns < MAX_TURNS) {
      result.turns++;
      const stream = await client.responses.create({
        model,
        instructions: SYSTEM,
        input,
        tools: TOOLS,
        previous_response_id: previous,
        prompt_cache_key: `buildly-s3-${kind}`,
        stream: true,
      });
      const calls: { call_id: string; name: string; arguments: string }[] = [];
      let usage: ResponseUsage | undefined;
      for await (const event of stream) {
        if (event.type === "response.output_item.done" && event.item.type === "function_call") calls.push(event.item);
        if (event.type === "response.completed") {
          usage = event.response.usage ?? undefined;
          previous = event.response.id;
        }
      }
      if (usage) {
        result.usage.input += usage.input_tokens;
        result.usage.cached += usage.input_tokens_details?.cached_tokens ?? 0;
        result.usage.cacheWrite += usage.input_tokens_details?.cache_write_tokens ?? 0;
        result.usage.output += usage.output_tokens;
        if (usage.input_tokens_details?.cached_tokens === undefined) result.usageReportsCachedTokens = false;
      }
      if (calls.length === 0) break;

      const outputs: ResponseInputItem[] = [];
      let finished = false;
      for (const call of calls) {
        result.toolCalls++;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(call.arguments) as Record<string, unknown>;
        } catch {
          result.parseErrors++;
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: "error: arguments are not valid JSON" });
          continue;
        }
        const reply = (output: string) => outputs.push({ type: "function_call_output", call_id: call.call_id, output });
        const reject = (reason: string) => {
          result.rejections.push(`${call.name}: ${reason}`);
          reply(`error: ${reason}`);
        };
        const path = String(parsed.path ?? "");
        switch (call.name) {
          case "list_files":
            reply(Object.keys(files).sort().join("\n"));
            break;
          case "read_file":
            if (path in files) reply(files[path]!);
            else if (path in FOUNDATION_FILES) reply(FOUNDATION_FILES[path]!);
            else reject(`no such file: ${path}`);
            break;
          case "write_file": {
            const contents = String(parsed.contents ?? "");
            const reason = writeRejection(path, contents);
            if (reason) reject(reason);
            else {
              files[path] = contents;
              reply("ok");
            }
            break;
          }
          case "delete_file":
            if (path in files && WRITABLE.some((re) => re.test(path))) {
              delete files[path];
              reply("ok");
            } else reject(`cannot delete: ${path}`);
            break;
          case "finish":
            result.summary = String(parsed.summary ?? "");
            result.screens = Array.isArray(parsed.screens) ? parsed.screens.map(String) : [];
            finished = true;
            reply("ok");
            break;
          default:
            reject(`unknown tool: ${call.name}`);
        }
      }
      if (result.rejections.length > REJECTION_BUDGET) {
        result.status = "rejection_budget";
        break;
      }
      if (finished) {
        result.status = "finished";
        break;
      }
      input = outputs;
    }
  } catch (error) {
    result.status = "error";
    result.error = error instanceof Error ? error.message : String(error);
  }

  result.wallMs = Date.now() - started;
  result.costUsd = costOf(model, result.usage);
  result.files = files;
  result.typecheck = typecheck(files);
  return result;
}

// Assembles foundation + project files with the S4 pre-baked node_modules and runs tsc.
function typecheck(files: Record<string, string>): RunResult["typecheck"] {
  const deps = join(here, "../checker-speed/foundation/node_modules");
  if (!existsSync(deps)) return undefined;
  const dir = mkdtempSync(join(tmpdir(), "s3-check-"));
  try {
    for (const [p, contents] of Object.entries({ ...FOUNDATION_FILES, ...files })) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), contents);
    }
    symlinkSync(deps, join(dir, "node_modules"), "dir");
    const out = spawnSync(process.execPath, [join(deps, "typescript/bin/tsc"), "--noEmit", "-p", "tsconfig.json", "--pretty", "false"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 60_000,
    });
    const lines = out.stdout.split("\n").filter((l) => l.includes("error TS"));
    return { ok: out.status === 0, diagnostics: lines.length, first: lines[0] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- Main ----------

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set (environment or spikes/openai-smoke/.env).");
  process.exit(2);
}
const client = new OpenAI({ maxRetries: 3 });
const results: RunResult[] = [];

function line(r: RunResult) {
  const tc = r.typecheck ? (r.typecheck.ok ? "tsc ok" : `tsc ${r.typecheck.diagnostics} err`) : "tsc skipped";
  console.log(
    `${r.kind.padEnd(7)} ${r.model.padEnd(14)} #${r.run} ${r.status.padEnd(16)} turns=${r.turns} calls=${r.toolCalls} parseErr=${r.parseErrors} rejected=${r.rejections.length} in=${r.usage.input} cached=${r.usage.cached} out=${r.usage.output} $${r.costUsd.toFixed(4)} ${(r.wallMs / 1000).toFixed(1)}s ${tc}${r.error ? ` error=${r.error}` : ""}`,
  );
}

for (const model of MODELS) {
  for (let run = 1; run <= RUNS; run++) {
    const r = await runOnce(client, "initial", model, run, INITIAL_PROJECT, INITIAL_PROMPT);
    results.push(r);
    line(r);
  }
}

const base = results.find((r) => r.kind === "initial" && r.model === MODELS[0] && r.status === "finished" && r.typecheck?.ok !== false);
if (base?.files) {
  for (let run = 1; run <= EDIT_RUNS; run++) {
    const r = await runOnce(client, "edit", EDIT_MODEL, run, base.files, EDIT_PROMPT);
    results.push(r);
    line(r);
  }
} else {
  console.log("edit: skipped, no finished initial run from the first model to build on");
}

const summary = [...new Set(results.map((r) => `${r.kind}:${r.model}`))].map((key) => {
  const rs = results.filter((r) => `${r.kind}:${r.model}` === key);
  const mean = (f: (r: RunResult) => number) => Math.round((rs.reduce((s, r) => s + f(r), 0) / rs.length) * 1e6) / 1e6;
  return {
    key,
    runs: rs.length,
    finished: rs.filter((r) => r.status === "finished").length,
    parsedFirstTry: rs.filter((r) => r.toolCalls > 0 && r.parseErrors === 0).length,
    noRejections: rs.filter((r) => r.rejections.length === 0).length,
    typecheckOk: rs.filter((r) => r.typecheck?.ok).length,
    meanCostUsd: mean((r) => r.costUsd),
    maxCostUsd: Math.max(...rs.map((r) => r.costUsd)),
    meanTurns: mean((r) => r.turns),
    meanInput: mean((r) => r.usage.input),
    meanCached: mean((r) => r.usage.cached),
    meanOutput: mean((r) => r.usage.output),
    meanWallS: mean((r) => r.wallMs / 1000),
  };
});
console.table(summary);

mkdirSync(join(here, "results"), { recursive: true });
const out = join(here, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), rates: { ...RATES_SOURCE, models: RATES }, summary, results }, null, 2) + "\n");
console.log(`\nwrote ${out}`);
