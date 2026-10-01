// TODO 6.1: Home. The composer's enable rules and starter chip (6.1.1), creating from a
// prompt and landing in the workspace with the stream open (6.1.2), the recent apps grid
// with Rename and Archive and the empty state (6.1.3), and the prompt kept on an error (6.1.4).
import { expect, test } from "@playwright/test";
import { newUserSession, signIn } from "./helpers";

test.setTimeout(150_000);

test("Build app needs a prompt or a starter; the starter chip is removable; errors keep the prompt", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`home-a-${Date.now()}@example.com`));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What mobile app will you build?" }),
  ).toBeVisible();
  const build = page.getByRole("button", { name: "Build app" });
  const prompt = page.getByLabel("Describe your mobile app");
  await expect(prompt).toHaveAttribute("placeholder", "Describe your mobile app...");
  await expect(build).toBeDisabled();

  await page.getByRole("button", { name: "Choose starter" }).click();
  await page.getByRole("menuitem", { name: /Journal/ }).click();
  await expect(page.getByTestId("starter-chip")).toContainText("Journal");
  await expect(build).toBeEnabled(); // with an empty prompt
  await page.getByRole("button", { name: "Remove starter" }).click();
  await expect(page.getByTestId("starter-chip")).toHaveCount(0);
  await expect(build).toBeDisabled();

  // 6.1.4: a 500 on create shows an error and leaves the prompt untouched.
  await page.route("**/api/projects", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, contentType: "application/json", body: '{"message":"boom"}' })
      : route.continue(),
  );
  await prompt.fill("A reading tracker");
  await expect(build).toBeEnabled();
  await build.click();
  await expect(page.getByTestId("composer-error")).toContainText("boom");
  await expect(prompt).toHaveValue("A reading tracker");
  await expect(page).toHaveURL(/\/$/);
  await page.unroute("**/api/projects");
});

test("a prompt creates the project, lands in the workspace with the first step within 2 s, and fills the grid", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`home-b-${Date.now()}@example.com`));
  await page.goto("/");
  await expect(page.getByTestId("recent-empty")).toContainText("No apps yet");

  // Warm the workspace route once (dev compiles on first visit), then measure the real flow.
  const warm = await page.request.post("/api/projects", { data: { name: "Warm-up" } });
  const warmId = ((await warm.json()) as { id: string }).id;
  await page.goto(`/app/${warmId}`);
  await expect(page.getByLabel("Project name")).toHaveValue("Warm-up");
  await page.request.patch(`/api/projects/${warmId}`, { data: { archived: true } });

  await page.goto("/");
  await page.getByLabel("Describe your mobile app").fill("A welcome screen");
  await page.getByRole("button", { name: "Build app" }).click();
  await page.waitForURL(/\/app\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("step-plan")).toBeVisible({ timeout: 2_000 });
  await expect(page.getByLabel("Project name")).toHaveValue("A welcome screen");
  await expect(page.getByTestId("outcome").last()).toHaveText("Build succeeded", {
    timeout: 90_000,
  });

  // 6.1.3: the grid shows it; Rename persists; Archive removes it.
  const projectId = page.url().match(/\/app\/([0-9a-f-]{36})$/)![1]!;
  await page.goto("/");
  const card = page.locator(`[data-testid="project-card"][data-project-id="${projectId}"]`);
  await expect(card).toContainText("A welcome screen");
  await card.getByRole("button", { name: /More options/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await card.getByLabel("Project name").fill("Welcome app");
  await card.getByLabel("Project name").press("Enter");
  await page.reload();
  await expect(page.getByTestId("project-card").filter({ hasText: "Welcome app" })).toHaveCount(1);
  await page
    .getByTestId("project-card")
    .filter({ hasText: "Welcome app" })
    .getByRole("button", { name: /More options/ })
    .click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByTestId("project-card")).toHaveCount(0);
  await expect(page.getByTestId("recent-empty")).toBeVisible();
});
