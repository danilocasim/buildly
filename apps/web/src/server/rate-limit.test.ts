// TODO 7.2.3: authenticated API routes are limited per session.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ABUSE_LIMITS } from "@buildly/shared";
import { getMe } from "./handlers/me";
import { createRateLimiter } from "./rate-limit";
import { createHarness, type Harness } from "./testing";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

describe("createRateLimiter", () => {
  it("allows `limit` hits per window per key and reports the wait", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect([0, 1, 2].map((t) => limiter.hit("a", t).ok)).toEqual([true, true, true]);
    expect(limiter.hit("a", 10_000)).toEqual({ ok: false, retryAfterSeconds: 50 });
    expect(limiter.hit("b", 10_000).ok).toBe(true);
    expect(limiter.hit("a", 60_000).ok).toBe(true);
  });
});

describe("API rate limit by session", () => {
  it("the request over the per-minute limit → 429 with Retry-After; other sessions are unaffected", async () => {
    const limit = ABUSE_LIMITS.apiRequestsPerSessionPerMinute;
    const busy = await h.signIn("busy@example.com");
    const calm = await h.signIn("calm@example.com");
    const me = (cookie: string) => getMe(h.request("GET", "/api/me", { cookie }), h.deps);
    const start = h.clock.now;
    try {
      for (let i = 0; i < limit; i++) expect((await me(busy.cookie)).status).toBe(200);
      const over = await me(busy.cookie);
      expect(over.status).toBe(429);
      expect(await over.json()).toMatchObject({ code: "rate_limited" });
      expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
      expect((await me(calm.cookie)).status).toBe(200);
      h.clock.now = new Date(start.getTime() + 60_000);
      expect((await me(busy.cookie)).status).toBe(200);
    } finally {
      h.clock.now = start;
    }
  });

  it("no session is still 401, not counted", async () => {
    expect((await getMe(h.request("GET", "/api/me"), h.deps)).status).toBe(401);
  });
});
