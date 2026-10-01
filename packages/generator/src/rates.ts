// OpenAI Standard-tier rates, USD per 1M tokens, copied from
// https://developers.openai.com/api/docs/pricing on 2026-09-30 (SPIKES.md S3).
// Short-context rates only: long-context pricing starts at 272K input tokens and the
// context builder caps a turn at 80K (ARCHITECTURE.md §5). Recheck before relying on
// these for billing; costFor() arrives with TODO 4.1.2.

export interface ModelRates {
  /** Uncached input tokens. */
  input: number;
  /** Input tokens served from the prompt cache. */
  cachedInput: number;
  /**
   * Input tokens written to the prompt cache. Each input token is billed as exactly one
   * of input, cached input, or cache write; a write is not an extra fee. Undefined when
   * the model has no cache-write price (billed as plain input).
   */
  cacheWrite?: number;
  output: number;
}

export const RATES_SOURCE = {
  url: "https://developers.openai.com/api/docs/pricing",
  retrievedOn: "2026-09-30",
  tier: "Standard, short context",
} as const;

export const RATES = {
  // Flagship candidate for plans and initial builds (DECISIONS.md P3).
  "gpt-6.1-sol": { input: 2.0, cachedInput: 0.1, cacheWrite: 2.5, output: 10.0 },
  // Coding candidate; listed under "Specialized models", no cache-write price.
  "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14.0 },
  // Small candidate for edits and repairs.
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, cacheWrite: 0.125, output: 0.5 },
} as const satisfies Record<string, ModelRates>;

export type RatedModel = keyof typeof RATES;

export interface TokenUsage {
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export function isRatedModel(model: string): model is RatedModel {
  return Object.hasOwn(RATES, model);
}

/**
 * USD cost of `usage` on `model`, rounded to 6 decimals. Each input token is billed as
 * exactly one of uncached input, cached input, or cache write; a model without a
 * cache-write price bills those tokens as uncached input. Throws for a model with no rate.
 */
export function costFor(usage: TokenUsage, model: string): number {
  if (!isRatedModel(model))
    throw new Error(`No rate for model "${model}"; add it to RATES in rates.ts`);
  const rate: ModelRates = RATES[model];
  if (usage.cachedTokens + usage.cacheWriteTokens > usage.inputTokens) {
    throw new Error("Cached and cache-write tokens exceed input tokens");
  }
  const cacheWritePrice = rate.cacheWrite ?? rate.input;
  const uncached = usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens;
  const microDollars =
    uncached * rate.input +
    usage.cachedTokens * rate.cachedInput +
    usage.cacheWriteTokens * cacheWritePrice +
    usage.outputTokens * rate.output;
  return Math.round(microDollars) / 1e6;
}
