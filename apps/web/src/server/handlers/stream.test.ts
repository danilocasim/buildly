// TODO 5.2.1: the SSE stream resumes from Last-Event-ID with nothing lost or repeated.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { events } from "@buildly/db";
import { createHarness, type Harness } from "../testing";
import { createProject } from "./projects";
import { streamProject } from "./stream";

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.cleanup());

interface Frame {
  id?: number;
  event: string;
  data: { payload?: { n?: number } } & Record<string, unknown>;
}

/** Reads SSE frames until `count` named events (not comments) arrived or the stream ends. */
async function readFrames(response: Response, count: number): Promise<Frame[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buffer = "";
  while (frames.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const frame: Partial<Frame> = {};
      for (const line of block.split("\n")) {
        if (line.startsWith("id: ")) frame.id = Number(line.slice(4));
        if (line.startsWith("event: ")) frame.event = line.slice(7);
        if (line.startsWith("data: ")) frame.data = JSON.parse(line.slice(6)) as Frame["data"];
      }
      if (frame.event) frames.push(frame as Frame);
    }
  }
  reader.releaseLock();
  return frames;
}

async function newProject(cookie: string) {
  const response = await createProject(
    h.request("POST", "/api/projects", { cookie, body: { name: "Stream" } }),
    h.deps,
  );
  return ((await response.json()) as { id: string }).id;
}

function connect(cookie: string, projectId: string, extra: { lastEventId?: number } = {}) {
  const controller = new AbortController();
  const headers: Record<string, string> = { cookie };
  if (extra.lastEventId !== undefined) headers["last-event-id"] = String(extra.lastEventId);
  const request = new Request(`http://localhost:3300/api/projects/${projectId}/stream`, {
    headers,
    signal: controller.signal,
  });
  return { controller, response: streamProject(request, h.deps, projectId, { pingMs: 50 }) };
}

describe("GET /api/projects/:id/stream", () => {
  it("relays events in order, and a reconnect with Last-Event-ID loses and repeats nothing", async () => {
    const { cookie } = await h.signIn("stream@example.com");
    const controllers: AbortController[] = [];
    try {
      const projectId = await newProject(cookie);
      const publish = (type: string, n: number) =>
        events.publish(h.t.db, { projectId, type, payload: { n } });

      // Two events exist before the client connects; two more arrive while connected.
      await publish("plan_ready", 1);
      await publish("files_written", 2);
      const first = connect(cookie, projectId);
      controllers.push(first.controller);
      const response = await first.response;
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      const early = readFrames(response, 5);
      await new Promise((r) => setTimeout(r, 100));
      await publish("types_checked", 3);
      await events.publishDelta(h.t.db, projectId, "gen-1", "Hello");
      await publish("preview_bundled", 4);
      const frames = await early;
      // Deltas are live-only NOTIFYs and may overtake a stored event's drain, so only the
      // stored events' order is asserted.
      expect(frames.filter((f) => f.event === "delta")).toHaveLength(1);
      const received = frames.filter((f) => f.event !== "delta");
      expect(received.map((f) => f.event)).toEqual([
        "plan_ready",
        "files_written",
        "types_checked",
        "preview_bundled",
      ]);
      expect(received.map((f) => f.data.payload?.n)).toEqual([1, 2, 3, 4]);
      const lastSeen = received.at(-1)!.id!;

      // Disconnect mid-run; the run goes on.
      first.controller.abort();
      await publish("snapshot_created", 5);
      await publish("finished", 6);

      // Reconnect from the last id seen: exactly the two missed events, nothing earlier.
      const second = connect(cookie, projectId, { lastEventId: lastSeen });
      controllers.push(second.controller);
      const resumed = await readFrames(await second.response, 2);
      expect(resumed.map((f) => f.data.payload?.n)).toEqual([5, 6]);
      expect(resumed.every((f) => f.id! > lastSeen)).toBe(true);
      second.controller.abort();

      const all = [...received, ...resumed].map((f) => f.id);
      expect(new Set(all).size).toBe(all.length);
    } finally {
      // A failed assertion must not leave a LISTEN connection open (cleanup would hang).
      controllers.forEach((c) => c.abort());
    }
  });

  it("delivers streamed text as delta frames without ids", async () => {
    const { cookie } = await h.signIn("delta@example.com");
    const projectId = await newProject(cookie);
    const { controller, response } = connect(cookie, projectId);
    const reading = readFrames(await response, 1);
    await new Promise((r) => setTimeout(r, 100));
    await events.publishDelta(h.t.db, projectId, "gen-9", "Plan: ");
    const [frame] = await reading;
    expect(frame).toMatchObject({
      event: "delta",
      data: { generationId: "gen-9", text: "Plan: " },
    });
    expect(frame!.id).toBeUndefined();
    controller.abort();
  });

  it("refuses other users' projects and anonymous requests", async () => {
    const owner = await h.signIn("owner-stream@example.com");
    const other = await h.signIn("other-stream@example.com");
    const projectId = await newProject(owner.cookie);
    expect((await connect(other.cookie, projectId).response).status).toBe(404);
    expect((await connect("", projectId).response).status).toBe(401);
  });
});
