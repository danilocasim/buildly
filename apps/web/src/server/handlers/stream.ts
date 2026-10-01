// GET /api/projects/:id/stream — Server-Sent Events relaying the project's progress events
// (TODO 4.4.4) and the assistant's streamed text. Stored events carry their row id as the
// SSE id, so a reconnecting EventSource resumes from `Last-Event-ID` (or `?after=` on the
// first connection) without losing or repeating anything; deltas are live-only.
import { events, projects } from "@buildly/db";
import type { Deps } from "../deps";
import { errorJson } from "../http";
import { requireUser } from "../session";

export const SSE_PING_MS = 15_000;

export async function streamProject(
  request: Request,
  deps: Deps,
  projectId: string,
  options: { pingMs?: number } = {},
): Promise<Response> {
  const user = await requireUser(request, deps);
  if (user instanceof Response) return user;
  const project = await projects.getForUser(deps.db, user.id, projectId);
  if (!project) return errorJson(404, "not_found", "Project not found.");

  const url = new URL(request.url);
  const afterId =
    Number(request.headers.get("last-event-id") ?? url.searchParams.get("after") ?? 0) || 0;
  const encoder = new TextEncoder();
  let subscription: events.Subscription | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      // Idempotent; closes whatever subscription exists at the time it runs, so an abort
      // that lands before subscribe() resolves still releases the LISTEN connection.
      const close = async () => {
        closed = true;
        clearInterval(ping);
        const current = subscription;
        subscription = undefined;
        await current?.close();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      request.signal.addEventListener("abort", () => void close(), { once: true });
      send("retry: 2000\n\n");
      subscription = await events.subscribe(
        deps.pool,
        deps.db,
        projectId,
        {
          onEvent: (event) =>
            send(
              `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({
                id: event.id,
                type: event.type,
                generationId: event.generationId,
                payload: event.payload,
                createdAt: event.createdAt,
              })}\n\n`,
            ),
          onDelta: (delta) => send(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`),
        },
        afterId,
      );
      if (closed) await close();
      else ping = setInterval(() => send(": ping\n\n"), options.pingMs ?? SSE_PING_MS);
    },
    async cancel() {
      closed = true;
      clearInterval(ping);
      const current = subscription;
      subscription = undefined;
      await current?.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
