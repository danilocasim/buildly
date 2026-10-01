# Buildly MVP — TODO

Based on [`docs/mobile-app-builder-mvp.md`](../../docs/mobile-app-builder-mvp.md). Names and shapes come from [`ARCHITECTURE.md`](ARCHITECTURE.md). Every task has a **Verify** line; a task is done only when that check passes. Markers: `[ ]` todo, `[~]` in progress, `[x]` verified, `[-]` dropped.

Phase order maps to the six-week plan in brief section 14: Phases 0–2 ≈ week 1, Phases 3–4 ≈ week 2, Phase 5 ≈ week 3, Phase 6 ≈ week 4, Phase 7 ≈ week 5, Phases 8–9 ≈ week 6.

---

## Phase 0 — Repository bootstrap

Goal: an empty but fully wired monorepo where every later slice has a home and CI.

### Slice 0.1 Workspace scaffold

- [x] 0.1.1 Init pnpm workspace with `apps/web`, `apps/worker`, and all `packages/*` from ARCHITECTURE.md §1, each with `package.json`, `tsconfig.json` extending a shared strict base, and an empty `src/index.ts`.
  Verify: `pnpm install && pnpm -r typecheck` exits 0; `pnpm ls -r --depth 0` lists every package.
- [x] 0.1.2 Shared tooling: ESLint + Prettier config at root, Vitest config per package, `pnpm test` runs all.
  Verify: `pnpm lint && pnpm test` exits 0 with at least one placeholder test per package.
- [x] 0.1.3 `packages/shared` with zod, event names file, and a `Result<T, E>` helper.
  Verify: unit test imports `events.ts` and asserts names are unique strings.

### Slice 0.2 Continuous integration

- [x] 0.2.1 GitHub Actions workflow: install, lint, typecheck, unit tests, on PR and main.
  Verify: open a PR with a deliberate lint error and see the check fail; fix and see it pass.
  Verified 2026-09-30 on PR #1: lint-probe run 36722855715 failed at the Lint step (`no-unused-vars` in `packages/db/src/lint-probe.ts`); fix run 36722999362 passed. Push a fix only after the probe run finishes: `cancel-in-progress` cancels the older run on the same branch.
- [x] 0.2.2 Cache pnpm store and `packages/foundation/node_modules` in CI.
  Verify: second CI run of an unchanged lockfile finishes install in under 60 s (read from the job log).
  Verified 2026-09-30 on PR #1: run 36721742630 saved both caches; run 36721786854 hit both caches and `pnpm install --frozen-lockfile` finished in 1.1 s.

### Slice 0.3 Configuration and secrets

- [x] 0.3.1 `.env.example` listing every variable in ARCHITECTURE.md §9 with placeholder values; zod-validated `loadConfig()` in `packages/shared` used by both apps.
  Verify: unit test: missing `OPENAI_API_KEY` throws an error naming the variable; a complete env parses.
- [x] 0.3.2 Secret-leak guard script `scripts/check-no-secrets.ts` that scans a directory for `OPENAI_API_KEY`, the `sk-` key prefix (including `sk-proj-`), and every env name.
  Verify: unit test: a fixture dir containing `sk-abc` fails; a clean dir passes.

---

## Phase 1 — Spikes (gating)

Goal: retire the unknowns before building on them. Details and pass criteria in [`SPIKES.md`](SPIKES.md). **Parallel-ok** with Phase 0.

- [x] 1.1 S2 Snack SDK version and dependency allowlist check.
  Verify: SPIKES.md S2 result recorded; `foundation.json` has `sdkVersion` and resolved versions; DECISIONS.md P2 resolved.
  Verified 2026-09-30: SDK 54.0.0 pinned (D17); all eight dependencies resolve in Snack; an SDK 54 Snack opens in current store Expo Go on iOS and Android.
- [x] 1.2 S1 Snack web preview on the staging domain, plus Expo Go on iOS and Android.
  Verify: SPIKES.md S1 result recorded with browser and device matrix; DECISIONS.md P1 resolved.
  Verified 2026-09-30: web preview fails outside Expo's origin allowlist, resolved as D18 (self-hosted player); Expo Go opens, renders, and persists on Android; iOS persistence is left to 2.2.4; runtime errors do not reach the SDK (see 2.1.1).
- [x] 1.3 S3 OpenAI tool-calling and cost smoke on the flagship, coding, and small candidates.
  Verify: SPIKES.md S3 result recorded with token counts and cost per run; `packages/generator/src/rates.ts` created from the published rates.
  Verified 2026-09-30: 5 runs per model plus one edit, all criteria met (flagship initial mean $0.084, small-model edit $0.0029, 0 JSON errors, cached tokens reported); `rates.ts` from the published Standard rates.
- [x] 1.4 S4 Checker speed with pre-baked `node_modules`.
  Verify: SPIKES.md S4 result recorded; warm check under 15 s.
  Verified 2026-09-30: warm check 1.8 s (arm64) and 3.4 s (emulated amd64) in a 1 vCPU / 2 GB container.
- [x] 1.5 If S1 failed for web: add a "Phase 4b fallback web runner" section to this file with slices for the container image, `expo export --platform web`, and isolated-origin static hosting.
  Verify: section exists or S1 passed.
  Verified 2026-09-30: S1 failed for web; Phase 4b added below Phase 4.

---

## Phase 2 — Foundation, starters, checker

Goal: the one Expo foundation every generated app is built on, three starters as fixtures, and a fast type check.

### Slice 2.1 Foundation app shell

- [x] 2.1.1 `packages/foundation` Expo project pinned to the S2 SDK: `App.tsx` with NavigationContainer, bottom tabs, native stack, `ThemeProvider`, `StatusBar`, and an error boundary plus global error handler that `console.error` runtime errors with file and message (Snack does not report runtime errors to the SDK, SPIKES.md S1).
  Verify: `pnpm --filter foundation typecheck` exits 0; `pnpm --filter foundation test` renders `App` with RNTL without throwing.
  Verified 2026-09-30: `pnpm --filter foundation typecheck` exits 0; `test/app.test.tsx` renders `App` (store opens, Home and About tabs).
