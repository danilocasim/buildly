// Per-session API rate limit (TODO 7.2.3): a fixed one-minute window per session token, kept
// in memory. The MVP runs one web instance (HOSTING.md), so a process-local counter is the
// whole picture; a restart only forgives the current minute.
import { ABUSE_LIMITS } from "@buildly/shared";

export interface RateLimiter {
  /** Counts one request for `key` at `nowMs`; returns the seconds to wait when over the limit. */
  hit(key: string, nowMs: number): { ok: true } | { ok: false; retryAfterSeconds: number };
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, { startMs: number; count: number }>();
  let lastSweepMs = 0;
  return {
    hit(key, nowMs) {
      // Drop finished windows now and then, so idle sessions do not accumulate.
      if (nowMs - lastSweepMs > windowMs) {
        for (const [k, w] of windows) if (nowMs - w.startMs >= windowMs) windows.delete(k);
        lastSweepMs = nowMs;
      }
      let window = windows.get(key);
      if (!window || nowMs - window.startMs >= windowMs || nowMs < window.startMs) {
        window = { startMs: nowMs, count: 0 };
        windows.set(key, window);
      }
      window.count += 1;
      if (window.count <= limit) return { ok: true };
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.startMs + windowMs - nowMs) / 1000)),
      };
    },
  };
}

/** The process-wide limiter that requireUser applies to every authenticated API request. */
export const apiRateLimiter = createRateLimiter(
  ABUSE_LIMITS.apiRequestsPerSessionPerMinute,
  60_000,
);
