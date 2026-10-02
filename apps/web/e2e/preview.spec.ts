// TODO 5.3: the preview panel. The player iframe, CSP, presets, reset, and the two status
// chips run without network; the live check (the player actually connecting through
// CloudFront and Snack) runs only with SNACK_LIVE=1.
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import pg from "pg";
import { createDb, createPool, createSnapshot, schema } from "@buildly/db";
import { loadStarterFiles } from "@buildly/starters";
import { createStorage, storageConfigFrom } from "@buildly/storage";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_ENV, E2E_STATE } from "./env";

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const PLAYER = "https://d3tfrf3qzy19yc.cloudfront.net";
const state = JSON.parse(readFileSync(E2E_STATE, "utf8")) as { adminCookie: string };

async function signIn(context: BrowserContext, token: string) {
  await context.addCookies([
    { name: "buildly_session", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
}

async function builtProject(page: Page, name: string) {
  const response = await page.request.post("/api/projects", { data: { name } });
  expect(response.status()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await page.goto(`/app/${id}`);
  await page.getByLabel("Message").fill("A welcome screen");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("outcome").last()).toHaveText("Build succeeded", {
    timeout: 90_000,
  });
  return id;
}

test("the player iframe is the session's webPreviewURL on the player origin; other frames are blocked by CSP", async ({
  page,
  context,
}) => {
  await signIn(context, state.adminCookie);
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/.test(message.text())) cspErrors.push(message.text());
  });
  await builtProject(page, "Preview e2e");
  await page.setViewportSize({ width: 1400, height: 900 });

  const frame = page.getByTestId("web-preview");
  await expect(frame).toBeVisible({ timeout: 30_000 });
  const src = (await frame.getAttribute("src"))!;
  expect(src.startsWith(`${PLAYER}/v2/54/index.html?`)).toBe(true);
  expect(src).toContain(`origin=${encodeURIComponent(E2E_BASE_URL)}`);
  await expect(page.getByText("Web preview", { exact: true })).toBeVisible();
  expect(cspErrors).toEqual([]);

  // Any other origin is refused by the workspace's frame-src.
  await page.evaluate(() => {
    const el = document.createElement("iframe");
    el.src = "https://example.com/";
    document.body.appendChild(el);
  });
  await expect
    .poll(() => cspErrors.some((e) => /example\.com/.test(e) && /frame-src/.test(e)), {
      timeout: 10_000,
    })
    .toBe(true);
});

test("device presets give the app the phone's width and fit the frame; Reset demo data records the event", async ({
  page,
  context,
}) => {
  await signIn(context, state.adminCookie);
  const response = await page.request.get("/api/projects");
  const projects = (await response.json()) as { id: string; name: string }[];
  const project = projects.find((p) => p.name === "Preview e2e")!;
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/app/${project.id}`);

  const frame = page.getByTestId("phone-frame");
  // offsetWidth is the layout width in CSS pixels, before the frame is scaled to fit, so it
  // is the width the app lays out at: the phone's width in points.
  const screenWidth = () =>
    page.getByTestId("phone-screen").evaluate((el) => (el as HTMLElement).offsetWidth);
  await expect(frame).toHaveAttribute("data-device", "iphone-16");
  expect(await screenWidth()).toBe(393);

  const picker = page.getByRole("combobox", { name: "Device" });
  for (const [key, width] of [
    ["iphone-se", 375],
    ["iphone-17-pro-max", 440],
  ] as const) {
    await picker.selectOption(key);
    await expect(frame).toHaveAttribute("data-device", key);
    expect(await screenWidth()).toBe(width);
    // The whole phone stays inside the window instead of being squeezed or cut off.
    await expect
      .poll(async () => {
        const box = (await frame.boundingBox())!;
        return box.y >= 0 && box.y + box.height <= 900;
      })
      .toBe(true);
  }

  // The choice is remembered across reloads.
  await page.reload();
  await expect(frame).toHaveAttribute("data-device", "iphone-17-pro-max");

  await expect(page.getByTestId("web-preview")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Reset demo data" }).click();
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await expect
      .poll(async () => {
        const rows = await client.query(
          "select count(*)::int as n from analytics_events where project_id = $1 and name = 'preview.reset_demo_data'",
          [project.id],
        );
        return (rows.rows[0] as { n: number }).n;
      })
      .toBe(1);
  } finally {
    await client.end();
  }
});

test("after a successful build the web and phone statuses differ", async ({ page, context }) => {
  await signIn(context, state.adminCookie);
  const projects = (await (await page.request.get("/api/projects")).json()) as {
    id: string;
    name: string;
  }[];
  const project = projects.find((p) => p.name === "Preview e2e")!;
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/app/${project.id}`);
  await expect(page.getByTestId("status-web")).toHaveAttribute("data-value", "bundled ✓");
  await expect(page.getByTestId("status-phone")).toHaveAttribute("data-value", "not verified");
});

test("@snack the player connects and renders through CloudFront and Snack", async ({
  page,
  context,
}) => {
  test.skip(!process.env.SNACK_LIVE, "needs network: SNACK_LIVE=1");
  await signIn(context, state.adminCookie);
  await page.setViewportSize({ width: 1400, height: 900 });
  await builtProject(page, "Preview live");
  await expect(page.getByTestId("preview-snapshot")).toHaveAttribute("data-web-status", "ok", {
    timeout: 120_000,
  });
});

test("@snack Reset demo data reseeds the app inside the player", async ({ page, context }) => {
  test.skip(!process.env.SNACK_LIVE, "needs network: SNACK_LIVE=1");
  await signIn(context, state.adminCookie);
  // A project whose current snapshot is the journal starter (demo entries, Delete entry).
  const created = await page.request.post("/api/projects", { data: { name: "Reset live" } });
  const { id } = (await created.json()) as { id: string };
  const pool = createPool(E2E_DATABASE_URL, 1);
  try {
    const db = createDb(pool);
    const snapshot = await createSnapshot(db, createStorage(storageConfigFrom(E2E_ENV)), {
      projectId: id,
      files: loadStarterFiles("journal"),
      parentId: null,
    });
    await db
      .update(schema.projects)
      .set({ currentSnapshotId: snapshot.id })
      .where(eq(schema.projects.id, id));
  } finally {
    await pool.end();
  }

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`/app/${id}`);
  await expect(page.getByTestId("preview-snapshot")).toHaveAttribute("data-web-status", "ok", {
    timeout: 120_000,
  });
  const app = page.frameLocator('[data-testid="web-preview"]');
  await expect(app.getByText("Sprint review")).toBeVisible({ timeout: 60_000 });
  await expect(app.getByTestId("demo-data-pill")).toBeVisible();

  // Delete a demo entry in the app, then reset from the workspace: it is reseeded.
  await app.getByText("Sprint review").click();
  await app.getByTestId("entry-delete").click();
  await expect(app.getByText("Sprint review")).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await expect(app.getByText("Sprint review")).toBeVisible({ timeout: 30_000 });
  await expect(app.getByTestId("demo-data-pill")).toBeVisible();
});
