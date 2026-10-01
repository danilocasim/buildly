import { describe, expect, it } from "vitest";
import { costFor, RATES } from "./rates";

// 100k input (60k cached, 10k cache writes, 30k uncached) and 8k output.
const usage = {
  inputTokens: 100_000,
  cachedTokens: 60_000,
  cacheWriteTokens: 10_000,
  outputTokens: 8_000,
};

describe("costFor", () => {
  it.each([
    // 30k×2.00 + 60k×0.10 + 10k×2.50 + 8k×10.00 = 171,000 µ$
    ["gpt-6.1-sol", 0.171],
    // no cache-write price: (30k + 10k)×1.75 + 60k×0.175 + 8k×14.00 = 192,500 µ$
    ["gpt-5.3-codex", 0.1925],
    // 30k×0.10 + 60k×0.01 + 10k×0.125 + 8k×0.50 = 8,850 µ$
    ["gpt-6-luna", 0.00885],
  ])("%s → $%f", (model, expected) => {
    expect(costFor(usage, model).toFixed(6)).toBe(expected.toFixed(6));
  });

  it("rounds to 6 decimals", () => {
    // 1,234×0.10 + 567×0.50 = 406.9 µ$ → $0.000407
    expect(
      costFor(
        { inputTokens: 1234, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 567 },
        "gpt-6-luna",
      ),
    ).toBe(0.000407);
  });

  it("matches the S3 smoke run's flagship cost for its recorded usage", () => {
    // SPIKES.md S3, gpt-6.1-sol run 1: 21,842 in, 10,352 cached, 9,814 writes, 6,746 out → $0.0964
    expect(
      costFor(
        { inputTokens: 21_842, cachedTokens: 10_352, cacheWriteTokens: 9_814, outputTokens: 6_746 },
        "gpt-6.1-sol",
      ).toFixed(4),
    ).toBe("0.0964");
  });

  it("throws for an unknown model and for impossible usage", () => {
    expect(() => costFor(usage, "gpt-unknown")).toThrow('No rate for model "gpt-unknown"');
    expect(() => costFor({ ...usage, cachedTokens: 95_000 }, "gpt-6-luna")).toThrow();
  });

  it("covers every configured candidate model", () => {
    expect(Object.keys(RATES).sort()).toEqual(["gpt-5.3-codex", "gpt-6-luna", "gpt-6.1-sol"]);
  });
});
