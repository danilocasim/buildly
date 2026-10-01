// TODO 4b.0.1 Verify: drives the S1 spike page (spikes/snack-embed, `?starter=<slug>&player=<url>`)
// in headless Chromium and reads the state it exposes as window.__s1.
//
//   pnpm --filter @buildly/web-player exec tsx scripts/verify.ts \
//     --page https://<tunnel>.trycloudflare.com --forbidden-page http://127.0.0.1:3200 \
//     --player https://<player domain>/v2/%%SDK_VERSION%%
//
// Allowed origin: the web client connects (status ok) through the self-hosted player.
// Forbidden origin: the player logs "Access to origin … is forbidden" and no web client appears.
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";

const { values } = parseArgs({
  options: {
    page: { type: "string" },
    "forbidden-page": { type: "string" },
    player: { type: "string" },
    starter: { type: "string", default: "journal" },
    timeout: { type: "string", default: "120" },
  },
  strict: true,
});
if (!values.page || !values.player) {
  console.error("usage: verify.ts --page <origin> --player <url> [--forbidden-page <origin>]");
  process.exit(2);
}
const timeoutMs = Number(values.timeout) * 1000;

interface S1 {
  origin: string;
  player?: string;
  webPreviewURL?: string;
  clients: { platform: string; status: string; error?: { message: string } }[];
  logs: { type: string; message: string }[];
}

const url = (origin: string) =>
  `${origin}/?starter=${values.starter}&player=${encodeURIComponent(values.player!)}`;

async function state(page: Page): Promise<S1> {
  return page.evaluate(() => (window as unknown as { __s1: S1 }).__s1);
}

async function run(origin: string, expectConnected: boolean) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Console output of every frame, including the player iframe's (the runtime logs only
  // with verbose=true, which the spike page turns on when ?player= is set).
  const frameConsole: string[] = [];
  page.on("console", (message) => frameConsole.push(message.text()));
  await page.goto(url(origin), { waitUntil: "domcontentloaded" });
  const started = Date.now();
  let s1: S1 | undefined;
  const forbidden = () =>
    frameConsole.some((line) => /Access to origin .* is forbidden/.test(line));
  // The client reports "ok" before it evaluates the code, then "error" if that fails. So
  // once it has connected and reloaded the files, it must still be ok after a settle time.
  const SETTLE_MS = 12_000;
  let okSince: number | undefined;
  for (;;) {
    s1 = await state(page);
    const web = s1?.clients?.find((c) => c.platform === "web");
    const reloaded = frameConsole.some((line) => /Reloading, files changed/.test(line));
    if (expectConnected) {
      if (web?.status === "error") break;
      if (web?.status === "ok" && reloaded) okSince ??= Date.now();
      if (okSince && Date.now() - okSince > SETTLE_MS) break;
    } else if (forbidden() && Date.now() - started > 15_000) break;
    if (Date.now() - started > timeoutMs) break;
    await page.waitForTimeout(1000);
  }
  const iframeSrc = await page.locator("iframe").first().getAttribute("src");
  const web = s1?.clients?.find((c) => c.platform === "web");
  await browser.close();
  return {
    pageOrigin: s1?.origin,
    iframeSrc,
    playerUsed: Boolean(iframeSrc?.startsWith(values.player!.replace("%%SDK_VERSION%%", ""))),
    webClient: web ?? null,
    settledOk: Boolean(okSince && Date.now() - okSince > SETTLE_MS && web?.status === "ok"),
    forbiddenLogged: forbidden(),
    seconds: Math.round((Date.now() - started) / 1000),
    frameConsole: frameConsole.filter((l) => /origin|forbidden|error/i.test(l)).slice(0, 12),
  };
}

const allowed = await run(values.page, true);
const allowedOk = allowed.playerUsed && allowed.settledOk && !allowed.forbiddenLogged;
console.log(JSON.stringify({ allowed: { ...allowed, ok: allowedOk } }, null, 2));

let forbiddenOk: boolean | undefined;
if (values["forbidden-page"]) {
  const forbidden = await run(values["forbidden-page"], false);
  forbiddenOk = forbidden.playerUsed && forbidden.forbiddenLogged && forbidden.webClient === null;
  console.log(JSON.stringify({ forbidden: { ...forbidden, ok: forbiddenOk } }, null, 2));
}

const ok = allowedOk && forbiddenOk !== false;
console.log(ok ? "VERIFY PASSED" : "VERIFY FAILED");
process.exit(ok ? 0 : 1);
