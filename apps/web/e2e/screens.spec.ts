// TODO 5.6.1: the screen list comes from the build's finish output and collapses under 1024 px.
import { expect, test } from "@playwright/test";
import { builtProject, newUserSession, signIn } from "./helpers";

test.setTimeout(150_000);

test("lists the built app's screens; expanded at 1280 px, collapsed at 768 px, toggleable", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`screens-${Date.now()}@example.com`));
  await page.setViewportSize({ width: 1280, height: 900 });
  const id = await builtProject(page, "Screens e2e");

  // The fake worker's finish names "Home", which the template's navigation registers.
  await page.goto(`/app/${id}`);
  const panel = page.getByTestId("screens-panel");
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel.getByTestId("screens-list")).toContainText("Home");
  await panel.getByRole("button", { name: "Collapse screens" }).click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(panel.getByTestId("screens-list")).toHaveCount(0);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  await expect(panel).toHaveAttribute("data-open", "false");
  await panel.getByRole("button", { name: "Expand screens" }).click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel.getByTestId("screens-list")).toContainText("Home");
});
