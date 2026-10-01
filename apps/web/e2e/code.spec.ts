// TODO 5.5.1: the read-only code tab lists every project file of the snapshot, shows a
// file's contents on click, and has no editable inputs.
import { expect, test, type BrowserContext } from "@playwright/test";
import { auth, createDb, createPool, schema } from "@buildly/db";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

test.setTimeout(150_000);

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

test("the code tab shows the snapshot's files read-only", async ({ page, context }) => {
  await signIn(context, await newUserSession(`code-${Date.now()}@example.com`));
  const created = await page.request.post("/api/projects", { data: { name: "Code e2e" } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/app/${id}`);
  await page.getByLabel("Message").fill("A welcome screen");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("outcome").last()).toHaveText("Build succeeded", {
    timeout: 90_000,
  });

  // Deep link to the tab; the tree lists exactly the snapshot's project files.
  await page.goto(`/app/${id}?tab=code`);
  await expect(page.getByRole("tab", { name: "code" })).toHaveAttribute("aria-selected", "true");
  const files = (await (await page.request.get(`/api/projects/${id}/files`)).json()) as {
    project: Record<string, string>;
    foundation: Record<string, string>;
  };
  const expected = Object.keys(files.project).sort();
  expect(expected.length).toBeGreaterThan(0);
  const tree = page.getByTestId("file-project");
  await expect(tree).toHaveCount(expected.length);
  expect(
    (await tree.evaluateAll((els) => els.map((e) => e.getAttribute("data-path")))).sort(),
  ).toEqual(expected);

  // Clicking a file shows its contents.
  const path = "src/screens/HomeScreen.tsx";
  await page.locator(`[data-testid="file-project"][data-path="${path}"]`).click();
  await expect(page.getByTestId("code-path")).toHaveText(path);
  const shown = await page.getByTestId("code-source").innerText();
  const stripped = shown.replace(/^\s*\d+\s?/gm, "");
  for (const line of files.project[path]!.split("\n").filter((l) => l.trim())) {
    expect(stripped).toContain(line.trim());
  }

  // The foundation group is collapsed, read-only, and expands to its files.
  await expect(page.getByTestId("file-foundation")).toHaveCount(0);
  await page.getByRole("button", { name: /Foundation \(read-only\)/ }).click();
  await expect(page.getByTestId("file-foundation")).toHaveCount(
    Object.keys(files.foundation).length,
  );
  await page.locator('[data-testid="file-foundation"][data-path="App.tsx"]').click();
  await expect(page.getByTestId("code-path")).toHaveText("App.tsx");
  await expect(page.getByTestId("code-view")).toContainText("Read-only · foundation");

  // Nothing editable anywhere in the code view.
  await expect(
    page.getByTestId("code-view").locator("input, textarea, select, [contenteditable]"),
  ).toHaveCount(0);
});
