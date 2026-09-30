import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { credits, queue, schema, usage } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { cancelGeneration } from "./generations";
import { postMessage } from "./messages";
import { createProject } from "./projects";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.t.cleanup());

async function newProject(cookie: string, name = "App") {
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name } }),
    h.deps,
  );
  return ((await response.json()) as { id: string }).id;
}

async function finishActiveBuilds(projectId: string) {
  await h.t.db
    .update(schema.generations)
    .set({ status: "succeeded" })
    .where(eq(schema.generations.projectId, projectId));
}

describe("POST /api/projects/:id/messages", () => {
  it("records the message and starts a build: generation, usage event, and queue job", async () => {
    const { user, cookie } = await h.signIn("builder@example.com");
    const projectId = await newProject(cookie);
    const response = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "A habit app" },
      }),
      h.deps,
      projectId,
    );
    expect(response.status).toBe(202);
    const { generationId } = (await response.json()) as { generationId: string };

    const [generation] = await h.t.db
      .select()
      .from(schema.generations)
      .where(eq(schema.generations.id, generationId));
    expect(generation).toMatchObject({ status: "queued", kind: "initial", userId: user.id });
    expect(await usage.countBuildsThisMonth(h.t.db, user.id, h.clock.now)).toBe(1);
    const job = await queue.getJob(h.t.db, (await h.t.db.select().from(schema.jobs))[0]!.id);
    expect(job).toMatchObject({ type: "generation", payload: { generationId, projectId } });

    // A second message while that build is active → 409, and nothing is consumed.
    const again = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "more" },
      }),
      h.deps,
      projectId,
    );
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "generation_active", resetAt: null });
    expect(await usage.countBuildsThisMonth(h.t.db, user.id, h.clock.now)).toBe(1);
  });

  it("the 16th build in a month → 429 monthly_builds with resetAt, and a cap.hit row", async () => {
    const { user, cookie } = await h.signIn("heavy@example.com");
    const projectId = await newProject(cookie);
    // 15 builds earlier this month, outside the last hour.
    for (let i = 0; i < 15; i++) {
      await usage.record(h.t.db, {
        userId: user.id,
        projectId,
        type: "build",
        occurredAt: new Date(`2026-10-0${1 + (i % 9)}T08:00:00Z`),
      });
    }
    const response = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "one more" },
      }),
      h.deps,
      projectId,
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "monthly_builds",
      message: expect.stringContaining("used all 15 builds") as string,
      resetAt: "2026-11-01T00:00:00.000Z",
    });
    const hits = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(
        and(eq(schema.analyticsEvents.name, "cap.hit"), eq(schema.analyticsEvents.userId, user.id)),
      );
    expect(hits).toEqual([
      expect.objectContaining({ props: { cap: "monthly_builds" }, projectId }),
    ]);
  });

  it("the 11th build in an hour on Free → 429 hourly_builds", async () => {
    const { user, cookie } = await h.signIn("burst@example.com");
    const projectId = await newProject(cookie);
    for (let i = 0; i < 10; i++) {
      await usage.record(h.t.db, {
        userId: user.id,
        projectId,
        type: "build",
        occurredAt: new Date(h.clock.now.getTime() - (50 - i) * 60_000),
      });
    }
    const response = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "again" },
      }),
      h.deps,
      projectId,
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      code: "hourly_builds",
      resetAt: new Date(h.clock.now.getTime() + 10 * 60_000).toISOString(),
    });
  });

  it("404 for someone else's project; 401 without a session", async () => {
    const owner = await h.signIn("owner@example.com");
    const other = await h.signIn("other@example.com");
    const projectId = await newProject(owner.cookie);
    expect(
      (
        await postMessage(
          h.request("POST", `/api/projects/${projectId}/messages`, {
            cookie: other.cookie,
            body: { content: "x" },
          }),
          h.deps,
          projectId,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await postMessage(
          h.request("POST", `/api/projects/${projectId}/messages`, { body: { content: "x" } }),
          h.deps,
          projectId,
        )
      ).status,
    ).toBe(401);
  });
});

