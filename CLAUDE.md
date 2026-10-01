# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Buildly is an AI mobile app builder: a user describes an app or picks a starter, the AI generates a React Native + Expo + TypeScript project, the user previews it in the browser and in Expo Go, refines it in chat, and exports the source.

**The repo is in implementation.** Phases 0–4 are built (see TODO.md for the few open checks): workspace and CI, spikes (`spikes/`, results in SPIKES.md), the Expo foundation and starters, the type checker, and the platform: Postgres schema and queries (`packages/db`), object storage (`packages/storage`), the job queue and worker loop (`apps/worker`), the web app's auth, project, build, cancel, and restore APIs plus `/admin/invites` (`apps/web`, Next.js 16), and the generation engine: OpenAI provider, tool layer, context builder, and `runGeneration` (`packages/generator`), Snack sessions (`packages/snack`), and the eval harness (`packages/eval`). `packages/exporter` is a placeholder until Phase 6; the web UI is Phase 5–6.

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

**Previews** run on Expo Snack via `snack-sdk`: a web player iframe plus an Expo Go QR code. The web player is Buildly's self-hosted build of Snack's player (`webPlayerURL`, D18), because Expo's hosted one only talks to allowlisted origins. Buildly never executes generated code on its servers; the checker only runs `tsc`. Export ZIPs are assembled by Buildly, not by Snack.

**AI provider:** OpenAI through the official SDK behind a `Provider` interface. Model names are config (`GENERATION_MODEL_PLAN` for plans and initial builds, `GENERATION_MODEL_EDIT` for edits and repairs). This routing is required for the pricing to work (brief §13, D16). There is no bring-your-own-key (D10). The OpenAI key lives only in the worker environment, and CI scans client bundles and exports for secrets.

**Hosting** (HOSTING.md): Railway (web, worker, Postgres) and AWS S3 in Singapore; RustFS locally (D20). `STORAGE_ENDPOINT` is empty for real S3.

## Workspace commands

Run from the repo root (Node 22, pnpm 9):

```bash
pnpm install && pnpm typecheck         # tsc --noEmit in every package
pnpm lint                              # ESLint (type-aware) + prettier --check
pnpm format                            # prettier --write
pnpm test                              # every package (Vitest; Jest for foundation and starters)
pnpm --filter foundation test          # one package (scope optional: @buildly/foundation)
pnpm --filter shared exec vitest run src/config.test.ts   # one Vitest file
pnpm --filter starters exec jest --selectProjects journal # one starter's smoke tests
pnpm --filter foundation digest        # regenerate dist/api-digest.md (CI fails if stale)
pnpm checker:selftest                  # type-check the journal starter, fail if warm ≥ 15 s
pnpm check:secrets <dir>               # secret-leak guard; exits 1 on a finding
pnpm test:snack                        # live Snack integration test (network; skipped by `pnpm test` and CI)
pnpm eval --tasks smoke --runs 1 --dry-run --model gpt-6-luna   # eval harness, scripted provider, free
pnpm eval --plan-model <m> --edit-model <m> --tasks smoke|all|T1,T4 --runs N   # real API calls (.env OPENAI_API_KEY); writes .eval/*.json
pnpm eval:report <file.json>            # markdown table with the EVAL.md thresholds
docker build -f apps/worker/Dockerfile -t buildly-worker .   # worker image with pre-baked foundation deps
```

On this Mac `/opt/homebrew/bin/docker` is an npm documentation generator, not Docker, and it writes a `doc/` folder into the current directory. Use `/Applications/Docker.app/Contents/Resources/bin/docker`.

- Packages are `@buildly/<dir>`, export `src/index.ts` directly, and pin shared tool versions through the `catalog:` in `pnpm-workspace.yaml`.
- TypeScript stays on 6.0.x: typescript-eslint does not support 7 yet.
- Server env is read only through `loadConfig('web' | 'worker')` from `@buildly/shared/config`, never the `@buildly/shared` root, so env names stay out of client bundles.
- Nested standalone projects (`.plan/mvp/mockup/`, each `spikes/<name>/`) carry their own `pnpm-workspace.yaml` and lockfile. Without it, `pnpm install` inside them resolves up to the repo workspace and installs that instead. Add dependencies there with `pnpm add -w`. `spikes/` is excluded from ESLint and Prettier.
- `.env.example` and `.plan/mvp/METRICS.md` are test fixtures: the shared tests fail if the env schema or the event list drifts from them.