- [x] 2.1.2 `src/theme`: tokens from brief §3 mapped to RN values, spacing and type scales, `useTheme()`.
  Verify: unit test snapshot of the token object; a11y contrast check for text on background ≥ 4.5:1 computed in the test.
  Verified 2026-09-30: `test/theme.test.ts` snapshots the tokens and checks 8 text/background pairs at ≥ 4.5:1. White on the brief's orange is 2.96:1, so filled accent buttons use near-black text (`onAccent`) and accent text uses `accentText` (#C2410C); `danger` (#DC2626) is added.
- [x] 2.1.3 Component kit: `Screen`, `Card`, `ListRow`, `Button`, `TextField`, `EmptyState`, `FAB`, each with typed props and a `testID`.
  Verify: RNTL test per component: renders, fires `onPress`/`onChangeText`, respects `disabled`.
  Verified 2026-09-30: `test/components.test.tsx` covers render, press/changeText, and disabled for all seven.
- [x] 2.1.4 About screen with a "Made with Buildly" line controlled by `app.json` extra `showAttribution` (true by default; Phase 6 export toggles it for Pro).
  Verify: RNTL test: attribution visible when flag true, absent when false.
  Verified 2026-09-30: `test/about.test.tsx` (flag true, default, false). `AboutScreen` imports `app.json` directly (Snack loads JSON files as modules), so previews and exports read the same flag.

### Slice 2.2 Typed document store

- [x] 2.2.1 `src/data/store.ts`: `defineCollection<T>()`, `createRepository()` with `list`, `get`, `create`, `update`, `remove`, `search`, backed by AsyncStorage with one key per collection and an in-memory cache.
  Verify: unit tests with `@react-native-async-storage/async-storage/jest/async-storage-mock`: CRUD round-trip; `search` is case-insensitive over declared fields; ids are unique across 1,000 creates.
  Verified 2026-09-30: `test/store.test.tsx` with the AsyncStorage mock: CRUD round-trip, restart persistence, case-insensitive search over declared fields, 1,000 unique ids.
- [x] 2.2.2 `schemaVersion` handling: `openStore({ schemaVersion, seed })` compares the stored version, reseeds on mismatch, and sets a `didReseed` flag for a one-time notice.
  Verify: unit tests: same version keeps data; bumped version reseeds and `didReseed` is true once, false on next open.
  Verified 2026-09-30: same version keeps data; bumped version reseeds with `didReseed` true once, then false; collections dropped by the new schema are wiped.
- [x] 2.2.3 `reset()` and `seed.ts` conventions; demo records carry `isDemo: true` and the UI shows a "Demo data" pill on Home tabs while any demo record exists.
  Verify: unit test: after `reset()` only demo records exist; RNTL test: pill visible with demo data, hidden after all demo records are removed.
  Verified 2026-09-30: after `reset()` only demo records remain; `DemoDataPill` shows with demo data and hides once they are removed.
- [x] 2.2.4 Persistence on device (manual until Detox exists).
  Verify: **manual** in Expo Go: create a record, force-quit, reopen, record is present. Record device and date in this line.
  Verified 2026-10-01: Journal starter on the foundation in store Expo Go, Android (model 2412DPC0AG): created "Device test", force-quit, reopened, entry present; no runtime errors reported. iPhone not tested.

### Slice 2.3 Foundation contract

- [x] 2.3.1 `foundation.json`: `sdkVersion`, `dependencies` allowlist with pinned versions, `layout` rules (writable globs, read-only globs, forbidden files), `smokeChecks` command, `schemaVersionRule` text.
  Verify: unit test validates the file against a zod schema in `packages/shared`; test asserts allowlist keys equal `package.json` dependency keys exactly.
  Verified 2026-09-30: `test/manifest.test.ts` parses it with `foundationManifestSchema` (`packages/shared`), asserts allowlist keys equal `package.json` dependency keys and versions equal the pnpm `foundation` catalog.
- [x] 2.3.2 API digest generator `scripts/build-api-digest.ts` producing `dist/api-digest.md` from exported component props, store signatures, and navigation registration pattern.
  Verify: snapshot test of the digest; CI fails if the digest is stale (`git diff --exit-code` after regenerate).
  Verified 2026-09-30: generator at `packages/foundation/scripts/build-api-digest.ts` (`pnpm --filter foundation digest`); `test/api-digest.test.ts` snapshots it and fails if the committed digest is stale; CI regenerates and runs `git diff --exit-code`.
- [x] 2.3.3 README for exported projects: run steps, folder layout, how demo data and `schemaVersion` work.
  Verify: reviewed against the export acceptance check in 6.3.4.
  Verified 2026-09-30: `packages/foundation/export/README.md` reviewed against 6.3.4's steps (npm install, npx expo start, Expo Go, tsc); a manifest test keeps those steps and the placeholders in it. 6.3.4 exercises it for real.

### Slice 2.4 Starters as fixtures

- [x] 2.4.1 `packages/starters/journal`: Entries, Entry detail, New entry, Tags; models Entry, Tag; seed ≥ 3 entries.
  Verify: assembled with the foundation, `tsc --noEmit` exits 0; RNTL smoke: tabs navigate, create an entry, list shows it, search filters.
  Verified 2026-09-30: `packages/checker/src/starters.test.ts` assembles it on the foundation, `tsc` 0 diagnostics; `packages/starters/test/journal.test.tsx` (tabs, create, list, search, delete).
- [x] 2.4.2 `packages/starters/habit-tracker`: Today, Habits, Habit detail, History; models Habit, CheckIn; streak logic.
  Verify: tsc 0; RNTL smoke: check in today, streak increments, history lists the check-in; unit test for streak across a gap day.
  Verified 2026-09-30: `tsc` 0 via the checker; `test/habit-tracker.test.tsx` (check in, streak 2 → 3, History lists it) plus streak unit tests across a gap day, month ends, and DST.
