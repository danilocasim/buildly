// TODO 5.1.1: the app shell. Sidebar on desktop, drawer under 1024 px, no serious axe violations.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { E2E_BASE_URL, E2E_STATE } from "./env";

const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as { memberCookie: string };

async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: "buildly_session",
      value: state.memberCookie,
      url: E2E_BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("signed-out visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Buildly" })).toBeVisible();
});

test("at 1280 px the sidebar is visible with Home, Starters, Settings and the plan card", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toBeVisible();
  const nav = sidebar.getByRole("navigation", { name: "Main" });
  for (const name of ["Home", "Starters", "Settings"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
  await expect(sidebar.getByText("Free plan")).toBeVisible();
  await expect(sidebar.getByText("0/15 builds")).toBeVisible();
  await expect(sidebar.getByTestId("sidebar-email")).toHaveText("member@example.com");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();

  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
});

test("at 768 px the sidebar is hidden and the drawer opens from the menu button", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await expect(page.getByTestId("sidebar")).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Navigating from the drawer closes it.
  await drawer.getByRole("link", { name: "Starters" }).click();
  await expect(page).toHaveURL(/\/starters$/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
});

for (const [name, width, open] of [
  ["desktop", 1280, false],
  ["drawer", 768, true],
] as const) {
  test(`axe reports no serious or critical violations (${name})`, async ({ page, context }) => {
    await signIn(context);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (open) await page.getByRole("button", { name: "Open menu" }).click();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });
}

test("axe reports no serious or critical violations on sign-in", async ({ page }) => {
  await page.goto("/sign-in");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
});
