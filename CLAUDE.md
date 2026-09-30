# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Buildly is an AI mobile app builder: a user describes an app or picks a starter, the AI generates a React Native + Expo + TypeScript project, the user previews it in the browser and in Expo Go, refines it in chat, and exports the source.

**The repo is early in implementation.** TODO Phase 0 has scaffolded the pnpm workspace: every `apps/*` and `packages/*` package exists, but only `packages/shared` (events, `Result`, `loadConfig`) and `scripts/check-no-secrets.ts` have real code. The rest are empty placeholders until their phase.

| Path | Role |
| --- | --- |
| `docs/mobile-app-builder-mvp.md` | Product brief and the source of truth for scope, pricing, and acceptance criteria |
| `.plan/mvp/TODO.md` | Master checklist: phases → slices → tasks, each with a **Verify** line |
| `.plan/mvp/ARCHITECTURE.md` | Concrete names TODO tasks rely on: monorepo layout, DB tables, generation state machine, tool contract, API routes, env vars |
| `.plan/mvp/DECISIONS.md` | Dated decision log (D1–D16) and pending decisions (P1–P5) with what gates them |
| `.plan/mvp/SPIKES.md`, `EVAL.md`, `METRICS.md`, `HOSTING.md` | Gating experiments, the model evaluation harness, analytics formulas, hosting and cost |
| `.plan/mvp/mockup/` | Click-through Next.js mockup of the finished MVP, mock data only |
| `.plan/mvp/screens/` | Screenshots of the mockup, referenced by `MOCKUP.md` |

## Working the plan

- A TODO task is done only when its **Verify** line has been executed and passes. Markers: `[ ]` todo, `[~]` in progress, `[x]` verified, `[-]` dropped with a one-line reason. Uncheck tasks that regress.
- When a change alters a decision, update `DECISIONS.md` in the same change. When it changes a name or shape, update `ARCHITECTURE.md` first; TODO tasks point at it.
- The brief, TODO, ARCHITECTURE, DECISIONS, HOSTING, EVAL, and the mockup cross-reference each other. A decision change (provider, pricing, hosting) usually touches several of them. Grep all of `docs/` and `.plan/mvp/` before declaring it done.
- Phases 0–1 can run in parallel. Spike results gate later phases (SPIKES.md says which).

## Mockup commands

Run from `.plan/mvp/mockup/` (pnpm, own lockfile, independent of the future monorepo):

```bash
pnpm install
pnpm dev             # http://localhost:3100
pnpm typecheck       # tsc --noEmit
pnpm build
pnpm build:shots && pnpm start:shots   # production build in .next-prod, served on :3101
```

There are no lint or test scripts in the mockup.

- **Screenshots:** capture them from the `:3101` server with headless Chrome (`--headless=new --window-size=1440,900 --screenshot=...`); the exact command is in `MOCKUP.md`. Do not run `next build` into `.next` while `pnpm dev` is running on 3100. It overwrites the dev server's output and breaks its CSS. That is why the `*:shots` scripts use `NEXT_DIST_DIR=.next-prod`.
- **Stale screenshot server:** before capturing, check `lsof -nP -iTCP:3101 -sTCP:LISTEN`. A leftover server from a previous run serves a stale build, which shows up as unstyled screenshots.
- **Deep links:** workspace states are reachable by query string, which is how screenshots are taken. Examples: `/app/reading-tracker?building=1`, `?tab=code`, `?phone=1`, `?history=1`.
- **Styling:** Tailwind v4 with design tokens defined in `app/globals.css` `@theme`, taken from brief §3. Use the token classes (`bg-bg`, `text-muted`, `border-line`, `bg-accent`, `rounded-card`, …) rather than raw colors.
- **Layout:** the `(shell)` route group holds a viewport-locked layout (`h-screen overflow-hidden`), so the sidebar stays fixed and only `<main>` scrolls. The workspace (`app/app/[id]`) is outside the shell and has no sidebar.

## Planned architecture (big picture)

