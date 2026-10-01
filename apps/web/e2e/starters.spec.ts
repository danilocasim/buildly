// TODO 6.2: starter cards with thumbnails on Home and /starters; Use starter opens a workspace
// with a preview and no build consumed.
import { expect, test, type Page } from "@playwright/test";
import { newUserSession, signIn } from "./helpers";

async function expectThreeCardsWithImages(page: Page) {
  const cards = page.getByTestId("starter-card");
  await expect(cards).toHaveCount(3);
  for (const slug of ["journal", "habit-tracker", "inventory"]) {
    const image = page.locator(`[data-testid="starter-card"][data-slug="${slug}"] img`);
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
}

test("three starter cards with images on Home's Starters tab and on /starters", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`starters-${Date.now()}@example.com`));
  await page.goto("/");
  await page.getByRole("button", { name: "Starters" }).click();
  await expectThreeCardsWithImages(page);
  const response = await page.goto("/starters");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();
  await expectThreeCardsWithImages(page);
  await expect(page.getByText("Entry detail")).toBeVisible(); // screen chips on the large cards
});

test("Use starter opens a workspace with the starter's preview and no build consumed", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`use-starter-${Date.now()}@example.com`));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/starters");
  await page
    .locator('[data-testid="starter-card"][data-slug="journal"]')
    .getByRole("button", { name: "Use starter" })
    .click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
  await expect(page.getByLabel("Project name")).toHaveValue("Journal");
  await expect(page.getByTestId("generation")).toHaveCount(0);
  await expect(page.getByTestId("preview-snapshot")).toContainText("Snapshot", { timeout: 30_000 });
  await expect(page.getByTestId("web-preview")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("screens-list")).toContainText("Entries");
  const me = (await (await page.request.get("/api/me")).json()) as {
    usage: { buildsThisMonth: number };
  };
  expect(me.usage.buildsThisMonth).toBe(0);
});
