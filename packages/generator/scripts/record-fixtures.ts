// Records raw OpenAI Responses API streams as test fixtures (TODO 4.1.1). Costs well under
// a cent on gpt-6-luna. Reads OPENAI_API_KEY from the environment or the repo-root .env;
// the key is sent only to api.openai.com and never written to a fixture.
//
//   pnpm --filter @buildly/generator record-fixtures
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
try {
  process.loadEnvFile(join(root, "../../.env"));
} catch {
  // rely on the environment
}
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error("OPENAI_API_KEY is not set");

const MODEL = "gpt-6-luna";
const readFileTool = {
  type: "function",
  name: "read_file",
  description: "Read a project file.",
  strict: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
};

async function record(name: string, body: Record<string, unknown>, apiKey = key!) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const file = join(
    root,
    "test/fixtures",
    `${name}.${response.headers.get("content-type")?.includes("event-stream") ? "sse" : "json"}`,
  );
  writeFileSync(file, text);
  console.log(`${name}: HTTP ${response.status}, ${text.length} bytes → ${file}`);
}

await record("text-stream", {
  model: MODEL,
  stream: true,
  instructions: "Answer in one short sentence.",
  input: "Say hello to a mobile app developer.",
});
await record("parallel-tool-calls", {
  model: MODEL,
  stream: true,
  instructions: "You read files with the read_file tool. Request every file you need in one turn.",
  input:
    "Read src/navigation.tsx and src/data/models.ts. Call read_file for both now, in parallel.",
  tools: [readFileTool],
  parallel_tool_calls: true,
  tool_choice: "required",
});
await record("unauthorized", { model: MODEL, stream: true, input: "hi" }, "invalid-test-key");
