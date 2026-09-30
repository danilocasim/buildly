"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Loader2, Sparkles, Square, User } from "lucide-react";

export type StepState = "done" | "running" | "pending";
export interface Step {
  label: string;
  state: StepState;
}

type Message =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "steps"; steps: Step[] };

const stepLabels = ["Plan ready", "Files written", "Types checked", "Preview bundled"];

const initialMessages: Message[] = [
  { kind: "user", text: "Build a reading tracker with goals and reading sessions." },
  {
    kind: "assistant",
    text: "Plan: four screens (Library, Book details, Reading session, Goals), models Book, Session and Goal, bottom tabs for Library, Goals and Profile.",
  },
  { kind: "steps", steps: stepLabels.map((label) => ({ label, state: "done" })) },
  { kind: "assistant", text: "Your app is ready. Books, sessions, and goals are connected." },
];

export function ChatPanel({
  startBuilding,
  onBuildingChange,
}: {
  startBuilding: boolean;
  onBuildingChange: (building: boolean) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [building, setBuilding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setBuildingState = (v: boolean) => {
    setBuilding(v);
    onBuildingChange(v);
  };

  /** Simulates the server-driven progress events from ARCHITECTURE.md §3. */
  const runBuild = (prompt: string) => {
    setBuildingState(true);
    const steps: Step[] = stepLabels.map((label, i) => ({ label, state: i === 0 ? "running" : "pending" }));
    setMessages((m) => [...m, { kind: "user", text: prompt }, { kind: "steps", steps }]);

    const advance = (i: number) => {
      setMessages((m) => {
        const next = [...m];
        const idx = next.findLastIndex((x) => x.kind === "steps");
        const cur = next[idx];
        if (cur.kind !== "steps") return m;
        const updated = cur.steps.map((s, j) => ({
          ...s,
          state: (j < i ? "done" : j === i ? "running" : "pending") as StepState,
        }));
        next[idx] = { kind: "steps", steps: updated };
        if (i === 1) next.splice(idx, 0, { kind: "assistant", text: "Plan: add a Favorites tab listing starred books, and a star toggle on Book details. No data model change." });
        return next;
      });
    };

    [1, 2, 3].forEach((i, n) => timers.current.push(window.setTimeout(() => advance(i), 900 * (n + 1))));
    timers.current.push(
      window.setTimeout(() => {
        setMessages((m) => {
          const next = [...m];
          const idx = next.findLastIndex((x) => x.kind === "steps");
          next[idx] = { kind: "steps", steps: stepLabels.map((label) => ({ label, state: "done" })) };
          return [...next, { kind: "assistant", text: "Done. Favorites is a new tab and books can be starred from their details screen." }];
        });
        setBuildingState(false);
      }, 4000),
    );
  };

  useEffect(() => {
    if (startBuilding && !building) runBuild("Add a Favorites tab with starred books.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startBuilding]);

  const cancel = () => {
    timers.current.forEach(clearTimeout);
    setMessages((m) => {
      const next = [...m];
      const idx = next.findLastIndex((x) => x.kind === "steps");
      const cur = next[idx];
      if (cur.kind === "steps") {
        next[idx] = { kind: "steps", steps: cur.steps.map((s) => ({ ...s, state: s.state === "running" ? "pending" : s.state })) };
      }
      return [...next, { kind: "assistant", text: "Cancelled. Your last working version is unchanged." }];
    });
    setBuildingState(false);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || building) return;
    setDraft("");
    runBuild(text);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={i} className="fade-up flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line text-muted">
                  <User size={15} />
                </span>
                <p className="rounded-2xl rounded-tl-md bg-line/50 px-4 py-2.5 text-[14px] leading-relaxed">{m.text}</p>
              </div>
            );
          if (m.kind === "assistant")
            return (
              <div key={i} className="fade-up flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                  <Sparkles size={15} />
                </span>
                <p className="rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-2.5 text-[14px] leading-relaxed">{m.text}</p>
              </div>
            );
          return (
            <div key={i} className="fade-up ml-11 rounded-2xl border border-line bg-surface p-4">
              <ul className="space-y-2.5">
                {m.steps.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-[13px]">
                    {s.state === "done" && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                    {s.state === "running" && <Loader2 size={20} className="spinner text-accent" />}
                    {s.state === "pending" && <span className="h-5 w-5 rounded-full border-2 border-line" />}
                    <span className={s.state === "pending" ? "text-faint" : ""}>{s.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4">
        <div className={`rounded-card border border-line bg-surface shadow-card ${building ? "opacity-70" : ""}`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={building}
            placeholder={building ? "Building… one change at a time" : "Describe a change..."}
            rows={2}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="flex items-center gap-1 text-[12px] text-faint">
              OpenAI <ChevronDown size={12} />
            </span>
            {building ? (
              <button onClick={cancel} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:bg-bg">
                <Square size={11} fill="currentColor" /> Cancel
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!draft.trim()}
                aria-label="Send"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-40"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
