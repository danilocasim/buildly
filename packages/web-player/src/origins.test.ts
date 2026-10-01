import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedOrigin, matchesOrigin, parseAllowedOrigins } from "./origins";

describe("web player origin allowlist", () => {
  it("parses the comma-separated build variable", () => {
    expect(parseAllowedOrigins(" https://app.buildly.dev, https://*.trycloudflare.com ,")).toEqual([
      "https://app.buildly.dev",
      "https://*.trycloudflare.com",
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it("matches an exact origin only exactly", () => {
    const pattern = "https://app.buildly.dev";
    expect(matchesOrigin("https://app.buildly.dev", pattern)).toBe(true);
    expect(matchesOrigin("http://app.buildly.dev", pattern)).toBe(false);
    expect(matchesOrigin("https://app.buildly.dev.evil.com", pattern)).toBe(false);
    expect(matchesOrigin("https://evil.com/?u=https://app.buildly.dev", pattern)).toBe(false);
  });

  it("matches any subdomain for a wildcard, never the apex or a lookalike", () => {
    const pattern = "https://*.trycloudflare.com";
    expect(matchesOrigin("https://quiet-sun-1234.trycloudflare.com", pattern)).toBe(true);
    expect(matchesOrigin("https://a.b.trycloudflare.com", pattern)).toBe(true);
    expect(matchesOrigin("https://trycloudflare.com", pattern)).toBe(false);
    expect(matchesOrigin("https://xtrycloudflare.com", pattern)).toBe(false);
    expect(matchesOrigin("https://x.trycloudflare.com.evil.com", pattern)).toBe(false);
    expect(matchesOrigin("http://x.trycloudflare.com", pattern)).toBe(false);
  });

  it("always allows http://localhost:* for development, nothing else by default", () => {
    expect(isAllowedOrigin("http://localhost:3200", [])).toBe(true);
    expect(isAllowedOrigin("https://localhost:3200", [])).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:3200", [])).toBe(false);
    expect(isAllowedOrigin("https://snack.expo.dev", [])).toBe(false);
    expect(isAllowedOrigin("https://x.trycloudflare.com", ["https://*.trycloudflare.com"])).toBe(
      true,
    );
  });

  it("the patch puts the same matcher into the runtime", () => {
    const patch = readFileSync(
      new URL("../patches/allowed-origins.patch", import.meta.url),
      "utf8",
    );
    const added = patch
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.slice(1))
      .join("\n");
    const source = readFileSync(new URL("./origins.ts", import.meta.url), "utf8");
    const matcher = (text: string) =>
      /function matchesOrigin[\s\S]*?\n\}/.exec(text)![0].replace(/'/g, '"');
    expect(matcher(added)).toBe(matcher(source));
    expect(added).toContain("process.env.EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS");
    expect(added).toContain("origin.startsWith('http://localhost:')");
  });
});
