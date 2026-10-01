import { readFileSync } from "node:fs";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createOpenAIProvider,
  parseResetDuration,
  ProviderError,
  retryDelayMs,
  type ProviderEvent,
  type ProviderRequest,
} from "./provider";

// Real Responses API streams recorded by scripts/record-fixtures.ts (gpt-6-luna).
const fixture = (name: string) =>
  readFileSync(new URL(`../test/fixtures/${name}`, import.meta.url), "utf8");
const sse = (body: string) =>
  new HttpResponse(body, { headers: { "content-type": "text/event-stream" } });

/** The `data:` payloads of one event type in a recorded stream. */
function recorded(name: string, type: string): Record<string, unknown>[] {
  return fixture(name)
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)
    .filter((data) => data.type === type);
}

const URL_RESPONSES = "https://api.openai.com/v1/responses";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const request: ProviderRequest = {
  model: "gpt-6-luna",
  instructions: "test",
  input: [{ role: "user", content: "hi" }],
};

async function collect(events: AsyncIterable<ProviderEvent>) {
  const out: ProviderEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

function provider(sleeps: number[] = []) {
  return createOpenAIProvider({
    apiKey: "test-key",
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
  });
}

describe("OpenAI provider (recorded fixtures)", () => {
  it("streams text deltas in order, then usage including cached tokens", async () => {
    server.use(http.post(URL_RESPONSES, () => sse(fixture("text-stream.sse"))));
    const events = await collect(provider().stream(request));

    const deltas = events
      .filter((e) => e.type === "text_delta")
      .map((e) => (e as { delta: string }).delta);
    expect(deltas).toEqual(
      recorded("text-stream.sse", "response.output_text.delta").map((d) => d.delta),
    );
    expect(deltas.length).toBeGreaterThan(1);

    const done = events.at(-1);
    const usage = (
      recorded("text-stream.sse", "response.completed")[0]!.response as {
        usage: Record<string, unknown>;
      }
    ).usage;
    expect(done).toMatchObject({
      type: "done",
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedTokens: (usage.input_tokens_details as { cached_tokens: number }).cached_tokens,
      },
    });
  });

  it("parses two parallel tool calls", async () => {
    server.use(http.post(URL_RESPONSES, () => sse(fixture("parallel-tool-calls.sse"))));
    const calls = (await collect(provider().stream(request))).filter((e) => e.type === "tool_call");
    expect(calls).toEqual([
      expect.objectContaining({
        type: "tool_call",
        name: "read_file",
        arguments: '{"path":"src/navigation.tsx"}',
      }),
      expect.objectContaining({
        type: "tool_call",
        name: "read_file",
        arguments: '{"path":"src/data/models.ts"}',
      }),
    ]);
    expect(new Set(calls.map((c) => (c as { callId: string }).callId)).size).toBe(2);
  });

  it("retries a 429 and a 500, honoring the reset header, then succeeds", async () => {
    let calls = 0;
    server.use(
      http.post(URL_RESPONSES, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            {
              error: {
                message: "Rate limit reached",
                type: "requests",
                code: "rate_limit_exceeded",
              },
            },
            { status: 429, headers: { "x-ratelimit-reset-requests": "2s" } },
          );
        }
        if (calls === 2)
          return HttpResponse.json(
            { error: { message: "upstream error", type: "server_error" } },
            { status: 500 },
          );
        return sse(fixture("text-stream.sse"));
      }),
    );
    const sleeps: number[] = [];
    const events = await collect(provider(sleeps).stream(request));
    expect(calls).toBe(3);
    expect(sleeps).toEqual([2000, 500]); // header wins over jitter; then jittered backoff (0.5 × 1000)
    expect(events.at(-1)?.type).toBe("done");
  });

  it("surfaces a 401 as a non-retryable auth error without retrying", async () => {
    let calls = 0;
    server.use(
      http.post(URL_RESPONSES, () => {
        calls += 1;
        return new HttpResponse(fixture("unauthorized.json"), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const failure = await collect(provider().stream(request)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: "auth", retryable: false, status: 401 });
    expect(calls).toBe(1);
  });

  it("gives up after 3 retries", async () => {
    let calls = 0;
    server.use(
      http.post(URL_RESPONSES, () => {
        calls += 1;
        return HttpResponse.json({ error: { message: "overloaded" } }, { status: 503 });
      }),
    );
    const sleeps: number[] = [];
    await expect(collect(provider(sleeps).stream(request))).rejects.toMatchObject({
      kind: "server",
      retryable: true,
    });
    expect(calls).toBe(4);
    expect(sleeps).toEqual([250, 500, 1000]);
  });

  it("sends strict tools, the prompt cache key, store: false, and tool outputs", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(URL_RESPONSES, async ({ request: req }) => {
        body = (await req.json()) as Record<string, unknown>;
        return sse(fixture("text-stream.sse"));
      }),
    );
    await collect(
      provider().stream({
        ...request,
        promptCacheKey: "project-1",
        tools: [
          {
            name: "read_file",
            description: "Read",
            parameters: { type: "object", properties: {}, additionalProperties: false },
          },
        ],
        input: [
          { role: "user", content: "go" },
          { type: "function_call", callId: "c1", name: "read_file", arguments: "{}" },
          { type: "function_call_output", callId: "c1", output: "contents" },
        ],
      }),
    );
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      stream: true,
      store: false,
      prompt_cache_key: "project-1",
      parallel_tool_calls: true,
      tools: [{ type: "function", name: "read_file", strict: true }],
      input: [
        { role: "user", content: "go" },
        { type: "function_call", call_id: "c1", name: "read_file", arguments: "{}" },
        { type: "function_call_output", call_id: "c1", output: "contents" },
      ],
    });
  });
});

describe("retry timing", () => {
  it("parses reset durations", () => {
    expect(parseResetDuration("2s")).toBe(2000);
    expect(parseResetDuration("6m0s")).toBe(360_000);
    expect(parseResetDuration("1.5s")).toBe(1500);
    expect(parseResetDuration("120ms")).toBe(120);
    expect(parseResetDuration(undefined)).toBeUndefined();
  });

  it("uses full jitter on exponential backoff, capped, and never undercuts the server", () => {
    expect(retryDelayMs(1, undefined, () => 1)).toBe(500);
    expect(retryDelayMs(3, undefined, () => 1)).toBe(2000);
    expect(retryDelayMs(1, undefined, () => 0)).toBe(0);
    expect(retryDelayMs(10, undefined, () => 1)).toBe(30_000);
    expect(retryDelayMs(1, new Headers({ "retry-after": "3" }), () => 0)).toBe(3000);
    expect(retryDelayMs(1, new Headers({ "retry-after-ms": "750" }), () => 0)).toBe(750);
    expect(retryDelayMs(1, new Headers({ "x-ratelimit-reset-tokens": "45s" }), () => 0)).toBe(
      30_000,
    );
  });
});