- [x] 2.4.3 `packages/starters/inventory`: Items, Item detail, Adjust stock, Search; models Item, Adjustment.
  Verify: tsc 0; RNTL smoke: adjust −2 lowers quantity and records an Adjustment; search finds by name.
  Verified 2026-09-30: `tsc` 0 via the checker; `test/inventory.test.tsx` (−2 lowers 24 → 22 and records an Adjustment; below zero refused; search by name).
- [x] 2.4.4 Starter manifest `starters.json` (slug, name, description, thumbnail path, screen names) consumed by the web app.
  Verify: unit test: every slug has a directory, a thumbnail file, and a passing smoke test entry.
  Verified 2026-09-30: `packages/starters/starters.json` validated by `starterManifestSchema`; `test/manifest.test.ts` checks each directory, thumbnail PNG (rendered from the real app on web, see `thumbnails/README.md`), smoke test, and registered screens.
- [~] 2.4.5 Each starter runs in Snack on web and Expo Go.
  Verify: **manual** using the S1 spike page pointed at each starter; note date and devices here.
  Status 2026-10-01: **Expo Go passes** for all three on Android (model 2412DPC0AG, store Expo Go): Journal (create, persist), Habit Tracker (check in, streak 2 → 3, History), Inventory (−2 → 22, search "hdmi"); no runtime errors. Sessions came from `spikes/snack-sdk-check/online.ts` (same files as the spike page). The first run found that Expo Go shares AsyncStorage across Snacks, so the store now scopes keys by `app.json` `expo.slug`. **Snack web is blocked** by the hosted player's origin allowlist (SPIKES.md S1) until the self-hosted player (4b.0.1); each starter already renders on web via `expo export` (thumbnails). iPhone not tested.

### Slice 2.5 Checker

- [x] 2.5.1 `packages/checker`: `assembleProject(foundationFiles, projectFiles, tmpDir)` with symlinked pre-baked `node_modules`; `runTypecheck(tmpDir)` returning `{ ok, diagnostics: [{ file, line, col, code, message }] }`; 60 s timeout; no npm scripts executed.
  Verify: unit tests: clean journal starter → `ok: true`; injected `const x: number = "a"` → one diagnostic with the right file and line; a timeout fixture returns `ok: false, errorCode: 'timeout'`.
  Verified 2026-09-30: `packages/checker/src/index.test.ts`: bare template ok; injected error → one TS2322 diagnostic at the right file and line; 1 ms limit → `timeout`; unsafe or foundation-overriding paths refused. All three starters pass.
- [x] 2.5.2 Normalized diagnostic shape shared with Snack bundle errors (`packages/shared/src/diagnostics.ts`).
  Verify: unit test converts a sample Snack error payload and a tsc diagnostic to the same shape.
  Verified 2026-09-30: `packages/shared/src/diagnostics.test.ts` maps a Snack error payload and a tsc line to the same shape; the foundation's runtime-error log lines parse too.
- [x] 2.5.3 Worker Dockerfile (or host setup script) that pre-installs foundation `node_modules` at build time.
  Verify: container build succeeds; `docker run … pnpm checker:selftest` runs the journal starter check in under 15 s warm.
  Verified 2026-09-30: `apps/worker/Dockerfile` builds (pnpm fetch + offline install); `docker run --cpus=1 --memory=2g buildly-worker pnpm checker:selftest` → journal ok, cold 2.0 s, warm 1.8 s (arm64).

---

## Phase 3 — Platform: database, auth, storage, queue, caps

Goal: the boring parts the generator and UI sit on.

### Slice 3.1 Database

- [x] 3.1.1 Drizzle schema for every table in ARCHITECTURE.md §2, including the partial unique index "one non-terminal generation per project".
  Verify: `pnpm db:migrate` on an empty Postgres (docker-compose service) applies cleanly; `pnpm db:migrate:down` reverts; `drizzle-kit check` reports no drift.
  Verified 2026-10-01: `pnpm db:migrate` on an empty database creates 12 tables and the partial unique index `generations_one_active_per_project`; `pnpm db:migrate:down` leaves 0 tables and 0 enum types; `drizzle-kit check` passes. CI also fails if the schema has changes missing from `migrations/`.
- [x] 3.1.2 Query helpers: `projects.getForUser`, `snapshots.create`, `generations.startExclusive` (fails if one is active), `usage.countBuildsThisMonth`.
  Verify: integration tests against the docker Postgres: `startExclusive` called twice concurrently yields one success and one conflict.
  Verified 2026-10-01: `packages/db/src/queries.test.ts` against docker Postgres; two concurrent `startExclusive` calls yield one success and one `generation_active`.
- [x] 3.1.3 Seed script for local dev: one admin user, three invites, one project per starter.
  Verify: `pnpm db:seed` then `pnpm db:seed` again is idempotent (row counts unchanged).
  Verified 2026-10-01: `pnpm db:seed` twice → 1 user, 3 invites, 3 projects, 3 snapshots both times; `src/seed.test.ts` asserts the same.

### Slice 3.2 Magic-link auth and invites

- [x] 3.2.1 `POST /api/auth/magic-link`: invite gate, token hashed at rest, 15-minute expiry, email sent via provider adapter with a console adapter for dev.
  Verify: integration test: non-invited email → 403 with generic message; invited email → 200 and a `magic_links` row with `used_at` null.
  Verified 2026-10-01: `apps/web/src/server/handlers/auth.test.ts`: not invited → 403 `not_invited`; invited → 200 and a `magic_links` row with `used_at` null and only the token hash stored.
- [x] 3.2.2 `GET /api/auth/callback`: consumes token once, creates `users` row on first login, sets httpOnly secure cookie session.
  Verify: integration test: valid token → 302 to Home with cookie; same token again → 400; expired → 400.
  Verified 2026-10-01: valid token → 302 to `/` with `HttpOnly; Secure; SameSite=Lax` cookie, user created, invite accepted; reuse → 400; after 15 minutes → 400.
