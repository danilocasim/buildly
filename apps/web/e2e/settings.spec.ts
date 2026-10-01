// TODO 6.4.1: Settings. The name persists, usage matches the API, sign out clears the session.
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "./env";
import { newUserSession, signIn } from "./helpers";

test("name change persists, usage matches /api/me, and Sign out ends the session", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`settings-${Date.now()}@example.com`));
  const { email } = (await (await page.request.get("/api/me")).json()) as { email: string };
  // Three builds this month, recorded directly (what usage.countBuildsThisMonth counts).
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      "insert into usage_events (user_id, type, occurred_at) select id, 'build', now() - interval '1 hour' from users where email = $1 union all select id, 'build', now() - interval '2 hour' from users where email = $1 union all select id, 'build', now() - interval '3 hour' from users where email = $1",
      [email],
    );
  } finally {
    await client.end();
  }

  await page.goto("/settings");
  const me = (await (await page.request.get("/api/me")).json()) as {
    usage: { buildsThisMonth: number; buildsPerMonth: number };
  };
  expect(me.usage.buildsThisMonth).toBe(3);
  await expect(page.getByTestId("usage-line")).toContainText(
    `${me.usage.buildsThisMonth} of ${me.usage.buildsPerMonth} builds used this month`,
  );
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

  const name = page.getByLabel("Display name");
  await name.fill("Sam Settings");
  await name.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Sam Settings");
  await expect(page.getByTestId("sidebar")).toContainText("Sam Settings");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in$/);
});
