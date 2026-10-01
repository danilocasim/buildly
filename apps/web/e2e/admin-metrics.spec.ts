// TODO 7.1.2: /admin/metrics is admin-only and renders the formula table.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { E2E_STATE } from "./env";
import { signIn } from "./helpers";

const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as {
  adminCookie: string;
  memberCookie: string;
};

test("anonymous and non-admin visitors get 404; an admin sees the metrics table", async ({
  page,
  context,
}) => {
  expect((await page.goto("/admin/metrics"))?.status()).toBe(404);
  await signIn(context, state.memberCookie);
  expect((await page.goto("/admin/metrics"))?.status()).toBe(404);
  await context.clearCookies();
  await signIn(context, state.adminCookie);
  expect((await page.goto("/admin/metrics"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByTestId("metric-row")).toHaveCount(9);
  await expect(page.locator('[data-metric="H1 pass rate (initial builds)"]')).toBeVisible();
});
