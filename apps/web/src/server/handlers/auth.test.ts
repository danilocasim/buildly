import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { consumeMagicLink, requestMagicLink } from "./auth";
import { getMe } from "./me";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

const tokenFrom = (text: string) =>
  new URL(/https?:\/\/\S+/.exec(text)![0]).searchParams.get("token")!;

describe("POST /api/auth/magic-link", () => {
  it("answers 403 with a generic message for an email that is not invited", async () => {
    const response = await requestMagicLink(
      h.request("POST", "/api/auth/magic-link", { body: { email: "stranger@example.com" } }),
      h.deps,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: "not_invited",
      message: "Buildly is invite-only right now.",
    });
    expect(h.sent).toHaveLength(0);
  });

  it("answers 200 for an invited email, stores only a token hash, and emails the link", async () => {
    await h.t.db.insert(schema.invites).values({ email: "invited@example.com" });
    const response = await requestMagicLink(
      h.request("POST", "/api/auth/magic-link", { body: { email: " Invited@Example.com " } }),
      h.deps,
    );
    expect(response.status).toBe(200);
    const [row] = await h.t.db
      .select()
      .from(schema.magicLinks)
      .where(eq(schema.magicLinks.email, "invited@example.com"));
    expect(row).toMatchObject({
      usedAt: null,
      expiresAt: new Date(h.clock.now.getTime() + 15 * 60_000),
    });
    const token = tokenFrom(h.sent.at(-1)!.text);
    expect(row!.tokenHash).not.toContain(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a malformed email", async () => {
    const response = await requestMagicLink(
      h.request("POST", "/api/auth/magic-link", { body: { email: "nope" } }),
      h.deps,
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/auth/callback", () => {
  async function linkFor(email: string) {
    await h.t.db.insert(schema.invites).values({ email }).onConflictDoNothing();
    await requestMagicLink(h.request("POST", "/api/auth/magic-link", { body: { email } }), h.deps);
    return tokenFrom(h.sent.at(-1)!.text);
  }

  it("valid token → 302 to Home with a secure session cookie; creates the user; accepts the invite", async () => {
    const token = await linkFor("new@example.com");
    const response = await consumeMagicLink(
      h.request("GET", `/api/auth/callback?token=${token}`),
      h.deps,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3300/");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(
      /^buildly_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/,
    );

    const [user] = await h.t.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "new@example.com"));
    expect(user).toMatchObject({ plan: "free", isAdmin: false });
    const [invite] = await h.t.db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.email, "new@example.com"));
    expect(invite!.acceptedAt).toEqual(h.clock.now);

    const me = await getMe(h.request("GET", "/api/me", { cookie: cookie.split(";")[0] }), h.deps);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email: "new@example.com" });
  });

  it("the same token a second time → 400", async () => {
    const token = await linkFor("twice@example.com");
    expect(
      (await consumeMagicLink(h.request("GET", `/api/auth/callback?token=${token}`), h.deps))
        .status,
    ).toBe(302);
    expect(
      (await consumeMagicLink(h.request("GET", `/api/auth/callback?token=${token}`), h.deps))
        .status,
    ).toBe(400);
  });

  it("an expired token (after 15 minutes) → 400", async () => {
    const token = await linkFor("late@example.com");
    const issued = h.clock.now;
    h.clock.now = new Date(issued.getTime() + 15 * 60_000 + 1);
    try {
      expect(
        (await consumeMagicLink(h.request("GET", `/api/auth/callback?token=${token}`), h.deps))
          .status,
      ).toBe(400);
    } finally {
      h.clock.now = issued;
    }
  });

  it("an unknown or missing token → 400", async () => {
    expect(
      (await consumeMagicLink(h.request("GET", "/api/auth/callback?token=nope"), h.deps)).status,
    ).toBe(400);
    expect((await consumeMagicLink(h.request("GET", "/api/auth/callback"), h.deps)).status).toBe(
      400,
    );
  });

  it("an existing user can sign in without an invite", async () => {
    await h.t.db.insert(schema.users).values({ email: "member@example.com" });
    const response = await requestMagicLink(
      h.request("POST", "/api/auth/magic-link", { body: { email: "member@example.com" } }),
      h.deps,
    );
    expect(response.status).toBe(200);
  });
});

describe("GET /api/me", () => {
  it("no cookie → 401; a bad cookie → 401", async () => {
    expect((await getMe(h.request("GET", "/api/me"), h.deps)).status).toBe(401);
    expect(
      (await getMe(h.request("GET", "/api/me", { cookie: "buildly_session=forged" }), h.deps))
        .status,
    ).toBe(401);
  });

  it("a valid cookie → the user's own profile and usage, nothing about other users", async () => {
    const { cookie } = await h.signIn("me@example.com");
    await h.signIn("someone-else@example.com");
    const response = await getMe(h.request("GET", "/api/me", { cookie }), h.deps);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      email: "me@example.com",
      plan: "free",
      isAdmin: false,
      usage: { buildsThisMonth: 0, buildsPerMonth: 15, credits: 0 },
    });
    expect(JSON.stringify(body)).not.toContain("someone-else@example.com");
  });

  it("an expired session → 401", async () => {
    const { cookie } = await h.signIn("expiring@example.com");
    const signedInAt = h.clock.now;
    h.clock.now = new Date(signedInAt.getTime() + 31 * 24 * 60 * 60_000);
    try {
      expect((await getMe(h.request("GET", "/api/me", { cookie }), h.deps)).status).toBe(401);
    } finally {
      h.clock.now = signedInAt;
    }
  });
});
