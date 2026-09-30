import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_STATE } from "./env";

const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as {
  adminCookie: string;
  memberCookie: string;
};

async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "buildly_session", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}

test("anonymous visitors get 404", async ({ page }) => {
  const response = await page.goto("/admin/invites");
  expect(response?.status()).toBe(404);
});

test("non-admins get 404", async ({ page, context }) => {
  await signIn(context, state.memberCookie);
  const response = await page.goto("/admin/invites");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Invites" })).toHaveCount(0);
});

test("an admin adds an email and it appears in invites", async ({ page, context }) => {
  await signIn(context, state.adminCookie);
  const response = await page.goto("/admin/invites");
  expect(response?.status()).toBe(200);

  const email = `beta-${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Add invite" }).click();
  await expect(page.getByRole("status")).toHaveText(`Invited ${email}.`);
  await expect(page.getByTestId("invite-row").filter({ hasText: email })).toBeVisible();

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const rows = await client.query<{ email: string; invited_by: string | null }>(
      "select email, invited_by from invites where email = $1",
      [email],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.invited_by).not.toBeNull();
  } finally {
    await client.end();
  }
});
