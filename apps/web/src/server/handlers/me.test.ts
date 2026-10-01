import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "../testing";
import { signOut } from "./auth";
import { getMe, patchMe } from "./me";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

describe("PATCH /api/me", () => {
  it("sets, trims, and clears the display name", async () => {
    const { cookie } = await h.signIn("name@example.com");
    const patch = (body: unknown) =>
      patchMe(h.request("PATCH", "/api/me", { cookie, body }), h.deps);
    expect(await (await patch({ displayName: "  Dana  " })).json()).toMatchObject({
      displayName: "Dana",
    });
    const me = (await (await getMe(h.request("GET", "/api/me", { cookie }), h.deps)).json()) as {
      displayName: string | null;
      usage: { resetsAt: string };
    };
    expect(me.displayName).toBe("Dana");
    expect(me.usage.resetsAt).toBe("2026-11-01T00:00:00.000Z");
    expect(await (await patch({ displayName: "" })).json()).toMatchObject({ displayName: null });
    expect((await patch({ displayName: "x".repeat(61) })).status).toBe(400);
    expect(
      (await patchMe(h.request("PATCH", "/api/me", { body: { displayName: "x" } }), h.deps)).status,
    ).toBe(401);
  });
});

describe("POST /api/auth/sign-out", () => {
  it("deletes the session and clears the cookie; /api/me then answers 401", async () => {
    const { cookie } = await h.signIn("bye@example.com");
    expect((await getMe(h.request("GET", "/api/me", { cookie }), h.deps)).status).toBe(200);
    const response = await signOut(h.request("POST", "/api/auth/sign-out", { cookie }), h.deps);
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(/buildly_session=;.*Max-Age=0/);
    // The old cookie value no longer resolves to a session.
    expect((await getMe(h.request("GET", "/api/me", { cookie }), h.deps)).status).toBe(401);
    // Signing out without a session is harmless.
    expect((await signOut(h.request("POST", "/api/auth/sign-out"), h.deps)).status).toBe(204);
  });
});
