// A worker for the e2e server (TODO 5.2.2 "fake provider"): the real worker loop, generation
// handler, checker, and events, with a scripted model and no Snack. The prompt picks the
// script: "break the types" writes a type error the repairs never fix; "take your time"
// stalls the first turn so Cancel can be clicked. A tiny HTTP health endpoint lets
// Playwright manage its lifecycle like the web server's.
import { createServer } from "node:http";
import { typecheckFiles } from "@buildly/checker";
import { createDb, createPool } from "@buildly/db";
import { loadFoundationFiles, loadTemplateFiles } from "@buildly/foundation";
import type { Provider, ProviderEvent, ProviderRequest } from "@buildly/generator";
import { createStorage, storageConfigFrom } from "@buildly/storage";
import { createGenerationHandler } from "../../worker/src/handlers/generation";
import { createPreviewHandler, type PreviewPusher } from "../../worker/src/handlers/preview";
import { createLogger } from "../../worker/src/log";
import { startWorker } from "../../worker/src/worker";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HOME = "src/screens/HomeScreen.tsx";
const template = loadTemplateFiles();
let calls = 0;

/** The prompt that picks the script: the latest user message naming a scenario, else the latest. */
function scenarioPrompt(request: ProviderRequest): string {
  const texts = request.input.flatMap((item) =>
    "role" in item && item.role === "user" && typeof item.content === "string"
      ? [item.content]
      : [],
  );
  return (
    texts.findLast((text) => /break the types|take your time/i.test(text)) ?? texts.at(-1) ?? ""
  );
}

const provider: Provider = {
  async *stream(request): AsyncIterable<ProviderEvent> {
    const prompt = scenarioPrompt(request);
    const last = request.input.at(-1);
    const afterTool = last !== undefined && "type" in last && last.type === "function_call_output";
    const n = ++calls;
    if (!afterTool) {
      if (/take your time/i.test(prompt)) await sleep(8000);
      const broken = /break the types/i.test(prompt);
      const plan = `Plan: update the Home screen${broken ? " (with a type error)" : ""}.`;
      for (const chunk of plan.match(/.{1,8}/g) ?? []) {
        yield { type: "text_delta", delta: chunk };
        await sleep(20);
      }
      // The prompt goes into the file, so builds differ (history and restore are observable).
      const contents = `${template[HOME]!}\n// edited by the e2e worker: ${prompt.replace(/[\r\n]+/g, " ")}\n${
        broken ? 'export const broken: number = "not a number";\n' : ""
      }`;
      yield {
        type: "tool_call",
        callId: `call_${n}`,
        name: "write_file",
        arguments: JSON.stringify({ path: HOME, contents }),
      };
    } else {
      yield {
        type: "tool_call",
        callId: `call_${n}`,
        name: "finish",
        arguments: JSON.stringify({ summary: "Updated the Home screen.", screens: ["Home"] }),
      };
    }
    yield {
      type: "done",
      responseId: `resp_${n}`,
      model: request.model,
      usage: { inputTokens: 1000, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 50 },
    };
  },
};

const env = process.env as Record<string, string>;
const pool = createPool(env.DATABASE_URL!, 4);
const db = createDb(pool);
const storage = createStorage(
  storageConfigFrom({
    STORAGE_REGION: env.STORAGE_REGION!,
    STORAGE_BUCKET: env.STORAGE_BUCKET!,
    STORAGE_ACCESS_KEY: env.STORAGE_ACCESS_KEY!,
    STORAGE_SECRET_KEY: env.STORAGE_SECRET_KEY!,
    STORAGE_ENDPOINT: env.STORAGE_ENDPOINT,
  }),
);
await storage.ensureBucket();
const foundationFiles = loadFoundationFiles();
const preview: PreviewPusher = (project) =>
  Promise.resolve({ channel: project.channel ?? "e2e-channel" });
const log = createLogger({ service: "fake-worker" });

const worker = startWorker({
  db,
  log,
  pollMs: 250,
  handlers: {
    generation: createGenerationHandler({
      db,
      storage,
      provider,
      models: { plan: "gpt-6.1-sol", edit: "gpt-6-luna" },
      typecheck: (files) => typecheckFiles(foundationFiles, files),
      bundle: () => Promise.resolve({ ok: true, diagnostics: [] }),
      preview,
    }),
    preview: createPreviewHandler({ db, storage, preview }),
  },
});

const health = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("ok");
}).listen(Number(env.FAKE_WORKER_PORT ?? 3311));

const shutdown = async () => {
  health.close();
  await worker.stop();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
