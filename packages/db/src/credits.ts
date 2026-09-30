// Top-up build credits: a ledger per user (brief §13, D21). Grants and top-ups add,
// each build paid by credit subtracts one, and the balance is the sum. Credits never
// expire. Purchases arrive with Stripe after the beta (D11); until then admins grant.
import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "./queries";
import { buildCredits, users } from "./schema";

export async function balance(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${buildCredits.delta}), 0)::int` })
    .from(buildCredits)
    .where(eq(buildCredits.userId, userId));
  return row?.total ?? 0;
}

/** Adds credits: a top-up purchase or an admin grant (e.g. the beta bump, TODO 9.2.1). */
export async function grant(
  db: Executor,
  input: { userId: string; amount: number; reason: "topup" | "grant"; note?: string },
): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0)
    throw new Error("Grant a positive whole number of credits");
  await db
    .insert(buildCredits)
    .values({ userId: input.userId, delta: input.amount, reason: input.reason, note: input.note });
}

/**
 * Spends one credit on a build. Locks the user's row so concurrent builds cannot spend
 * the same last credit; returns false (spending nothing) when the balance is zero.
 * Call inside the transaction that starts the build.
 */
export async function consumeForBuild(
  tx: Executor,
  userId: string,
  generationId: string,
): Promise<boolean> {
  await tx.execute(sql`select 1 from ${users} where ${users.id} = ${userId} for update`);
  if ((await balance(tx, userId)) <= 0) return false;
  await tx.insert(buildCredits).values({ userId, delta: -1, reason: "build", generationId });
  return true;
}

/** Whether this generation was paid by a credit. */
export async function paidByCredit(db: Executor, generationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: buildCredits.id })
    .from(buildCredits)
    .where(and(eq(buildCredits.generationId, generationId), eq(buildCredits.reason, "build")));
  return Boolean(row);
}
