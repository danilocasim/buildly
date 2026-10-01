// TODO 5.7.2: after two builds the history shows two entries; restoring the first swaps the
// code tab to its files.
import { expect, test } from "@playwright/test";
import { builtProject, newUserSession, signIn } from "./helpers";

test.setTimeout(180_000);

test("two builds give two history entries; Restore of the first refreshes the code tab", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`history-${Date.now()}@example.com`));
  await page.setViewportSize({ width: 1400, height: 900 });
  await builtProject(page, "History e2e"); // first build: "A welcome screen"
  await page.getByLabel("Message").fill("Second edit");
  await page.getByRole("button", { name: "Send" }).click();
  // Wait on the second generation itself: the first thread's outcome already says succeeded.
  await expect(page.getByTestId("generation")).toHaveCount(2);
  await expect(page.getByTestId("generation").nth(1)).toHaveAttribute("data-status", "succeeded", {
    timeout: 90_000,
  });

  await page.getByRole("button", { name: "History" }).click();
  const drawer = page.getByRole("dialog", { name: "Snapshot history" });
  const entries = drawer.getByTestId("history-entry");
  await expect(entries).toHaveCount(2, { timeout: 30_000 });
  await expect(entries.nth(0)).toHaveAttribute("data-current", "true");
  await expect(entries.nth(0)).toContainText("Second edit");
  await expect(entries.nth(1)).toContainText("A welcome screen");
  const firstId = (await entries.nth(1).getAttribute("data-snapshot-id"))!;

  await entries.nth(1).getByRole("button", { name: "Restore" }).click();
  // A new snapshot with the first one's files becomes current (restore never edits history).
  await expect(entries).toHaveCount(3, { timeout: 30_000 });
  await expect(entries.nth(0)).toHaveAttribute("data-current", "true");
  await expect(entries.nth(0)).toContainText("Restored version");
  const restoredId = (await entries.nth(0).getAttribute("data-snapshot-id"))!;
  expect(restoredId).not.toBe(firstId);
  await drawer.getByRole("button", { name: "Close" }).click();

  // The code tab shows the first build's HomeScreen.
  await page.getByRole("tab", { name: "code" }).click();
  await page
    .locator('[data-testid="file-project"][data-path="src/screens/HomeScreen.tsx"]')
    .click();
  await expect(page.getByTestId("code-source")).toContainText(
    "edited by the e2e worker: A welcome screen",
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByTestId("code-source")).not.toContainText("Second edit");
  await expect(page.getByTestId("code-view")).toContainText(`snapshot ${restoredId.slice(0, 8)}`);
});
