"use client";

import { ArrowUp, Check, Loader2, Sparkles, Square, User, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  isActive,
  outcomeText,
  STEP_LABELS,
  stepStates,
  type ClientState,
  type Generation,
  type Message,
} from "./state";

type Thread = { message: Message; generation?: Generation };

export function ChatPanel({
  state,
  active,
  onSent,
  onResync,
}: {
  state: ClientState;
  active: Generation | undefined;
  onSent: (message: Message, generation: Generation) => void;
  onResync: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ message: string; resetAt?: string | null }>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const projectId = state.project.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, state.progress]);

  // Each user message starts a thread: its generation's steps, plan, and outcome follow it.
  const threads: Thread[] = state.messages
    .filter((m) => m.role === "user")
    .map((message) => ({
      message,
      generation: state.generations.find((g) => g.triggerMessageId === message.id),
    }));
  const assistantFor = (generationId: string) =>
    state.messages.filter((m) => m.role === "assistant" && m.generationId === generationId);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || active || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        messageId?: string;
        generationId?: string;
        message?: string;
        resetAt?: string | null;
      };
      if (!response.ok) {
        // The prompt stays in the composer (TODO 5.2.4).
        setError({ message: body.message ?? "Could not start the build.", resetAt: body.resetAt });
        return;
      }
      const now = new Date().toISOString();
      onSent(
        {
          id: body.messageId!,
          role: "user",
          content,
          generationId: body.generationId!,
          createdAt: now,
        },
        {
          id: body.generationId!,
          kind: state.project.currentSnapshotId ? "edit" : "initial",
          status: "queued",
          errorCode: null,
          errorDetail: null,
          triggerMessageId: body.messageId!,
          resultSnapshotId: null,
          repairAttempts: 0,
          screens: null,
          createdAt: now,
          steps: [],
        },
      );
      setDraft("");
    } catch {
      setError({ message: "Could not reach Buildly. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  async function cancel() {
    if (!active) return;
    await fetch(`/api/generations/${active.id}/cancel`, { method: "POST" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {threads.length === 0 && (
          <p className="text-[14px] text-muted">
            Describe the app you want to build, or a change to make.
          </p>
        )}
        {threads.map(({ message, generation }) => (
          <div key={message.id} className="space-y-3" data-testid="thread">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-muted">
                <User size={15} aria-hidden="true" />
              </span>
              <p className="rounded-2xl rounded-tl-md bg-line/50 px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
            {generation && (
              <GenerationThread
                generation={generation}
                progress={state.progress[generation.id]}
                streaming={state.streaming[generation.id]}
                assistant={assistantFor(generation.id)}
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(event) => void send(event)} className="px-4 pb-4">
        {error && (
          <div
            role="alert"
            data-testid="composer-error"
            className="mb-2 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-subtle px-3 py-2 text-[13px]"
          >
            <span className="flex-1">
              {error.message}
              {error.resetAt && (
                <>
                  {" "}
                  Try again after{" "}
                  <time dateTime={error.resetAt}>{new Date(error.resetAt).toLocaleString()}</time>.
                </>
              )}
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setError(undefined)}
              className="text-muted hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <div
          className={`rounded-card border border-line bg-surface shadow-card ${active ? "opacity-70" : ""}`}
        >
          <label htmlFor="composer" className="sr-only">
            Message
          </label>
          <textarea
            id="composer"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            disabled={Boolean(active) || sending}
            placeholder={
              active
                ? "Building… one change at a time"
                : state.messages.length
                  ? "Describe a change..."
                  : "Describe your mobile app..."
            }
            rows={2}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="text-[12px] text-muted">OpenAI</span>
            {active ? (
              <button
                type="button"
                onClick={() => void cancel().then(onResync)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:bg-bg"
              >
                <Square size={11} fill="currentColor" aria-hidden="true" /> Cancel
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Send"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-ink transition-opacity disabled:opacity-40"
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function GenerationThread({
  generation,
  progress,
  streaming,
  assistant,
}: {
  generation: Generation;
  progress: ClientState["progress"][string] | undefined;
  streaming: string | undefined;
  assistant: Message[];
}) {
  const active = isActive(generation) && progress?.status !== "cancelled";
  const status = progress?.status ?? generation.status;
  const states = stepStates(progress, isActive({ status }));
  const plan = assistant[0];
  const summary = assistant[1];
  const terminal = !isActive({ status });
  return (
    <div className="ml-11 space-y-3" data-testid="generation" data-status={status}>
      {(plan || streaming) && (
        <Assistant text={plan?.content ?? streaming ?? ""} testId="assistant-plan" />
      )}
      <ul
        className="space-y-2.5 rounded-2xl border border-line bg-surface p-4"
        aria-label="Progress"
      >
        {STEP_LABELS.map(([key, label]) => {
          const s = states[key];
          return (
            <li
              key={key}
              data-testid={`step-${key}`}
              data-state={s}
              className="flex items-center gap-3 text-[13px]"
            >
              {s === "done" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              {s === "failed" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white">
                  <X size={12} strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              {s === "running" && (
                <Loader2 size={20} className="animate-spin text-accent" aria-hidden="true" />
              )}
              {s === "pending" && (
                <span className="h-5 w-5 rounded-full border-2 border-line" aria-hidden="true" />
              )}
              <span className={s === "pending" ? "text-muted" : ""}>
                {label}
                {key === "typecheck" && progress?.repairAttempt
                  ? ` (repair ${progress.repairAttempt})`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {terminal && (
        <p
          data-testid="outcome"
          className={`text-[13px] ${status === "succeeded" ? "text-muted" : "text-danger"}`}
        >
          {outcomeText(status, progress?.errorCode ?? generation.errorCode)}
          {status === "failed" && generation.errorDetail && (
            <span className="mt-1 block font-mono text-[12px] whitespace-pre-wrap text-ink">
              {generation.errorDetail}
            </span>
          )}
          {status === "cancelled" && (
            <span className="block text-muted">Your last working version is unchanged.</span>
          )}
        </p>
      )}
      {summary && <Assistant text={summary.content} testId="assistant-summary" />}
      {active && !plan && !streaming && (
        <p className="text-[13px] text-muted" data-testid="queued">
          Waiting for a build worker…
        </p>
      )}
    </div>
  );
}

function Assistant({ text, testId }: { text: string; testId: string }) {
  return (
    <div className="-ml-11 flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
        <Sparkles size={15} aria-hidden="true" />
      </span>
      <p
        data-testid={testId}
        className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
      >
        {text}
      </p>
    </div>
  );
}