- [x] 3.2.3 Session middleware and `GET /api/me`.
  Verify: integration test: no cookie → 401; valid cookie → user JSON without email of other users.
  Verified 2026-10-01: no cookie or a forged one → 401; a valid cookie → own profile and usage only; an expired session → 401. The "middleware" is `requireUser()` in `src/server/session.ts`.
- [x] 3.2.4 Admin flag on users and an `/admin/invites` page to add emails.
  Verify: e2e: non-admin gets 404; admin adds an email and it appears in `invites`.
  Verified 2026-10-01: Playwright `apps/web/e2e/admin-invites.spec.ts` (real Next server, `buildly_e2e` database): anonymous and non-admin → 404; admin adds an email, it shows in the list and in `invites` with `invited_by`. Runs in CI.

### Slice 3.3 Object storage

- [x] 3.3.1 `packages/storage`: `putSnapshot(key, files)`, `getSnapshot(key)`, `putExport(key, zipBuffer)`, `signedDownloadUrl(key, ttl)`; AWS SDK S3 client configured by `STORAGE_REGION` with optional `STORAGE_ENDPOINT` (MinIO in docker-compose for dev); key layout `snapshots/{projectId}/{snapshotId}.json` and `exports/{projectId}/{exportId}.zip` per HOSTING.md §3.
  Verify: integration test against MinIO: round-trip of a 200-file snapshot preserves contents byte-for-byte; signed URL returns 200 then 403 after ttl (use a 2 s ttl); unit test: config with no endpoint targets AWS S3 in the given region.
  Verified 2026-10-01 against RustFS instead of MinIO (D20): 200-file snapshot byte-equal (Unicode, tabs, CRLF); signed URL 200 then 403 after a 2 s ttl; unsigned 403; no endpoint → `buildly-staging.s3.ap-southeast-1.amazonaws.com`.
- [x] 3.3.3 AWS S3 buckets for staging and production per HOSTING.md §3: Block Public Access, default encryption, 7-day lifecycle rule on `exports/`, IAM user per environment limited to its bucket, AWS Budgets alert.
  Verify: with the staging keys, `packages/storage` `putSnapshot` then `getSnapshot` succeeds against `buildly-staging`; the same IAM keys are denied on the other environment's bucket; an unsigned object URL returns 403; the lifecycle rule is listed in both buckets. (The same check from the deployed staging worker is part of 9.1.1's `/api/health`.)
  Status 2026-10-01: buckets `buildly-staging` and `buildly-prod` (ap-southeast-1) with users `buildly-staging-app` / `buildly-prod-app` and a $5 budget scoped by the `project=buildly` cost allocation tag. With the staging keys: `packages/storage` `putSnapshot` → `getSnapshot` byte-equal and a signed URL 200 against `buildly-staging` (SSE-S3); unsigned GET 403 on both buckets; put/get/list on `buildly-prod` AccessDenied; bucket-settings reads AccessDenied. Lifecycle rule `expire-exports` (prefix `exports/`, 7 days) confirmed in both buckets by the founder in the AWS console on 2026-10-01; the app user cannot read bucket config, by design.
- [x] 3.3.2 Snapshot service in `packages/db` + `packages/storage`: `createSnapshot(projectId, files, parentId, generationId?)` writes storage then row; failure in either leaves no orphan row.
  Verify: integration test with a storage stub that throws: no `snapshots` row is inserted.
  Verified 2026-10-01: `packages/db/src/snapshot-service.test.ts`: a throwing storage stub inserts no row; a failed insert deletes the stored object.

### Slice 3.4 Queue and worker skeleton

- [x] 3.4.1 `jobs` claim with `FOR UPDATE SKIP LOCKED`, heartbeat every 10 s, stale lock (no heartbeat 30 s) requeued once then failed.
  Verify: integration tests: 5 workers, 1 job → exactly one claim; a job whose worker stops heartbeating is requeued; second stale → failed.
  Verified 2026-10-01: `packages/db/src/jobs.test.ts`: 5 concurrent claimers → one claim; stale job requeued, stale again → failed; the old worker can no longer heartbeat or complete it.
- [x] 3.4.2 `apps/worker` main loop with graceful shutdown (finish current job, up to 30 s) and structured JSON logs with `generation_id`.
  Verify: run worker, enqueue a sleep job, send SIGTERM; log shows job completed then exit 0.
  Verified 2026-10-01: `apps/worker/src/main.test.ts` spawns the real entry point, enqueues a 1.5 s sleep job, sends SIGTERM: logs show `job completed` after `shutdown requested`, then `worker stopped`, exit 0. Log lines are JSON with `worker_id`, `job_id`, and `generation_id`.
- [x] 3.4.3 Cancellation: `jobs.cancel_requested` flag polled by the running job every step; `POST /api/generations/:id/cancel` sets it.
  Verify: integration test: cancel during a fake 3-step job → status `cancelled`, later steps not executed.
  Verified 2026-10-01: `apps/worker/src/worker.test.ts`: cancel during step one of a 3-step job → job `cancelled`, steps two and three never run; `POST /api/generations/:id/cancel` sets the flag and records `build.cancelled` (`builds.test.ts`).
- [x] 3.4.4 Hard timeout of 4 minutes per generation job.
  Verify: unit test with fake timers: job exceeding 240 s → `timed_out`, cleanup called.
  Verified 2026-10-01: `apps/worker/src/runner.test.ts` with fake timers: nothing at 239.999 s; at 240 s → `timed_out`, signal aborted, cleanup called.

### Slice 3.5 Usage caps and rate limits

- [x] 3.5.1 Cap rules in `packages/shared/src/limits.ts`: Free 15 builds/month, 2 projects, 10 builds/hour; Pro 200/month, unlimited projects; concurrent builds Free 1 / Pro 2; per-project one active build. Usage is governed only by the plan and top-up build credits (3.5.3, D10, D21).
  Verify: unit table test covering every rule and boundary (15th build ok, 16th blocked; month rollover).
  Verified 2026-10-01: `packages/shared/src/limits.test.ts` table: 15th build ok / 16th blocked, 10th/11th in an hour (Free only), Pro 200/201, concurrent builds (Free 1, Pro 2), one active build per project, project cap, and UTC month rollover including December → January.
