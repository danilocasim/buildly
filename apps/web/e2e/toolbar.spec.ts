// TODO 5.7.1: the toolbar's inline rename persists; Export code calls the export API (6.3).
import { expect, test } from "@playwright/test";
import { newUserSession, signIn } from "./helpers";

test("renaming inline persists after reload and Export code calls the export endpoint", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`toolbar-${Date.now()}@example.com`));
  const created = await page.request.post("/api/projects", { data: { name: "Toolbar e2e" } });
  const { id } = (await created.json()) as { id: string };
  await page.goto(`/app/${id}`);

  const name = page.getByLabel("Project name");
  await expect(name).toHaveValue("Toolbar e2e");
  await name.fill("Renamed app");
  await name.blur();
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get(`/api/projects/${id}`)).json()) as {
            project: { name: string };
          }
        ).project.name,
    )
    .toBe("Renamed app");
  await page.reload();
  await expect(page.getByLabel("Project name")).toHaveValue("Renamed app");
  await expect(page.getByText("Expo + TypeScript")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");

  const exportRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith(`/api/projects/${id}/export`),
  );
  await page.getByRole("button", { name: "Export code" }).click();
  await exportRequest;
});
