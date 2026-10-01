// The model provider behind one small interface (brief §9, D16): the generation loop only
// sees normalized events, so another provider can be added later. The OpenAI
// implementation uses the official SDK's Responses API with streaming and strict tools.
import OpenAI from "openai";

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments; sent with `strict: true`. */
  parameters: Record<string, unknown>;
}

export type InputItem =
  | { role: "user" | "assistant" | "developer"; content: string }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | { type: "function_call_output"; callId: string; output: string };

export interface ProviderRequest {
  model: string;
  instructions: string;
  input: InputItem[];
  tools?: ToolDefinition[];
  /** Keys the provider's prompt cache so the stable prefix is reused across turns. */
  promptCacheKey?: string;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens: number;
  /** Input tokens served from the prompt cache. */
  cachedTokens: number;
  /** Input tokens written to the prompt cache (billed at the cache-write rate). */
  cacheWriteTokens: number;
  outputTokens: number;
}

export type ProviderEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; callId: string; name: string; arguments: string }
  | { type: "done"; responseId: string; model: string; usage: Usage };

export interface Provider {
  /** Streams one model turn. Throws ProviderError on failure. */
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}

export type ProviderErrorKind =
  "auth" | "rate_limit" | "server" | "bad_request" | "network" | "aborted" | "incomplete";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  cachedTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
});

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/** "1s", "6m0s", "250ms", "1.5s" (OpenAI rate-limit reset headers) → milliseconds. */
export function parseResetDuration(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    total +=
      Number(amount) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit as "ms" | "s" | "m" | "h"];
  }
  return matched ? total : undefined;
}

/**
 * Delay before retry `attempt` (1-based): full jitter on an exponential backoff, but never
 * shorter than what the server asked for (retry-after-ms, retry-after, or the rate-limit
 * reset headers).
 */
export function retryDelayMs(
  attempt: number,
  headers: Headers | undefined,
  random: () => number = Math.random,
): number {
  const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jittered = Math.round(random() * backoff);
  const requested = [
    Number(headers?.get("retry-after-ms") ?? NaN),
    Number(headers?.get("retry-after") ?? NaN) * 1000,
    parseResetDuration(headers?.get("x-ratelimit-reset-requests")),
    parseResetDuration(headers?.get("x-ratelimit-reset-tokens")),
  ].filter((ms): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms >= 0);
  return Math.min(MAX_DELAY_MS, Math.max(jittered, ...requested));
}

function classify(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.APIUserAbortError)
    return new ProviderError("Request aborted", "aborted", false);
  if (error instanceof OpenAI.APIConnectionError)
    return new ProviderError(error.message, "network", true);
  if (error instanceof OpenAI.APIError) {
    const raw: unknown = error.status;
    const status = typeof raw === "number" ? raw : undefined;
    if (status === 401 || status === 403)
      return new ProviderError(error.message, "auth", false, status);
    if (status === 429) return new ProviderError(error.message, "rate_limit", true, status);
    if (status !== undefined && status >= 500)
      return new ProviderError(error.message, "server", true, status);
    return new ProviderError(error.message, "bad_request", false, status);
  }
  return new ProviderError(error instanceof Error ? error.message : String(error), "network", true);
}

export interface OpenAIProviderOptions {
  apiKey: string;
  /** For a proxy or a test server (OPENAI_BASE_URL). */
  baseURL?: string;
  maxRetries?: number;
  /** Injectable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  fetch?: typeof fetch;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ProviderError("Request aborted", "aborted", false));
      },
      { once: true },
    );
  });

type ResponseStream = AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;

export function createOpenAIProvider(options: OpenAIProviderOptions): Provider {
  // Retries are ours (explicit, testable, honoring reset headers), so the SDK's are off.
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: 0,
    fetch: options.fetch,
  });
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const sleep = options.sleep ?? defaultSleep;

  async function open(request: ProviderRequest): Promise<ResponseStream> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.responses.create(
          {
            model: request.model,
            instructions: request.instructions,
            input: request.input.map(toOpenAIInput),
            tools: request.tools?.map((tool) => ({
              type: "function" as const,
              strict: true,
              ...tool,
            })),
            parallel_tool_calls: request.tools ? true : undefined,
            prompt_cache_key: request.promptCacheKey,
            store: false,
            stream: true,
          },
          { signal: request.signal },
        );
      } catch (error) {
        const failure = classify(error);
        if (!failure.retryable || attempt >= maxRetries) throw failure;
        const headers =
          error instanceof OpenAI.APIError ? (error.headers as Headers | undefined) : undefined;
        await sleep(retryDelayMs(attempt + 1, headers, options.random), request.signal);
      }
    }
  }

  return {
    async *stream(request) {
      const events = await open(request);
      try {
        for await (const event of events) {
          if (event.type === "response.output_text.delta") {
            yield { type: "text_delta", delta: event.delta };
          } else if (
            event.type === "response.output_item.done" &&
            event.item.type === "function_call"
          ) {
            yield {
              type: "tool_call",
              callId: event.item.call_id,
              name: event.item.name,
              arguments: event.item.arguments,
            };
          } else if (event.type === "response.completed") {
            const usage = event.response.usage;
            const details = usage?.input_tokens_details as
              { cached_tokens?: number; cache_write_tokens?: number } | undefined;
            yield {
              type: "done",
              responseId: event.response.id,
              model: event.response.model,
              usage: {
                inputTokens: usage?.input_tokens ?? 0,
                cachedTokens: details?.cached_tokens ?? 0,
                cacheWriteTokens: details?.cache_write_tokens ?? 0,
                outputTokens: usage?.output_tokens ?? 0,
              },
            };
          } else if (event.type === "response.failed" || event.type === "response.incomplete") {
            const reason =
              event.response.error?.message ??
              event.response.incomplete_details?.reason ??
              event.type;
            throw new ProviderError(
              `Model response ${event.type.split(".")[1]}: ${reason}`,
              "incomplete",
              false,
            );
          } else if (event.type === "error") {
            throw new ProviderError(event.message, "server", false);
          }
        }
      } catch (error) {
        throw classify(error);
      }
    },
  };
}

function toOpenAIInput(item: InputItem): OpenAI.Responses.ResponseInputItem {
  if ("role" in item) return { role: item.role, content: item.content };
  if (item.type === "function_call") {
    return {
      type: "function_call",
      call_id: item.callId,
      name: item.name,
      arguments: item.arguments,
    };
  }
  return { type: "function_call_output", call_id: item.callId, output: item.output };
}
