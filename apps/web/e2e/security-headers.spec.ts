// TODO 7.2.2: the security headers on "/" and the workspace route, as the server sends them.
import { expect, test, type APIResponse } from "@playwright/test";
import { newUserSession, signIn } from "./helpers";

const PLAYER_ORIGIN = "https://d3tfrf3qzy19yc.cloudfront.net";

function expectSecurityHeaders(response: APIResponse) {
  const headers = response.headers();
  const csp = headers["content-security-policy"]!;
  expect(csp).toContain(`frame-src ${PLAYER_ORIGIN};`);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
}

test("/ and the workspace route send the CSP, HSTS, and framing headers", async ({
  page,
  context,
}) => {
  await signIn(context, await newUserSession(`headers-${Date.now()}@example.com`));
  const home = await page.request.get("/", { maxRedirects: 0 });
  expect(home.status()).toBe(200);
  expectSecurityHeaders(home);

  const created = await page.request.post("/api/projects", { data: { name: "Headers" } });
  const { id } = (await created.json()) as { id: string };
  const workspace = await page.request.get(`/app/${id}`, { maxRedirects: 0 });
  expect(workspace.status()).toBe(200);
  expectSecurityHeaders(workspace);
});
