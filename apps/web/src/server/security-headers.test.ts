// TODO 7.2.2: the headers next.config.ts sends on every route.
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, playerOriginFrom, securityHeaders } from "./security-headers";

describe("security headers", () => {
  it("takes the player origin from SNACK_WEB_PLAYER_URL, placeholder and all", () => {
    expect(playerOriginFrom("https://d3tfrf3qzy19yc.cloudfront.net/v2/%%SDK_VERSION%%")).toBe(
      "https://d3tfrf3qzy19yc.cloudfront.net",
    );
    expect(playerOriginFrom(undefined)).toBeNull();
    expect(playerOriginFrom("not a url")).toBeNull();
  });

  it("the CSP frames only the player and forbids being framed", () => {
    const csp = contentSecurityPolicy("https://player.example.test");
    expect(csp).toContain("frame-src https://player.example.test;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(contentSecurityPolicy(null)).toContain("frame-src 'none'");
  });

  it("includes HSTS, nosniff, and DENY framing", () => {
    const headers = Object.fromEntries(
      securityHeaders(null).map(({ key, value }) => [key.toLowerCase(), value]),
    );
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