These are from ARCHITECTURE.md and the brief. Details live there. What follows are the constraints that span many files and are easy to violate.

**Monorepo:** pnpm workspace with `apps/web` (Next.js App Router: UI, auth, API, SSE) and `apps/worker` (long-lived Node process that runs generations), plus `packages/` for `shared`, `db` (Drizzle/Postgres), `storage` (S3), `foundation`, `starters`, `checker`, `generator`, `snack`, `exporter`, and `eval`.

**Generated apps are constrained by one foundation** (`packages/foundation` + `foundation.json`):
- **Navigation:** React Navigation, not Expo Router. Snack does not support Expo Router.
- **Persistence:** an AsyncStorage typed document store with a `schemaVersion`. A schema change must bump the version, and a mismatch reseeds demo data; there are no migrations in the MVP.
- **Dependencies:** only the allowlist in `foundation.json`. The model may write only inside the layout globs. Foundation internals (`store.ts`, `theme/`, `components/`, `package.json`) are read-only to it.
- **Starters:** Journal, Habit Tracker, and Inventory are committed file sets on the foundation. They open with no AI call and double as regression fixtures for the generator.

**Generation flow** (worker): `queued → planning → editing (tool loop) → checking (tsc --noEmit against pre-baked node_modules) → bundling (Snack) → snapshot → succeeded`, with at most 2 repair attempts and a 4-minute hard timeout. Invariants the code must keep:
- Progress steps are written only after the operation actually completes, never from model text.
- `projects.current_snapshot_id` changes only in the snapshot step or on restore. Failure, cancel, and timeout keep the previous snapshot.
- At most one non-terminal generation per project, enforced by a partial unique index.
- Model tool calls (`list_files`, `read_file`, `write_file`, `delete_file`, `finish`) are validated server-side, with a rejection budget.

**Previews** run on Expo Snack via `snack-sdk`: a web player iframe plus an Expo Go QR code. Buildly never executes generated code on its servers; the checker only runs `tsc`. Export ZIPs are assembled by Buildly, not by Snack.

**AI provider:** OpenAI through the official SDK behind a `Provider` interface. Model names are config (`GENERATION_MODEL_PLAN` for plans and initial builds, `GENERATION_MODEL_EDIT` for edits and repairs). This routing is required for the pricing to work (brief §13, D16). There is no bring-your-own-key (D10). The OpenAI key lives only in the worker environment, and CI scans client bundles and exports for secrets.

**Hosting** (HOSTING.md): Railway (web, worker, Postgres) and AWS S3 in Singapore; MinIO locally. `STORAGE_ENDPOINT` is empty for real S3.

## Workspace commands

Run from the repo root (Node 22, pnpm 9):

```bash
pnpm install && pnpm typecheck         # tsc --noEmit in every package
pnpm lint                              # ESLint (type-aware) + prettier --check
pnpm format                            # prettier --write
pnpm test                              # Vitest in every package
pnpm --filter foundation test          # one package (scope optional: @buildly/foundation)
pnpm --filter shared exec vitest run src/config.test.ts   # one test file
pnpm check:secrets <dir>               # secret-leak guard; exits 1 on a finding
```

- Packages are `@buildly/<dir>`, export `src/index.ts` directly, and pin shared tool versions through the `catalog:` in `pnpm-workspace.yaml`.
- TypeScript stays on 6.0.x: typescript-eslint does not support 7 yet.
- Server env is read only through `loadConfig('web' | 'worker')` from `@buildly/shared/config`, never the `@buildly/shared` root, so env names stay out of client bundles.
- `.env.example` and `.plan/mvp/METRICS.md` are test fixtures: the shared tests fail if the env schema or the event list drifts from them.

## Planned commands (not yet available)

Later phases add these. Verify lines reference them, but they fail until their phase is done:

```bash
pnpm db:migrate / db:migrate:down / db:seed
pnpm test --tag snack                  # live Snack integration tests (skipped in CI)
pnpm eval --plan-model <m> --edit-model <m> --tasks smoke|all --runs N
pnpm eval:report <file.json>
```
