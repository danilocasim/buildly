"use client";

import { useState, type FormEvent } from "react";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

const MESSAGES: Record<string, string> = {
  invalid_link: "This sign-in link is invalid, already used, or expired. Request a new one.",
  invalid_email: "Enter a valid email address.",
  not_invited: "Buildly is invite-only right now.",
  network: "Could not reach Buildly. Check your connection and try again.",
};

export function SignInForm({ initialError }: { initialError?: "invalid_link" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>(
    initialError ? { kind: "error", message: MESSAGES[initialError]! } : { kind: "idle" },
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setState({ kind: "sent", email: email.trim() });
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      setState({
        kind: "error",
        message: (body.code && MESSAGES[body.code]) ?? body.message ?? "Something went wrong.",
      });
    } catch {
      setState({ kind: "error", message: MESSAGES.network! });
    }
  }

  if (state.kind === "sent") {
    return (
      <section className="mt-10" aria-live="polite">
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-3 text-[15px] text-muted">
          We sent a sign-in link to <span className="font-medium text-ink">{state.email}</span>. It
          works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-6 text-[14px] text-accent-text hover:underline"
        >
          Use a different email
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Buildly</h1>
      <p className="mt-2 text-[15px] text-muted">
        Enter your email and we will send you a sign-in link.
      </p>
      <label htmlFor="email" className="mt-8 block text-[13px] font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {state.kind === "error" && (
        <p role="alert" data-testid="sign-in-error" className="mt-3 text-[14px] text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={state.kind === "sending"}
        className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-[15px] font-medium text-ink hover:bg-accent-hover disabled:opacity-60"
      >
        {state.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