### Foundation and starters

- `packages/foundation` is two things: the Expo app that ships (`App.tsx`, `app.json`, `tsconfig.json`, `src/`) and a workspace package whose `lib/`, `scripts/`, `test/`, `export/`, and `dist/` never ship. `foundation.json` is the contract (allowlist, layout globs, schema-version rule); its versions must equal the `foundation` catalog in `pnpm-workspace.yaml` and the package's `dependencies` keys (a test enforces both).
- The store scopes AsyncStorage keys by `app.json` `expo.slug` (Expo Go shares storage across Snacks); anything that sends files to Snack must give each project a unique slug. Foundation code reads `app.json` by importing it, not through `expo-constants`.
- Shipped app code is standalone: it may import only allowlisted packages and relative paths, never `@buildly/*`. Anything both sides need (such as `RUNTIME_ERROR_PREFIX`) is duplicated and pinned by a cross-check test.
- A starter is only project-owned files (`src/navigation.tsx`, `src/screens/**`, `src/data/models.ts`, `src/data/seed.ts`). Helpers go in `models.ts`, since other paths are not writable. Screens take no props and use `useNavigation`/`useRoute` hooks.
- Jest tests (D19) in these two packages: `jest.resetModules()` gives a fresh store but a second React, so re-require `@testing-library/react-native/pure` after it and use the queries `render` returns; `toBeOnTheScreen` only works with the top-level instance. Bottom tabs are found with `getByLabelText(/^Name, tab/)`. `packages/starters/test/resolver.cjs` overlays a starter on the foundation.
- After changing any exported component props or store signature, run `pnpm --filter foundation digest` and commit `dist/api-digest.md`.

## Local services and database

Integration tests (db, storage, worker, web) and the e2e test need the docker-compose services; `pnpm test` fails with a pointer to `pnpm services:up` when they are down.

```bash
pnpm services:up / services:down      # Postgres on 5433, RustFS (S3) on 9000; host ports avoid a local 5432
pnpm db:migrate / db:migrate:down      # apply / revert the newest migration (DATABASE_URL, default the docker DB)
pnpm db:generate                       # after editing packages/db/src/schema.ts; also write migrations/down/<tag>.sql
pnpm db:seed                           # admin@buildly.test (admin), 3 invites, a project per starter; idempotent
pnpm db:grant-credits <email> <n> [note]   # top-up build credits (admin grant until Stripe, D21)
pnpm --filter @buildly/web dev         # http://localhost:3300 (needs a .env with the local values from .env.example)
pnpm --filter @buildly/web test:e2e    # Playwright against a fresh buildly_e2e database, server on :3310
pnpm --filter @buildly/worker start    # the worker loop
```

- The db scripts and tests never read `.env`: they default to the docker services, so a `DATABASE_URL` pointing at another Postgres cannot be migrated by accident.
- Each db integration test file gets its own database (`createTestDatabase` from `@buildly/db/testing`) and each storage test its own bucket (`@buildly/storage/testing`).
- Handlers in `apps/web/src/server/handlers/` take `Deps`; test them with `createHarness()` (fresh database and bucket, recorded emails, settable clock, `signIn()` for a session cookie; `afterAll(() => h.cleanup())`).
- `tx.rollback()` throws an error named `DrizzleError`; detect it with `isRollback(error)` from `@buildly/db`, not by name.
- In dev, set `EMAIL_PROVIDER_API_KEY=console` and magic links print to the web server log.
- Usage is governed only by plans and top-up build credits (D10, D21); there is no bring-your-own-key. All cap rules live in `packages/shared/src/limits.ts` (`checkBuild` returns who pays: `plan` or `credit`).
