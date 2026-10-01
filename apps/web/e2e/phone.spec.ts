// TODO 5.4.1: Open on phone shows the session's QR and records the opening.
import { expect, test, type BrowserContext } from "@playwright/test";
import pg from "pg";
import { auth, createDb, createPool, schema } from "@buildly/db";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

test.setTimeout(150_000);

/** A user of its own: the Free plan allows one concurrent build, and other specs build too. */
async function newUserSession(email: string) {
  const pool = createPool(E2E_DATABASE_URL, 1);
  try {
    const db = createDb(pool);
    const [user] = await db.insert(schema.users).values({ email }).returning();
    return await auth.createSession(db, user!.id, new Date());
  } finally {
    await pool.end();
  }
}

async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "buildly_session", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}

test("opening the modal records preview.phone_opened and shows the Expo Go QR once built", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`phone-${Date.now()}@example.com`));
  const created = await page.request.post("/api/projects", { data: { name: "Phone e2e" } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/app/${id}`);

  // Before any build: the modal explains, no QR, nothing queued for the worker.
  await page.getByRole("button", { name: "Open on phone" }).click();
  const dialog = page.getByRole("dialog", { name: "Open on your phone" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("expo-go-pending")).toContainText("Build your app once");
  await expect(dialog.getByRole("link", { name: "Expo Go for iOS" })).toHaveAttribute(
    "href",
    /apps\.apple\.com/,
  );
  await expect(dialog.getByRole("link", { name: "Expo Go for Android" })).toHaveAttribute(
    "href",
    /play\.google\.com/,
  );
  await expect(dialog).toContainText("Your phone needs internet access.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("status-phone")).toHaveAttribute("data-value", "QR opened");

  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const count = async () =>
      (
        await client.query<{ n: number }>(
          "select count(*)::int as n from analytics_events where project_id = $1 and name = 'preview.phone_opened'",
          [id],
        )
      ).rows[0]!.n;
    await expect.poll(count, { timeout: 30_000 }).toBe(1);

    // After a build the worker's session exists; opening again shows its QR and URL.
    await page.getByLabel("Message").fill("A welcome screen");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByTestId("outcome").last()).toHaveText("Build succeeded", {
      timeout: 90_000,
    });
    await page.getByRole("button", { name: "Open on phone" }).click();
    await expect(page.getByTestId("expo-go-qr")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("expo-go-url")).toContainText("snack-channel=e2e-channel");
    await expect.poll(count, { timeout: 30_000 }).toBe(2);
    const jobs = await client.query(
      "select count(*)::int as n from jobs where type = 'preview' and payload->>'projectId' = $1",
      [id],
    );
    expect((jobs.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  } finally {
    await client.end();
  }
});
