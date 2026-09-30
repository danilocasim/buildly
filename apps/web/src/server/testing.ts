// Handler test harness: a fresh database, a recording email sender, a settable clock,
// and helpers to create users with a session cookie.
import { auth, schema } from "@buildly/db";
import { createTestDatabase, type TestDatabase } from "@buildly/db/testing";
import type { Deps } from "./deps";
import type { EmailMessage } from "./email";
import { SESSION_COOKIE } from "./http";

export const APP_URL = "http://localhost:3300";

export interface Harness {
  t: TestDatabase;
  deps: Deps;
  sent: EmailMessage[];
  clock: { now: Date };
  signIn(
    email: string,
    extra?: Partial<typeof schema.users.$inferInsert>,
  ): Promise<{ user: auth.User; cookie: string }>;
  request(method: string, path: string, init?: { cookie?: string; body?: unknown }): Request;
}

export async function createHarness(): Promise<Harness> {
  const t = await createTestDatabase();
  const sent: EmailMessage[] = [];
  const clock = { now: new Date("2026-10-15T12:00:00Z") };
  const deps: Deps = {
    db: t.db,
    email: {
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    },
    appUrl: APP_URL,
    now: () => clock.now,
  };
  return {
    t,
    deps,
    sent,
    clock,
    async signIn(email, extra = {}) {
      const [user] = await t.db
        .insert(schema.users)
        .values({ email, ...extra })
        .returning();
      const token = await auth.createSession(t.db, user!.id, clock.now);
      return { user: user!, cookie: `${SESSION_COOKIE}=${token}` };
    },
    request(method, path, init = {}) {
      const headers: Record<string, string> = {};
      if (init.cookie) headers.cookie = init.cookie;
      if (init.body !== undefined) headers["content-type"] = "application/json";
      return new Request(new URL(path, APP_URL), {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    },
  };
}
