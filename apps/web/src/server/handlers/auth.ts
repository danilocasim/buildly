import { analytics, auth } from "@buildly/db";
import { z } from "zod";
import type { Deps } from "../deps";
import { errorJson, json, readCookie, readJson, SESSION_COOKIE, sessionCookie } from "../http";

const bodySchema = z.object({ email: z.string().trim().pipe(z.email().max(254)) });

/** POST /api/auth/magic-link — invite gate, hashed single-use token, 15-minute expiry. */
export async function requestMagicLink(request: Request, deps: Deps): Promise<Response> {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return errorJson(400, "invalid_email", "Enter a valid email address.");
  const email = auth.normalizeEmail(parsed.data.email);

  if (!(await auth.mayRequestLink(deps.db, email))) {
    // Generic on purpose: no hint about who is invited.
    return errorJson(403, "not_invited", "Buildly is invite-only right now.");
  }
  const token = await auth.createMagicLink(deps.db, email, deps.now());
  const link = new URL("/api/auth/callback", deps.appUrl);
  link.searchParams.set("token", token);
  await deps.email.send({
    to: email,
    subject: "Your Buildly sign-in link",
    text: `Sign in to Buildly:\n${link.toString()}\n\nThis link works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
  });
  return json({ ok: true });
}

/** An invalid, used, or expired link lands on the sign-in page's error state (TODO 5.1.2). */
function invalidLink(deps: Deps): Response {
  return new Response(null, {
    status: 302,
    headers: { location: new URL("/sign-in?error=invalid_link", deps.appUrl).toString() },
  });
}

/** GET /api/auth/callback?token= — consumes the link once, creates the user on first sign-in, sets the session cookie. */
export async function consumeMagicLink(request: Request, deps: Deps): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return invalidLink(deps);
  const now = deps.now();
  const email = await auth.consumeMagicLink(deps.db, token, now);
  if (!email) return invalidLink(deps);
  const user = await auth.findOrCreateUser(deps.db, email, now);
  const session = await auth.createSession(deps.db, user.id, now);
  await analytics.track(deps.db, "user.signed_in", { method: "magic_link" }, { userId: user.id });
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL("/", deps.appUrl).toString(),
      "set-cookie": sessionCookie(session, auth.SESSION_TTL_MS / 1000),
    },
  });
}

/** POST /api/auth/sign-out — deletes the session and clears the cookie (TODO 6.4.1). */
export async function signOut(request: Request, deps: Deps): Promise<Response> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await auth.deleteSession(deps.db, token);
  return new Response(null, { status: 204, headers: { "set-cookie": sessionCookie("", 0) } });
}