describe("top-up credits and concurrency", () => {
  it("the 16th build spends one top-up credit instead of failing", async () => {
    const { user, cookie } = await h.signIn("topped@example.com");
    const projectId = await newProject(cookie);
    for (let i = 0; i < 15; i++) {
      await usage.record(h.t.db, {
        userId: user.id,
        type: "build",
        occurredAt: new Date("2026-10-02T08:00:00Z"),
      });
    }
    await credits.grant(h.t.db, { userId: user.id, amount: 1, reason: "topup" });

    const response = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "one more" },
      }),
      h.deps,
      projectId,
    );
    expect(response.status).toBe(202);
    const body = (await response.json()) as { generationId: string; paidBy: string };
    expect(body.paidBy).toBe("credit");
    expect(await credits.balance(h.t.db, user.id)).toBe(0);
    expect(await credits.paidByCredit(h.t.db, body.generationId)).toBe(true);

    // With the credit spent and the allowance gone, the next build is refused.
    await finishActiveBuilds(projectId);
    const next = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie,
        body: { content: "again" },
      }),
      h.deps,
      projectId,
    );
    expect(next.status).toBe(429);
    expect(await next.json()).toMatchObject({ code: "monthly_builds" });
  });

  it("a Free user building on one project gets 429 concurrent_builds on another", async () => {
    const { cookie } = await h.signIn("two-projects@example.com");
    const first = await newProject(cookie, "First");
    const second = await newProject(cookie, "Second");
    const post = (projectId: string) =>
      postMessage(
        h.request("POST", `/api/projects/${projectId}/messages`, {
          cookie,
          body: { content: "go" },
        }),
        h.deps,
        projectId,
      );
    expect((await post(first)).status).toBe(202);
    const blocked = await post(second);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ code: "concurrent_builds", resetAt: null });
  });
});

describe("POST /api/projects (project cap)", () => {
  it("Free users get 403 projects on a third project, with a cap.hit row; Pro users do not", async () => {
    const free = await h.signIn("free@example.com");
    await newProject(free.cookie, "One");
    await newProject(free.cookie, "Two");
    const third = await createProject(
      h.request("POST", "/api/projects", { cookie: free.cookie, body: { name: "Three" } }),
      h.deps,
    );
    expect(third.status).toBe(403);
    expect(await third.json()).toMatchObject({ code: "projects", resetAt: null });
    const [hit] = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(
        and(
          eq(schema.analyticsEvents.name, "cap.hit"),
          eq(schema.analyticsEvents.userId, free.user.id),
        ),
      );
    expect(hit?.props).toEqual({ cap: "projects" });

    const pro = await h.signIn("pro@example.com", { plan: "pro" });
    for (const name of ["A", "B", "C"]) {
      expect(
        (
          await createProject(
            h.request("POST", "/api/projects", { cookie: pro.cookie, body: { name } }),
            h.deps,
          )
        ).status,
      ).toBe(201);
    }
  });
});

describe("POST /api/generations/:id/cancel", () => {
  it("sets cancel_requested on the build's job and records build.cancelled", async () => {
    const { cookie } = await h.signIn("canceller@example.com");
    const projectId = await newProject(cookie);
    const started = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, { cookie, body: { content: "go" } }),
      h.deps,
      projectId,
    );
    const { generationId } = (await started.json()) as { generationId: string };

    const response = await cancelGeneration(
      h.request("POST", `/api/generations/${generationId}/cancel`, { cookie }),
      h.deps,
      generationId,
    );
    expect(response.status).toBe(202);
    const [job] = await h.t.db.select().from(schema.jobs);
    const mine = (await h.t.db.select().from(schema.jobs)).find(
      (j) => j.payload.generationId === generationId,
    )!;
    expect(mine.cancelRequested).toBe(true);
    void job;
    const [event] = await h.t.db
      .select()
      .from(schema.analyticsEvents)
      .where(eq(schema.analyticsEvents.name, "build.cancelled"));
    expect(event?.props).toEqual({ generation_id: generationId });

    await finishActiveBuilds(projectId);
    expect(
      (
        await cancelGeneration(
          h.request("POST", `/api/generations/${generationId}/cancel`, { cookie }),
          h.deps,
          generationId,
        )
      ).status,
    ).toBe(409);
  });

  it("someone else's build → 404", async () => {
    const owner = await h.signIn("gen-owner@example.com");
    const other = await h.signIn("gen-other@example.com");
    const projectId = await newProject(owner.cookie);
    const started = await postMessage(
      h.request("POST", `/api/projects/${projectId}/messages`, {
        cookie: owner.cookie,
        body: { content: "go" },
      }),
      h.deps,
      projectId,
    );
    const { generationId } = (await started.json()) as { generationId: string };
    expect(
      (
        await cancelGeneration(
          h.request("POST", `/api/generations/${generationId}/cancel`, { cookie: other.cookie }),
          h.deps,
          generationId,
        )
      ).status,
    ).toBe(404);
  });
});
