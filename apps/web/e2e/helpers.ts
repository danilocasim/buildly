import { randomBytes } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { auth, createDb, createPool, schema } from "@buildly/db";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

/** A user of its own: the Free plan allows one concurrent build, and specs run in parallel. */
export async function newUserSession(email: string): Promise<string> {
  // Specs pick emails by Date.now(); parallel starts in the same millisecond must not collide.
  const unique = email.replace(/@/, `-${randomBytes(3).toString("hex")}@`);
  const pool = createPool(E2E_DATABASE_URL, 1);
  try {
    const db = createDb(pool);
    const [user] = await db.insert(schema.users).values({ email: unique }).returning();
    return await auth.createSession(db, user!.id, new Date());
  } finally {
    await pool.end();
  }
}

export async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "buildly_session", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}

/** Creates a project, opens its workspace, and runs one successful build with the fake worker. */
export async function builtProject(page: Page, name: string): Promise<string> {
  const created = await page.request.post("/api/projects", { data: { name } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/app/${id}`);
  await page.getByLabel("Message").fill("A welcome screen");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("outcome").last()).toHaveText("Build succeeded", {
    timeout: 90_000,
  });
  return id;
}
