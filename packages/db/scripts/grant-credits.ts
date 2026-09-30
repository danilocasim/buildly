// pnpm db:grant-credits <email> <amount> [note]
// Grants top-up build credits to a user, e.g. the beta bump (TODO 9.2.1) or a manual
// top-up before Stripe exists. Uses DATABASE_URL (default: the docker-compose database).
import { eq } from "drizzle-orm";
import { createDb, createPool } from "../src/client";
import { balance, grant } from "../src/credits";
import { users } from "../src/schema";

const [email, amountText, ...noteParts] = process.argv.slice(2);
const amount = Number(amountText);
if (!email || !Number.isInteger(amount) || amount <= 0) {
  console.error("usage: pnpm db:grant-credits <email> <amount> [note]");
  process.exit(2);
}
const pool = createPool(
  process.env.DATABASE_URL ?? "postgres://buildly:buildly@localhost:5433/buildly",
  1,
);
try {
  const db = createDb(pool);
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exitCode = 1;
  } else {
    await grant(db, {
      userId: user.id,
      amount,
      reason: "grant",
      note: noteParts.join(" ") || undefined,
    });
    console.log(
      `granted ${amount} credits to ${user.email}; balance now ${await balance(db, user.id)}`,
    );
  }
} finally {
  await pool.end();
}