- [x] 3.5.2 Enforcement in `POST /api/projects/:id/messages` and `POST /api/projects` returning 429/403 with `{ code, message, resetAt }`; worker re-checks on claim.
  Verify: integration test: 16th build in a month → 429 `monthly_builds`; `cap.hit` analytics row written.
  Verified 2026-10-01: `builds.test.ts`: 16th build in a month → 429 `monthly_builds` with `resetAt` 2026-11-01 and a `cap.hit` row; 11th in an hour → 429 `hourly_builds`; third Free project → 403 `projects`. The worker re-check is `recheckBuildCaps` (`packages/db/src/caps.ts`, tested); the generation job handler calls it first (TODO 4.4.1).
- [x] 3.5.3 Top-up build credits (brief §13, D21): a `build_credits` ledger (grants and top-ups add, each build past the plan's monthly allowance spends one, credits never expire); `checkBuild` allows a build while allowance or credits remain and reports which pays; the credit is spent in the build's transaction with the user row locked; `/api/me` shows the balance; `pnpm db:grant-credits` for admin grants until Stripe (D11).
  Verify: unit table: allowance first, then credits, and credits do not bypass the Free hourly limit; integration: 16th build with a credit → 202 and balance −1, then 429; two builds racing for the last credit → exactly one spends it.
  Verified 2026-10-01: `packages/shared/src/limits.test.ts` ("who pays" and credit rows); `packages/db/src/credits.test.ts` (grant/spend/stop at zero, the race); `apps/web/src/server/handlers/builds.test.ts` (16th build paid by credit → 202 `paidBy: credit`, then 429 `monthly_builds`); the worker re-check accepts credit-paid builds (`caps.test.ts`).

---

## Phase 4 — Generation engine

Goal: prompt in, verified snapshot out, with bounded repair and exact cost accounting.

### Slice 4.1 Provider client

- [x] 4.1.1 `packages/generator/src/provider.ts`: a `Provider` interface plus an OpenAI implementation on the official `openai` SDK; streaming with strict function tools; optional base URL; retries on 429/5xx with jitter (max 3), honoring rate-limit reset headers; usage capture including cached tokens.
  Verify: unit tests with recorded HTTP fixtures (msw): streams deltas in order; parses two parallel tool calls; retries then succeeds; surfaces a 401 as a non-retryable error.
  Verified 2026-10-01: `packages/generator/src/provider.test.ts` with msw replaying real streams recorded from gpt-6-luna (`scripts/record-fixtures.ts`): text deltas in recorded order with usage (incl. cached tokens); two parallel `read_file` calls parsed; 429 (`x-ratelimit-reset-requests: 2s`) then 500 then success with waits of 2000 and 500 ms; a recorded 401 → `ProviderError` `auth`, not retried; persistent 503 gives up after 3 retries. Requests use strict tools and `store: false`.
- [x] 4.1.2 `rates.ts` and `costFor(usage, model)` with Standard rates for every configured model.
  Verify: unit test: known usage → expected USD to 6 decimals for `gpt-6.1-sol`, `gpt-5.3-codex`, and `gpt-6-luna`; unknown model throws.
  Verified 2026-10-01: `src/rates.test.ts`: hand-computed costs to 6 decimals for all three models (cache writes billed at input on `gpt-5.3-codex`, which has no cache-write price); reproduces S3's recorded $0.0964; unknown model throws.
- [~] 4.1.3 Model routing: plans and initial builds use `GENERATION_MODEL_PLAN`; follow-up edits and all repairs use `GENERATION_MODEL_EDIT`; the model used is stored on `generations.model`.
  Verify: unit test with a fake provider: an initial build calls the plan model; a follow-up edit and its repair call the edit model; `generations.model` matches.
  Status 2026-10-01: `src/routing.ts` (`modelFor`, `primaryModel`, `modelsFromConfig` rejecting unrated models at startup) with unit tests. The Verify (fake provider through a run, `generations.model`) completes with `runGeneration` in slice 4.4.

### Slice 4.2 Tool layer

- [ ] 4.2.1 In-memory `ProjectFiles` with `list/read/write/delete` and a change log.
  Verify: unit tests: write then read; delete then list; change log records every mutation.
- [ ] 4.2.2 Validation per ARCHITECTURE.md §4: layout globs, forbidden files, path traversal, 64 KB cap, import allowlist scan, rejection budget of 10; a `read_file` of a missing project file returns "not found" without spending the budget (SPIKES.md S3).
  Verify: unit tests: `../secrets`, `package.json`, `src/data/store.ts`, an import of `react-native-maps`, a 65 KB file → each rejected with a distinct reason; 11th rejection fails the run.
- [ ] 4.2.3 `finish` tool captures `summary` and `screens[]`; screens validated against files that register a route.
  Verify: unit test: a screen name without a matching route file is dropped with a warning.

### Slice 4.3 Context builder

- [ ] 4.3.1 Build messages in the order of ARCHITECTURE.md §5 with the API digest and `foundation.json` rules; deterministic byte-identical prefix across turns.
  Verify: snapshot test of the built context for the journal starter; test asserts the first three messages are identical between turn 1 and turn 2.
- [ ] 4.3.2 Token budget: estimate with a tokenizer; summarize history beyond 20 messages; fail fast with `context_too_large` above 80k.
  Verify: unit tests: 25-message history yields a summary message; an oversized project triggers the error.

### Slice 4.4 Generation loop

- [ ] 4.4.1 State machine per ARCHITECTURE.md §3 implemented as `runGeneration(ctx)` with injectable provider, checker, snack, snapshot store, and clock; registered as the worker's `generation` job handler, which first calls `recheckBuildCaps` (TODO 3.5.2) and fails the generation with the cap code if it is over.
  Verify: unit tests with fakes: happy path writes steps `plan, edit, typecheck, bundle, snapshot` and status `succeeded`.
- [ ] 4.4.2 Repair path: typecheck or bundle failure returns diagnostics to the model; max 2 repairs; then `failed` with `error_detail` containing the last diagnostics.
  Verify: unit tests: fail-fail-pass → succeeded with `repair_attempts = 2`; fail-fail-fail → `failed`, `projects.current_snapshot_id` unchanged.
- [ ] 4.4.3 Cancel and timeout wired to 3.4.3 and 3.4.4.
  Verify: unit tests: cancel during `editing` → `cancelled`, no snapshot; clock jump past 240 s → `timed_out`.
- [ ] 4.4.4 Progress events published to a per-project channel (Postgres LISTEN/NOTIFY or a polling table) for the SSE route.
  Verify: integration test: run a fake generation; a subscriber receives `plan ready`, `files written`, `types checked`, `preview bundled` in order and nothing before each step's completion.
- [ ] 4.4.5 Cost and token accounting written to `generations` on every terminal state, and `build.*` analytics events emitted.
  Verify: integration test: after a fake run, `generations.cost_usd` equals `costFor()` of summed usage; `build.finished` event row exists.

### Slice 4.5 Snack session manager

- [ ] 4.5.1 `packages/snack`: `ensureSession(project)`, `pushFiles(session, files)`, `awaitBundle(session, timeoutMs)` returning normalized diagnostics, `getUrls(session)` → `{ webPreviewURL, expoGoUrl }`.
  Verify: unit tests with a mocked `snack-sdk`: pushFiles sends foundation + project files and pinned dependencies only; a bundle error resolves to a diagnostic with file and message; timeout → `bundle_timeout`.
- [ ] 4.5.2 Live integration test (tagged `@snack`, skipped in CI by default) that creates a session with the journal starter and asserts a bundle success.
  Verify: `pnpm test --tag snack` passes locally; result and date noted here.

### Slice 4.6 Snapshots and restore

- [ ] 4.6.1 On `succeeded`: create snapshot with `parent = base`, set `projects.current_snapshot_id`, push to Snack.
  Verify: integration test: two sequential fake builds produce a parent chain of length 2.
- [ ] 4.6.2 `POST /api/projects/:id/snapshots/:sid/restore`: creates a new snapshot whose files equal the target, sets it current, pushes to Snack; blocked while a build is active.
  Verify: integration test: restore → new row, files byte-equal to target, 409 if a generation is active.

### Slice 4.7 Evaluation harness

- [ ] 4.7.1 `packages/eval` CLI per EVAL.md: task loader, runner using the real generation loop against a temp Postgres and real providers, JSON output.
  Verify: `pnpm eval --tasks smoke --runs 1 --dry-run` with a fake provider produces a report with T1, T4, T7 rows.
- [ ] 4.7.2 Task checks for T1–T10 implemented as functions over the resulting files and run status, reusing starter smoke tests.
  Verify: unit test per check with a passing and a failing fixture.
- [ ] 4.7.3 `pnpm eval:report` markdown table with the EVAL.md thresholds and pass/fail flags.
  Verify: run on the dry-run JSON; table renders with threshold columns.
- [ ] 4.7.4 Nightly CI job running `--tasks smoke` against the configured model with the real API key, posting the JSON to storage.
  Verify: one nightly run visible in Actions with an uploaded artifact.

---

## Phase 4b — Fallback web runner

Goal: a web preview Buildly controls, because Snack's hosted web player refuses non-allowlisted origins (SPIKES.md S1). Expo Go previews stay on Snack. D18 picks slice 4b.0; slices 4b.1–4b.3 are the fallback if 4b.0 cannot be built or kept current.

### Slice 4b.0 Self-hosted Snack web player (chosen, D18)

- [ ] 4b.0.1 Build the open-source Snack web player (expo/snack `runtime`, web target) for the pinned SDK with Buildly's preview origins added to `allowedOrigins`; host it on its own registrable domain (never the app's), no cookies; pass it as `webPlayerURL`. Document the per-SDK rebuild.
  Verify: the S1 spike page on the staging domain renders the journal starter through the self-hosted player; a page on another origin gets no messages.

