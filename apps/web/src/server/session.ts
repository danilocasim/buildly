// "Session middleware": resolves the signed-in user from the session cookie. Route
// handlers call requireUser(); pages call it through currentUser().
import { auth } from "@buildly/db";
import type { Deps } from "./deps";
import { errorJson, readCookie, SESSION_COOKIE } from "./http";

export type SessionUser = auth.User;

export async function userFromRequest(
  request: Request,
  deps: Deps,
): Promise<SessionUser | undefined> {
  return auth.getSessionUser(deps.db, readCookie(request, SESSION_COOKIE), deps.now());
}

/** The signed-in user, or a 401 response to return as is. */
export async function requireUser(request: Request, deps: Deps): Promise<SessionUser | Response> {
  return (
    (await userFromRequest(request, deps)) ?? errorJson(401, "unauthorized", "Sign in to continue.")
  );
}
