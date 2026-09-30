import { auth } from "@buildly/db";
import { z } from "zod";
import type { Deps } from "../deps";
import { errorJson, json, readJson, sessionCookie } from "../http";

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

function invalidLink(): Response {
  return new Response(
    "This sign-in link is invalid, already used, or expired. Request a new one.",
    {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    },
  );
}

/** GET /api/auth/callback?token= — consumes the link once, creates the user on first sign-in, sets the session cookie. */
export async function consumeMagicLink(request: Request, deps: Deps): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return invalidLink();
  const now = deps.now();
  const email = await auth.consumeMagicLink(deps.db, token, now);
  if (!email) return invalidLink();
  const user = await auth.findOrCreateUser(deps.db, email, now);
  const session = await auth.createSession(deps.db, user.id, now);
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL("/", deps.appUrl).toString(),
      "set-cookie": sessionCookie(session, auth.SESSION_TTL_MS / 1000),
    },
  });
}