### Slice 4b.1 Runner container image (fallback)

- [ ] 4b.1.1 Container image with Node 22 and the pre-baked foundation `node_modules` (shared with TODO 2.5.3) that takes a snapshot's files as input and produces a static web build; no network access during the build; CPU, memory, and 120 s time limits.
  Verify: `docker run` with the journal starter snapshot outputs `dist/index.html` within the time limit; a build that tries to reach the network fails.

### Slice 4b.2 `expo export --platform web` (fallback)

- [ ] 4b.2.1 Worker `bundling` step for web runs `npx expo export --platform web` inside the runner container on the assembled project and maps Metro errors to the normalized diagnostic shape (TODO 2.5.2).
  Verify: integration test: journal starter → export succeeds; an injected syntax error → one diagnostic with file and line; the build never runs npm scripts from the project.

### Slice 4b.3 Isolated-origin static hosting (fallback)

- [ ] 4b.3.1 Upload each export to storage under `previews/{projectId}/{snapshotId}/` and serve it from a dedicated preview origin (separate registrable domain, no cookies, strict CSP) that the workspace iframe loads with `sandbox="allow-scripts"`.
  Verify: e2e: the workspace iframe renders the export; the preview origin cannot read the app's cookies or call its API (checked with a fixture that tries).

---

## Phase 5 — Web app: workspace

Goal: the main editing experience against a real generation stream. Gated by S1.

### Slice 5.1 App shell and design system

- [ ] 5.1.1 Next.js app with the brief §3 tokens as CSS variables, base typography, and a sidebar layout (Home, Starters, Settings) that collapses to a drawer under 1024 px.
  Verify: Playwright: at 1280 px the sidebar is visible; at 768 px it is hidden and the drawer opens from the menu button; axe scan reports no serious violations.
- [ ] 5.1.2 Auth pages: enter email, "check your inbox", error states; redirect to Home after callback.
  Verify: e2e with the console email adapter: full sign-in flow lands on Home.

### Slice 5.2 Chat panel

