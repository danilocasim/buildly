// TODO 5.2.2–5.2.4: the chat panel against the real pipeline with the fake worker.
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { auth, createDb, createPool, schema } from "@buildly/db";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_STATE } from "./env";

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as { memberCookie: string };

async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "buildly_session", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}

async function openNewProject(page: Page, name: string) {
  const response = await page.request.post("/api/projects", { data: { name } });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await page.goto(`/app/${id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return id;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const step = (page: Page, key: string) => page.getByTestId(`step-${key}`).last();
const outcome = (page: Page) => page.getByTestId("outcome").last();
const snapshotId = (page: Page) =>
  page.getByTestId("preview-snapshot").getAttribute("data-snapshot-id");

test("steps turn green in order and only on server events; a failed build keeps the preview", async ({
  page,
  context,
}) => {
  await signIn(context, state.memberCookie);
  await openNewProject(page, "Chat e2e");
  await expect(page.getByTestId("preview-snapshot")).toHaveText("No preview yet");

  await send(page, "A welcome screen");
  await expect(page.getByLabel("Message")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

  // Plan ready arrives first; the type check (real tsc) is still ahead, so later steps are
  // not green yet. Then each step completes in order.
  await expect(step(page, "plan")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  expect(await step(page, "typecheck").getAttribute("data-state")).not.toBe("done");
  expect(await step(page, "bundle").getAttribute("data-state")).not.toBe("done");
  await expect(page.getByTestId("assistant-plan").last()).toContainText(
    "Plan: update the Home screen",
  );
  await expect(step(page, "edit")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await expect(step(page, "typecheck")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await expect(step(page, "bundle")).toHaveAttribute("data-state", "done", { timeout: 60_000 });
  await expect(outcome(page)).toHaveText("Build succeeded", { timeout: 60_000 });
  await expect(page.getByTestId("assistant-summary").last()).toHaveText("Updated the Home screen.");
  await expect(page.getByLabel("Message")).toBeEnabled();
  await expect(page.getByTestId("preview-snapshot")).toContainText("Snapshot");
  const before = await snapshotId(page);
  expect(before).not.toBe("");

  // A build whose type check fails three times ends failed, explains why, and leaves the
  // previous preview in place.
  await send(page, "Now break the types please");
  await expect(outcome(page)).toContainText("Build failed: the code has type errors", {
    timeout: 120_000,
  });
  // 7.3.3: the user-facing explanation, not the raw error code.
  await expect(page.getByTestId("outcome-help").last()).toHaveText(
    "Buildly tried to repair it and could not. Your last working version is unchanged. Try a smaller change, or describe it differently.",
  );
  await expect(outcome(page)).not.toContainText("(typecheck)");
  await expect(outcome(page)).toContainText("src/screens/HomeScreen.tsx");
  await expect(step(page, "typecheck")).toHaveAttribute("data-state", "failed");
  await expect(step(page, "bundle")).toHaveAttribute("data-state", "pending");
  expect(await snapshotId(page)).toBe(before);
  await expect(page.getByLabel("Message")).toBeEnabled();
});

test("Cancel mid-run ends the build as Cancelled, keeps the preview, re-enables the composer", async ({
  page,
  context,
}) => {
  await signIn(context, state.memberCookie);
  await openNewProject(page, "Cancel e2e");
  await send(page, "Take your time with this one");
  await expect(page.getByLabel("Message")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(outcome(page)).toContainText("Cancelled", { timeout: 60_000 });
  await expect(page.getByTestId("generation").last()).toHaveAttribute("data-status", "cancelled");
  await expect(page.getByTestId("preview-snapshot")).toHaveText("No preview yet");
  await expect(page.getByLabel("Message")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);
});

test("over the hourly cap: the reason and reset time show inline and the prompt is kept", async ({
  page,
  context,
}) => {
  // A separate user, so the ten builds do not affect the member's counts elsewhere.
  const pool = createPool(E2E_DATABASE_URL, 1);
  const db = createDb(pool);
  let token: string;
  try {
    const [user] = await db
      .insert(schema.users)
      .values({ email: `capped-${Date.now()}@example.com` })
      .returning();
    const now = new Date();
    await db.insert(schema.usageEvents).values(
      Array.from({ length: 10 }, (_, i) => ({
        userId: user!.id,
        type: "build" as const,
        occurredAt: new Date(now.getTime() - (i + 1) * 60_000),
      })),
    );
    token = await auth.createSession(db, user!.id, now);
  } finally {
    await pool.end();
  }
  await signIn(context, token);
  await openNewProject(page, "Capped e2e");
  await send(page, "One more build");
  const error = page.getByTestId("composer-error");
  await expect(error).toContainText(/hour/i);
  await expect(error).toContainText("Try again after");
  await expect(error.locator("time")).toHaveAttribute("datetime", /\d{4}-\d{2}-\d{2}T/);
  await expect(page.getByLabel("Message")).toHaveValue("One more build");
  await expect(page.getByLabel("Message")).toBeEnabled();
});
