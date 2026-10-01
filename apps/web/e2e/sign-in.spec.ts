// TODO 5.1.2: the magic-link sign-in flow end to end with the console email adapter.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL, E2E_SERVER_LOG } from "./env";

async function invite(email: string) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("insert into invites (email) values ($1) on conflict do nothing", [email]);
  } finally {
    await client.end();
  }
}

/** The magic link the console adapter printed for `email` (polls the server log). */
async function magicLinkFor(email: string): Promise<string> {
  const pattern = new RegExp(
    `\\[email\\] to=${email.replace(/[.+]/g, "\\$&")}[^]*?(http://localhost:\\d+/api/auth/callback\\?token=[A-Za-z0-9_-]+)`,
  );
  for (let i = 0; i < 50; i++) {
    const match = pattern.exec(readFileSync(E2E_SERVER_LOG, "utf8"));
    if (match) return match[1]!;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No magic link for ${email} in ${E2E_SERVER_LOG}`);
}

test("an invited email signs in from the emailed link and lands on Home", async ({ page }) => {
  const email = `invited-${Date.now()}@example.com`;
  await invite(email);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const link = await magicLinkFor(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "What mobile app will you build?" }),
  ).toBeVisible();
  await expect(page.getByTestId("sidebar-email")).toHaveText(email);

  // The link works once; a second use lands on the error state.
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/sign-in\?error=invalid_link$/);
  await expect(page.getByTestId("sign-in-error")).toHaveText(
    "This sign-in link is invalid, already used, or expired. Request a new one.",
  );
});

test("a non-invited email sees the invite-only message and keeps the form", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByTestId("sign-in-error")).toHaveText("Buildly is invite-only right now.");
  await expect(page.getByLabel("Email")).toHaveValue("stranger@example.com");
});

test("a bogus callback token redirects to the sign-in error state", async ({ page }) => {
  await page.goto("/api/auth/callback?token=bogus");
  await expect(page).toHaveURL(/\/sign-in\?error=invalid_link$/);
  await expect(page.getByTestId("sign-in-error")).toContainText(
    "invalid, already used, or expired",
  );
});