- [ ] 5.2.1 `GET /api/projects/:id/stream` SSE endpoint relaying 4.4.4 events and assistant message deltas; reconnect with `Last-Event-ID`.
  Verify: integration test: client disconnects mid-run and reconnects; no events are lost or duplicated.
- [ ] 5.2.2 Chat UI: message list, streamed assistant plan, progress steps (`Plan ready`, `Files written`, `Types checked`, `Preview bundled`) that only turn green on server events, subtle "OpenAI" label near the composer.
  Verify: e2e with a fake provider: steps appear in order and never before the server event; a run that fails at typecheck shows the failure reason and keeps the previous preview.
- [ ] 5.2.3 Composer disabled during an active run; Cancel button visible; cancel keeps the last snapshot.
  Verify: e2e: click Cancel mid-run → status "Cancelled", preview unchanged, composer re-enabled.
- [ ] 5.2.4 Cap and error handling: 429 shows the reason and `resetAt`; the prompt text is preserved.
  Verify: e2e: exceed the hourly cap → inline message, textarea still contains the prompt.

### Slice 5.3 Preview panel

- [ ] 5.3.1 Web player iframe (the self-hosted player from 4b.0.1, D18) inside a phone frame, wired through the SDK web preview reference; CSP `frame-src` limited to the player origin; label "Web preview".
  Verify: e2e (tagged `@snack`): iframe `src` equals the session `webPreviewURL` on the player origin; any other `src` is blocked by CSP (checked via console error).
- [ ] 5.3.2 Two viewport presets (small and large phone), build status chip, Refresh, Reset demo data (posts a message the foundation listens for, or reloads with a `reset=1` param).
  Verify: e2e: preset toggles the frame dimensions; Reset triggers `preview.reset_demo_data` event; **manual**: demo pill reappears after reset.
- [ ] 5.3.3 Browser and phone verification shown separately: "Web: bundled ✓ / Phone: not verified" until the user opens the QR modal.
  Verify: e2e: after a successful build the two statuses render with distinct values.

### Slice 5.4 Open on phone

- [ ] 5.4.1 Modal with QR of the Expo Go `url`, Expo Go install links, and the one-line note about internet access; emits `preview.phone_opened`.
  Verify: unit test decodes the rendered QR (jsQR) to the session URL; e2e: opening the modal writes the analytics row.
- [ ] 5.4.2 Starter opens in Expo Go from the workspace QR.
  Verify: **manual** on iOS and Android; note date and devices here.

### Slice 5.5 Code tab

- [ ] 5.5.1 Read-only file tree from the current snapshot and a syntax-highlighted viewer (Shiki or Prism), foundation files shown collapsed under a "Foundation (read-only)" group.
  Verify: e2e: tree lists every project file in the snapshot; clicking a file shows its contents; no editable inputs exist.

### Slice 5.6 Screen list

- [ ] 5.6.1 Derive screens from the `finish` tool output stored on the generation, falling back to route registrations in files; collapsible panel.
  Verify: unit test: journal starter yields Entries, Entry detail, New entry, Tags; e2e: panel collapses under 1024 px.

### Slice 5.7 Toolbar

- [ ] 5.7.1 Back, app icon, inline-editable name (PATCH on blur), "Expo + TypeScript" badge, Open on phone, Export code.
  Verify: e2e: rename persists after reload; Export triggers 6.3.
- [ ] 5.7.2 Snapshot history drawer with Restore.
  Verify: e2e: after two builds, history shows two entries; Restore of the first refreshes the code tab to its files.

---

## Phase 6 — Web app: home, starters, settings, export

### Slice 6.1 Home

- [ ] 6.1.1 Heading "What mobile app will you build?", composer with placeholder "Describe your mobile app...", starter chip at lower left, "Build app" at lower right.
  Verify: e2e: empty prompt → button disabled; select starter → enabled with empty prompt; chip removable.
- [ ] 6.1.2 Submit creates a project and enqueues the first build, then routes to the workspace with the stream already open.
  Verify: e2e with fake provider: first step appears within 2 s of landing.
- [ ] 6.1.3 Recent apps grid (icon, name, updated time, overflow menu with Rename and Archive); empty-state invitation for new users.
  Verify: e2e: new user sees the invitation; after creating a project the grid shows it.
- [ ] 6.1.4 Prompt preserved on any error before navigation.
  Verify: e2e: force a 500 on create → error toast, textarea unchanged.

### Slice 6.2 Starters

- [ ] 6.2.1 Starter cards on Home from `starters.json` with thumbnail, description, and Use starter; reserved `/starters` route rendering the same list.
  Verify: e2e: three cards render with images; `/starters` responds 200.
- [ ] 6.2.2 Use starter creates the project from the fixture files with an initial snapshot and no build consumed.
  Verify: integration test: `usage_events` count unchanged; snapshot files equal the fixture; workspace preview loads without a generation row.

### Slice 6.3 Export

- [ ] 6.3.1 `packages/exporter`: assemble foundation + project files, `package.json` with pinned deps, `app.json` with the project name, README from 2.3.3, attribution flag by plan; produce a ZIP.
  Verify: unit test: ZIP entries match the expected set; Free plan README contains "Made with Buildly", Pro does not.
- [ ] 6.3.2 `POST /api/projects/:id/export` stores the ZIP and returns a signed URL; emits `export.created`.
  Verify: integration test: response URL downloads a ZIP whose size matches `zip_bytes` in the event.
- [ ] 6.3.3 Secret guard on every export using 0.3.2.
  Verify: CI test unzips a generated export and runs the guard; a fixture containing a key fails the build.
- [ ] 6.3.4 Exported project runs outside Buildly.
  Verify: CI job: unzip, `npm ci`, `npx tsc --noEmit` exit 0; **manual** on a clean machine: `npx expo start` and open in Expo Go following only the README.

### Slice 6.4 Settings

- [ ] 6.4.1 Display name, plan, builds used this month against cap, Sign out.
  Verify: e2e: name change persists; usage matches `usage.countBuildsThisMonth`; sign out clears the cookie and `GET /api/me` → 401.

---

