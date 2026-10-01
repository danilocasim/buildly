// "Session middleware": resolves the signed-in user from the session cookie. Route
// handlers call requireUser(); pages call it through currentUser().
import { auth } from "@buildly/db";
import type { Deps } from "./deps";
import { errorJson, readCookie, SESSION_COOKIE } from "./http";
import { apiRateLimiter } from "./rate-limit";

export type SessionUser = auth.User;

export async function userFromRequest(
  request: Request,
  deps: Deps,
): Promise<SessionUser | undefined> {
  return auth.getSessionUser(deps.db, readCookie(request, SESSION_COOKIE), deps.now());
}

/**
 * The signed-in user, or a response to return as is: 401 without a valid session, 429 when
 * the session is over its per-minute API limit (TODO 7.2.3).
 */
export async function requireUser(request: Request, deps: Deps): Promise<SessionUser | Response> {
  const token = readCookie(request, SESSION_COOKIE);
  const user = await auth.getSessionUser(deps.db, token, deps.now());
  if (!user || !token) return errorJson(401, "unauthorized", "Sign in to continue.");
  const allowed = (deps.rateLimiter ?? apiRateLimiter).hit(token, deps.now().getTime());
  if (!allowed.ok) {
    const response = errorJson(429, "rate_limited", "Too many requests. Slow down for a moment.", {
      retryAfterSeconds: allowed.retryAfterSeconds,
    });
    response.headers.set("retry-after", String(allowed.retryAfterSeconds));
    return response;
  }
  return user;
}
