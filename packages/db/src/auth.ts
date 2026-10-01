// Magic links, sessions, users, and invites. Tokens are random and only their SHA-256
// hashes are stored, so a database leak does not yield usable links or sessions.
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "./queries";
import { invites, magicLinks, sessions, users } from "./schema";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type User = typeof users.$inferSelect;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Existing users can always sign in; everyone else needs an invite. */
export async function mayRequestLink(db: Executor, email: string): Promise<boolean> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (user) return true;
  const [invite] = await db
    .select({ email: invites.email })
    .from(invites)
    .where(eq(invites.email, email));
  return Boolean(invite);
}

/** Stores the hash of a new token and returns the token for the email. */
export async function createMagicLink(db: Executor, email: string, now: Date): Promise<string> {
  const token = newToken();
  await db.insert(magicLinks).values({
    email,
    createdAt: now,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
  });
  return token;
}

/**
 * Marks the link used if it is unused and unexpired, atomically, and returns its email.
 * A second use, an expired link, or an unknown token returns undefined.
 */
export async function consumeMagicLink(
  db: Executor,
  token: string,
  now: Date,
): Promise<string | undefined> {
  const [row] = await db
    .update(magicLinks)
    .set({ usedAt: now })
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.usedAt),
        gt(magicLinks.expiresAt, now),
      ),
    )
    .returning({ email: magicLinks.email });
  return row?.email;
}

/** The user for the email, created on first sign-in; accepts a pending invite. */
export async function findOrCreateUser(db: Executor, email: string, now: Date): Promise<User> {
  await db.insert(users).values({ email }).onConflictDoNothing();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  await db
    .update(invites)
    .set({ acceptedAt: now })
    .where(and(eq(invites.email, email), isNull(invites.acceptedAt)));
  return user!;
}

/** Creates a session and returns the cookie token. */
export async function createSession(db: Executor, userId: string, now: Date): Promise<string> {
  const token = newToken();
  await db
    .insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });
  return token;
}

export async function getSessionUser(
  db: Executor,
  token: string | undefined,
  now: Date,
): Promise<User | undefined> {
  if (!token) return undefined;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)));
  return row?.user;
}

export async function deleteSession(db: Executor, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export const invitesQueries = {
  async list(db: Executor) {
    return db.select().from(invites).orderBy(asc(invites.createdAt));
  },
  /** Adds an invite; returns false if the email was already invited. */
  async add(db: Executor, email: string, invitedBy: string): Promise<boolean> {
    const rows = await db
      .insert(invites)
      .values({ email, invitedBy })
      .onConflictDoNothing()
      .returning({ email: invites.email });
    return rows.length === 1;
  },
};

/** Magic links requested for an email since `since` (rate limiting, TODO 7.2.3). */
export async function countMagicLinksSince(
  db: Executor,
  email: string,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(magicLinks)
    .where(and(eq(magicLinks.email, email), gt(magicLinks.createdAt, since)));
  return row?.n ?? 0;
}