## Phase 7 — Metrics, security, tuning

### Slice 7.1 Instrumentation

- [ ] 7.1.1 Every event in METRICS.md emitted from the listed component with typed props.
  Verify: unit test per emitter; integration test that a full fake build produces `build.started`, ≥ 4 `build.step`, `build.finished`.
- [ ] 7.1.2 `/admin/metrics` page computing the METRICS.md formulas for 7 and 30 days plus the last nightly eval.
  Verify: integration test seeds events and asserts H1, H2, H3 values; e2e: non-admin → 404.
- [ ] 7.1.3 Weekly report script writing `.plan/mvp/reports/YYYY-WW.md`.
  Verify: run once locally against seeded data and commit the sample.

### Slice 7.2 Security and abuse

- [ ] 7.2.1 Client bundle secret scan in CI on `apps/web/.next` using 0.3.2.
  Verify: CI step passes; injecting `process.env.OPENAI_API_KEY` into a client component fails the build.
- [ ] 7.2.2 Security headers: CSP with the web player origin as the only `frame-src`, `frame-ancestors 'none'`, HSTS, cookie `SameSite=Lax` `Secure` `HttpOnly`.
  Verify: integration test asserts headers on `/` and the workspace route.
- [ ] 7.2.3 Rate limit on magic-link requests (5 per email per hour) and on API routes by session.
  Verify: integration test: 6th request → 429.
- [ ] 7.2.4 One Free account per email and email verification by construction of magic links; duplicate `users.email` rejected.
  Verify: unique index test.

### Slice 7.3 Model selection and tuning

- [ ] 7.3.1 Run EVAL.md E1 (`--runs 3`, each candidate model, all tasks) and record P3 and P5 in DECISIONS.md.
  Verify: report files committed under `.eval/`; DECISIONS.md P3 and P5 resolved; the report shows blended cost per build against the $0.04 guardrail.
- [ ] 7.3.2 Tune system prompt, API digest, and tool error messages until EVAL.md thresholds are met on the chosen config.
  Verify: `pnpm eval --tasks all --runs 1` report shows H1 ≥ 70%, H2 ≥ 80%, T9 100%.
- [ ] 7.3.3 Failure explanations: map `error_code` to user-facing copy (typecheck, bundle, timeout, cancelled, context too large, dependency not allowed).
  Verify: unit test covers every code; e2e shows the copy for a forced typecheck failure.

---

## Phase 8 — Acceptance criteria (brief §12)

Check each only with the evidence named.

- [ ] 8.1 Prompt or starter → workspace with a live preview from the generated project. Evidence: 6.1.2, 6.2.2, 5.3.1.
- [ ] 8.2 Each starter's navigation and CRUD work on web and Expo Go. Evidence: 2.4.1–2.4.3 smoke tests and 2.4.5 manual.
- [ ] 8.3 Records survive app restart in Expo Go. Evidence: 2.2.4 manual.
- [ ] 8.4 Add-a-screen edit passes without breaking existing screens. Evidence: EVAL T4 pass in 7.3.2.
- [ ] 8.5 Data-model change bumps `schemaVersion` and reseeds with a notice. Evidence: EVAL T5 plus 2.2.2.
- [ ] 8.6 Failed build keeps the last snapshot and explains why. Evidence: 4.4.2, 5.2.2, 7.3.3.
- [ ] 8.7 Restore swaps source and refreshes preview. Evidence: 4.6.2, 5.7.2.
- [ ] 8.8 Export runs with `npm install && npx expo start` on a clean machine. Evidence: 6.3.4.
- [ ] 8.9 Web and phone verification reported separately. Evidence: 5.3.3.
- [ ] 8.10 No OpenAI credentials in client code, Snack sessions, or exports. Evidence: 7.2.1, 6.3.3, 4.5.1 (files sent assertion).
- [ ] 8.11 Metrics recorded for every generation. Evidence: 7.1.1.

---

## Phase 9 — Beta

### Slice 9.1 Environments and runbook

- [ ] 9.1.1 Staging and production per HOSTING.md: Railway project with `web`, `worker` (≥ 2 GB memory), and Postgres in Singapore; S3 buckets from 3.3.3; Resend domain verified; Cloudflare DNS for `app.` and `staging.`; Sentry DSNs; variables set per HOSTING.md §4.
  Verify: `GET /api/health` on both returns db, storage, and worker heartbeat ok; a magic-link email arrives from the production domain; Railway and AWS billing alerts are configured.
- [ ] 9.1.2 Runbook `RUNBOOK.md` in this folder: deploy, rollback, rotate the OpenAI key, requeue a stuck job, restore a project snapshot by SQL.
  Verify: a second person performs a rollback on staging using only the runbook.
- [ ] 9.1.3 Error alerting: worker exceptions and generation `failed` rate above 50% in an hour page the founder.
  Verify: trigger a fake alert on staging and receive it.

### Slice 9.2 Beta cohort

- [ ] 9.2.1 Invite ten developers and indie builders; each gets the Free plan plus 35 top-up credits (`pnpm db:grant-credits <email> 35 beta`), so 50 builds in the first month.
  Verify: ten `invites` rows accepted.
- [ ] 9.2.2 Feedback capture: an in-app "Report a problem" link that attaches `generation_id`, plus a weekly 20-minute call with three users.
  Verify: at least one report received through the link.
- [ ] 9.2.3 Weekly metrics review against brief §1 targets for two weeks; write `reports/beta-review.md` with a go/no-go on investing in the `expo export` fallback runner, billing, and public launch.
  Verify: the review file exists and names a decision.

---

## Post-MVP backlog (not scheduled)

- Billing: Stripe Checkout, customer portal, plan sync to `users.plan`, top-up purchases that write `topup` rows to the existing credits ledger (3.5.3, D21), attribution toggle by plan (brief §13).
- Fallback web runner if Snack becomes unreliable (brief §8).
- Real data migrations in the foundation store (brief §7).
- Editable code panel; theme controls; more starters; a second foundation.
- Team plans and seats after 100 Pro subscribers.
