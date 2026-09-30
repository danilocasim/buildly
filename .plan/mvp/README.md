# Buildly MVP plan

Source of truth for scope: [`docs/mobile-app-builder-mvp.md`](../../docs/mobile-app-builder-mvp.md). This folder turns that brief into executable work.

| File | Purpose |
| --- | --- |
| [`TODO.md`](TODO.md) | The master checklist: phases, slices, tasks, and the verification for each task |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Repo layout, data model, generation state machine, API surface, security boundaries that tasks refer to |
| [`DECISIONS.md`](DECISIONS.md) | Decision log with dates and the decisions still gated on spikes |
| [`SPIKES.md`](SPIKES.md) | Time-boxed experiments with explicit pass/fail criteria that gate later phases |
| [`EVAL.md`](EVAL.md) | The fixed evaluation task set for the generator and how it is scored |
| [`METRICS.md`](METRICS.md) | Events to emit and the formulas for the H1–H3 targets |
| [`HOSTING.md`](HOSTING.md) | Where each part runs (Railway, AWS S3, Resend, Cloudflare), monthly cost, setup steps, environment variables per service, and alternatives |
| [`MOCKUP.md`](MOCKUP.md) | Design mockup of the finished MVP: a runnable Next.js click-through in `mockup/` and screenshots in `screens/` |

## How to work the plan

1. Work phases in order unless a slice is marked **parallel-ok**. Slices inside a phase can be reordered.
2. A task is done only when its **Verify** line has been executed and passes. Record the command or check you ran next to the checkbox if it differs from the Verify line.
3. If a Verify line cannot be automated yet, it is marked **manual** and must be repeated before each beta release.
4. When a task changes a decision, update `DECISIONS.md` in the same change.
5. Keep `TODO.md` honest: uncheck tasks that regress.

## Status markers

- `[ ]` not started
- `[~]` in progress
- `[x]` done and verified
- `[-]` dropped (add a one-line reason)

## Definition of done for the MVP

All acceptance criteria in brief section 12 are checked in `TODO.md` Phase 8, and the beta metrics review in Phase 9 has produced a go/no-go decision against the targets in brief section 1.
