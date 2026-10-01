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
- [x] 2.4.5 Each starter runs in Snack on web and Expo Go.
  Verify: **manual** using the S1 spike page pointed at each starter; note date and devices here.
  Status 2026-10-01: **Expo Go passes** for all three on Android (model 2412DPC0AG, store Expo Go): Journal (create, persist), Habit Tracker (check in, streak 2 → 3, History), Inventory (−2 → 22, search "hdmi"); no runtime errors. Sessions came from `spikes/snack-sdk-check/online.ts` (same files as the spike page). The first run found that Expo Go shares AsyncStorage across Snacks, so the store now scopes keys by `app.json` `expo.slug`. **Snack web passes** for all three through the self-hosted player (4b.0.1, 2026-10-01, headless Chromium on the quick-tunnel origin: each starter's web client connected and stayed `ok`; the journal's Entries list rendered). iPhone not tested.
  Marked verified 2026-10-02 (Phase 8 audit): both halves of the Verify ran with date and device recorded, and the brief (§12) requires web and Expo Go, not a specific phone OS. An iPhone run remains a beta check.

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
  Verified 2026-10-01: valid token → 302 to `/` with `HttpOnly; Secure; SameSite=Lax` cookie, user created, invite accepted; reuse → 400; after 15 minutes → 400. Changed in 5.1.2 (2026-10-01): an invalid, used, or expired link now answers 302 to `/sign-in?error=invalid_link` (no cookie) so the sign-in page shows the error state; the tests assert that instead of 400.
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
- [x] 4.1.3 Model routing: plans and initial builds use `GENERATION_MODEL_PLAN`; follow-up edits and all repairs use `GENERATION_MODEL_EDIT`; the model used is stored on `generations.model`.
  Verify: unit test with a fake provider: an initial build calls the plan model; a follow-up edit and its repair call the edit model; `generations.model` matches.
  Verified 2026-10-01: `src/routing.ts` plus `src/run.test.ts` with a scripted provider: an initial build calls `gpt-6.1-sol` for its plan and build turns and `gpt-6-luna` for its repair; a follow-up edit and its repair call only `gpt-6-luna`; `RunResult.model` (written to `generations.model`) is the plan model for initial builds and the edit model for edits, checked against the database in the worker test.

### Slice 4.2 Tool layer

- [x] 4.2.1 In-memory `ProjectFiles` with `list/read/write/delete` and a change log.
  Verify: unit tests: write then read; delete then list; change log records every mutation.
  Verified 2026-10-01: `packages/generator/src/tools/project-files.test.ts`: write then read; delete then list; the change log records each write (created or not, bytes) and delete in order, and nothing for a no-op delete.
- [x] 4.2.2 Validation per ARCHITECTURE.md §4: layout globs, forbidden files, path traversal, 64 KB cap, import allowlist scan, rejection budget of 10; a `read_file` of a missing project file returns "not found" without spending the budget (SPIKES.md S3).
  Verify: unit tests: `../secrets`, `package.json`, `src/data/store.ts`, an import of `react-native-maps`, a 65 KB file → each rejected with a distinct reason; 11th rejection fails the run.
  Verified 2026-10-01: `src/tools/executor.test.ts` against the real `foundation.json` and journal files: `../secrets` → `path_traversal`, `package.json` → `forbidden_file`, `src/data/store.ts` → `read_only`, a `react-native-maps` import → `import_not_allowed`, a 65 KB file → `too_large`, nothing written; the 11th rejection throws `RejectionBudgetExceeded`; reading or deleting a missing file returns "not found" without spending budget. `app.json` is read-only to the model (the app name comes from the project name).
- [x] 4.2.3 `finish` tool captures `summary` and `screens[]`; screens validated against files that register a route.
  Verify: unit test: a screen name without a matching route file is dropped with a warning.
  Verified 2026-10-01: `finish` with "Settings" on the journal starter keeps Entries, Entry detail, New entry, Tags and drops Settings with a warning; routes are read from `<X.Screen name="…">` in `src/navigation.tsx`.

### Slice 4.3 Context builder

- [x] 4.3.1 Build messages in the order of ARCHITECTURE.md §5 with the API digest and `foundation.json` rules; deterministic byte-identical prefix across turns.
  Verify: snapshot test of the built context for the journal starter; test asserts the first three messages are identical between turn 1 and turn 2.
  Verified 2026-10-01: `packages/generator/src/context.test.ts`: snapshot of the journal starter context (system prompt with `foundation.json` rules, API digest, files, user message); the first three messages, and the provider `instructions` plus first two input items, are byte-identical between turn 1 and turn 2 even after the model edits a file (edits travel as tool results). The journal context is about 5,600 tokens.
- [x] 4.3.2 Token budget: estimate with a tokenizer; summarize history beyond 20 messages; fail fast with `context_too_large` above 80k.
  Verify: unit tests: 25-message history yields a summary message; an oversized project triggers the error.
  Verified 2026-10-01: `gpt-tokenizer` (o200k_base) estimate; a 25-message history keeps the last 20 and folds the first 5 into one summary message; a 40-file oversized project throws `ContextTooLargeError` (`context_too_large`) above 80k.

### Slice 4.4 Generation loop

- [x] 4.4.1 State machine per ARCHITECTURE.md §3 implemented as `runGeneration(ctx)` with injectable provider, checker, snack, snapshot store, and clock; registered as the worker's `generation` job handler, which first calls `recheckBuildCaps` (TODO 3.5.2) and fails the generation with the cap code if it is over.
  Verify: unit tests with fakes: happy path writes steps `plan, edit, typecheck, bundle, snapshot` and status `succeeded`.
  Verified 2026-10-01: `packages/generator/src/run.ts` `runGeneration` with injectable provider, typecheck, bundle, store, events, clock, and cancellation; `run.test.ts` happy path records steps plan, edit, typecheck, bundle, snapshot and ends `succeeded`, with a byte-identical prefix on every turn. The worker's `generation` handler (`apps/worker/src/handlers/generation.ts`) calls `recheckBuildCaps` first (over cap → `failed` with the cap code, no model call); it is registered in `main.ts` with the real Snack bundler in slice 4.5.
- [x] 4.4.2 Repair path: typecheck or bundle failure returns diagnostics to the model; max 2 repairs; then `failed` with `error_detail` containing the last diagnostics.
  Verify: unit tests: fail-fail-pass → succeeded with `repair_attempts = 2`; fail-fail-fail → `failed`, `projects.current_snapshot_id` unchanged.
  Verified 2026-10-01: fail, fail, pass → `succeeded` with `repairAttempts` 2 and the diagnostics sent back to the model; fail ×3 → `failed`, `errorCode` `typecheck`, `errorDetail` holds the last diagnostics, no snapshot and the current snapshot untouched; a bundle failure repairs the same way.
- [x] 4.4.3 Cancel and timeout wired to 3.4.3 and 3.4.4.
  Verify: unit tests: cancel during `editing` → `cancelled`, no snapshot; clock jump past 240 s → `timed_out`.
  Verified 2026-10-01: cancel during editing → `cancelled`, no snapshot, only the plan step recorded; a clock jump past 240 s → `timed_out`; an aborted signal (the worker's hard limit, 3.4.4) → `timed_out`. Cancellation reaches the run through `JobContext.isCancelRequested` (3.4.3).
- [x] 4.4.4 Progress events published to a per-project channel (Postgres LISTEN/NOTIFY or a polling table) for the SSE route.
  Verify: integration test: run a fake generation; a subscriber receives `plan ready`, `files written`, `types checked`, `preview bundled` in order and nothing before each step's completion.
  Verified 2026-10-01: `project_events` table (migration 0002) plus `pg_notify` in the same transaction (`packages/db/src/events.ts`); `apps/worker/src/handlers/generation.test.ts` subscribes with LISTEN and, with the checker and bundler gated, sees nothing past `files_written` while type checking runs and nothing past `types_checked` while bundling runs; final order plan_ready, files_written, types_checked, preview_bundled, snapshot_created, finished, each written after its step row. Assistant text deltas are NOTIFY-only.
- [x] 4.4.5 Cost and token accounting written to `generations` on every terminal state, and `build.*` analytics events emitted.
  Verify: integration test: after a fake run, `generations.cost_usd` equals `costFor()` of summed usage; `build.finished` event row exists.
  Verified 2026-10-01: after a run, `generations.cost_usd` equals `costFor()` of the summed usage (per model when repairs use the edit model), tokens and model are set, and `build.started`, ≥ 4 `build.step`, and `build.finished` (with cost and tokens) rows exist.

### Slice 4.5 Snack session manager

- [x] 4.5.1 `packages/snack`: `ensureSession(project)`, `pushFiles(session, files)`, `awaitBundle(session, timeoutMs)` returning normalized diagnostics, `getUrls(session)` → `{ webPreviewURL, expoGoUrl }`.
  Verify: unit tests with a mocked `snack-sdk`: pushFiles sends foundation + project files and pinned dependencies only; a bundle error resolves to a diagnostic with file and message; timeout → `bundle_timeout`.
  Verified 2026-10-01: `packages/snack/src/index.ts` `createSnackManager` (plus `checkBundle(project, files, timeoutMs)`, a throwaway offline session the generation's bundle step uses so a failing build never touches the live preview). `src/index.test.ts`, 7 passed with a fake `snack-sdk`: pushFiles sends exactly foundation + project files + `app.json` (unique slug) and the pinned dependencies minus react/react-native/expo; stale files are removed; a client error becomes a diagnostic with file, line and message; dependency failures and runtime-error log lines become diagnostics; timeout → `bundle_timeout`. The worker registers the `generation` handler in `apps/worker/src/main.ts` with the OpenAI provider, the checker, and `checkBundle`. Snack transforms code on the client, so with no client connected the worker check covers upload and dependency resolution; tsc covers syntax and types (ARCHITECTURE.md §6).
- [x] 4.5.2 Live integration test (tagged `@snack`, skipped in CI by default) that creates a session with the journal starter and asserts a bundle success.
  Verify: `pnpm test:snack` passes locally; result and date noted here.
  Verified 2026-10-01: `pnpm test:snack` (`SNACK_LIVE=1`, `src/snack.live.test.ts`, skipped by `pnpm test` and CI) passed: a live session with the journal starter reached a bundle success with URLs, and `checkBundle` on the habit-tracker starter returned ok. `pnpm test --tag snack` is not a Vitest option, so the root script replaces it.

### Slice 4.6 Snapshots and restore

- [x] 4.6.1 On `succeeded`: create snapshot with `parent = base`, set `projects.current_snapshot_id`, push to Snack.
  Verify: integration test: two sequential fake builds produce a parent chain of length 2.
  Verified 2026-10-01: `apps/worker/src/handlers/generation.test.ts` "chains snapshots across builds…": two fake builds (initial, then edit on the current snapshot) give current → parent → null, a chain of 2, each row's `created_by_generation_id` being its build. Both snapshots were pushed to the live preview (`apps/worker/src/handlers/preview.ts` `pushPreview`; the second push reused the stored channel in `projects.snack_session_id`), with a `preview_updated` event for each. A failed build keeps the current snapshot and pushes nothing. The `preview` job pushes the current snapshot (used by restore). Worker tests: 13 passed.
- [x] 4.6.2 `POST /api/projects/:id/snapshots/:sid/restore`: creates a new snapshot whose files equal the target, sets it current, pushes to Snack; blocked while a build is active.
  Verify: integration test: restore → new row, files byte-equal to target, 409 if a generation is active.
  Verified 2026-10-01: `apps/web/src/server/handlers/snapshots.test.ts`, 4 passed. Restore returns 201 with a new row (parent = the previously current snapshot); its files are byte-equal to the target's; it becomes current; a `preview` job is queued; `snapshot.restored` is tracked; the next build's base is the restored snapshot. An active generation → 409 `generation_active` with no new row and current unchanged. Another user's project, or a snapshot from another project → 404; no session → 401. Restore and build start serialize on `projects.lock` (`packages/db/src/queries.test.ts`). This also fixed `postMessage`'s refusal paths, which matched the rollback error by a name drizzle does not use; `isRollback` from `@buildly/db` replaces the check.

### Slice 4.7 Evaluation harness

- [x] 4.7.1 `packages/eval` CLI per EVAL.md: task loader, runner using the real generation loop against a temp Postgres and real providers, JSON output.
  Verify: `pnpm eval --tasks smoke --runs 1 --dry-run` with a fake provider produces a report with T1, T4, T7 rows.
  Verified 2026-10-01: `pnpm eval --tasks smoke --runs 1 --dry-run --plan-model gpt-6.1-sol --edit-model gpt-6-luna` wrote `.eval/2026-10-01-gpt-6.1-sol+gpt-6-luna-dry-run.json` with T1 (passed, plan model), T4 (failed: new tab registered, since the script changes nothing; journal smoke tests passed), and T7 (passed, edit model). It used the real `runGeneration` loop, the real checker, and real starter smoke tests. `src/index.test.ts` covers the same through `runEval`. Store and events are in memory rather than a temp Postgres (EVAL.md, Implementation); Flex processing is not used yet, so costs are at Standard rates.
- [x] 4.7.2 Task checks for T1–T10 implemented as functions over the resulting files and run status, reusing starter smoke tests.
  Verify: unit test per check with a passing and a failing fixture.
  Verified 2026-10-01: `packages/eval/src/checks.test.ts` gives each of T1–T10 a passing fixture (the committed starters, or small edits of them) and a failing one, asserting exactly which checks fail. `runSmokeTests` runs a starter's committed Jest smoke test against given files (`SMOKE_ROOT`, no secrets in the child environment): the journal passes as committed and fails with an empty seed. Eval tests: 21 passed.
- [x] 4.7.3 `pnpm eval:report` markdown table with the EVAL.md thresholds and pass/fail flags.
  Verify: run on the dry-run JSON; table renders with threshold columns.
  Verified 2026-10-01: `pnpm eval:report .eval/2026-10-01-gpt-6.1-sol+gpt-6-luna-dry-run.json` printed the threshold table (Metric, Value, Target, Result, Maps to) with the six EVAL.md metrics. Metrics without runs are `n/a`, not pass or fail. The dry-run banner and a per-task table follow. `src/report.test.ts` checks the computations, including blended cost (1 initial : 3 edits).
- [x] 4.7.4 Nightly CI job running `--tasks smoke` against the configured model with the real API key, posting the JSON to storage.
  Verify: one nightly run visible in Actions with an uploaded artifact.
  Verified 2026-10-01: `.github/workflows/eval-nightly.yml` (cron 18:00 UTC plus `workflow_dispatch`) runs `pnpm eval --tasks smoke --runs 1`, uploads `.eval/*.json` as an artifact, writes the table to the job summary, and copies the JSON to S3 when `EVAL_STORAGE_BUCKET` and the `EVAL_STORAGE_*` secrets exist (not set yet; the artifact is the record until then). First run, dispatched manually after merging #7 with the `OPENAI_API_KEY` secret: Actions run 36818972644, success, artifact `eval-nightly-36818972644`. Results with gpt-6.1-sol / gpt-6-luna: T4 and T7 passed (34.6 s, 19.2 s); T1 built (tsc, bundle, routes, seed ok; 130.8 s, $0.107) but failed `models Entry`, since the model exported its entry type under another name. Blended cost $0.029 per build, under the $0.04 guardrail. One smoke run is not E1; the P3 decision still needs `--tasks all --runs 3`.

---

## Phase 4b — Fallback web runner

Goal: a web preview Buildly controls, because Snack's hosted web player refuses non-allowlisted origins (SPIKES.md S1). Expo Go previews stay on Snack. D18 picks slice 4b.0; slices 4b.1–4b.3 are the fallback if 4b.0 cannot be built or kept current.

### Slice 4b.0 Self-hosted Snack web player (chosen, D18)

- [x] 4b.0.1 Build the open-source Snack web player (expo/snack `runtime`, web target) for the pinned SDK with Buildly's preview origins added to `allowedOrigins`; host it on its own registrable domain (never the app's), no cookies; pass it as `webPlayerURL`. Document the per-SDK rebuild.
  Verify: the S1 spike page on the staging domain renders the journal starter through the self-hosted player; a page on another origin gets no messages.
  Verified 2026-10-01: `packages/web-player` builds expo/snack `runtime` at `a694b8f` (its last SDK 54 commit; `main` is on SDK 56) with two patches: the allowed origins come from `EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS` at build time (exact or `https://*.host`; `http://localhost:*` stays allowed as upstream), and the three sibling `snack-*` packages come from npm instead of the monorepo's `file:` links. `build.sh` → `dist/v2/54/` (12 MB). Hosted on AWS S3 + CloudFront (`infra.sh`, `deploy.sh`): bucket `buildly-web-player` (private, OAC, SSE-S3, tagged `project=buildly`), distribution `E2RKJNO8AIGML6`, `SNACK_WEB_PLAYER_URL=https://d3tfrf3qzy19yc.cloudfront.net/v2/%%SDK_VERSION%%`; an unsigned bucket URL returns 403. Verify, by `scripts/verify.ts` driving the S1 spike page in headless Chromium (the staging domain does not exist yet, so the page ran on a Cloudflare quick tunnel as in S1, and the build allows `https://*.trycloudflare.com` until the domain exists): from `https://cases-keyword-luck-awards.trycloudflare.com` the web client connected through the CloudFront player and stayed `ok` after loading the files for the journal, habit-tracker, and inventory starters (14 s each); a screenshot showed the journal's Entries list with demo data, tabs, and FAB. From `http://127.0.0.1:3200` the player logged `Access to origin … is forbidden` and no client connected. Found on the way: the spike page sent no `app.json`, which the About screen imports since 2.1.4, so the apps failed to evaluate; it now sends the manifest's `foundationFiles`, as `packages/snack` does. Rebuild for a new SDK or new origins: README in the package.


### Slice 4b.1 Runner container image (fallback)

- [-] 4b.1.1 Container image with Node 22 and the pre-baked foundation `node_modules` (shared with TODO 2.5.3) that takes a snapshot's files as input and produces a static web build; no network access during the build; CPU, memory, and 120 s time limits.
  Verify: `docker run` with the journal starter snapshot outputs `dist/index.html` within the time limit; a build that tries to reach the network fails.
  Dropped 2026-10-01: not needed, 4b.0.1 is verified (D18); revisit only if the self-hosted player cannot be kept current, per the beta review in 9.2.3.

### Slice 4b.2 `expo export --platform web` (fallback)

- [-] 4b.2.1 Worker `bundling` step for web runs `npx expo export --platform web` inside the runner container on the assembled project and maps Metro errors to the normalized diagnostic shape (TODO 2.5.2).
  Verify: integration test: journal starter → export succeeds; an injected syntax error → one diagnostic with file and line; the build never runs npm scripts from the project.
  Dropped 2026-10-01: not needed, 4b.0.1 is verified (D18); revisit only if the self-hosted player cannot be kept current, per the beta review in 9.2.3.

### Slice 4b.3 Isolated-origin static hosting (fallback)

- [-] 4b.3.1 Upload each export to storage under `previews/{projectId}/{snapshotId}/` and serve it from a dedicated preview origin (separate registrable domain, no cookies, strict CSP) that the workspace iframe loads with `sandbox="allow-scripts"`.
  Verify: e2e: the workspace iframe renders the export; the preview origin cannot read the app's cookies or call its API (checked with a fixture that tries).
  Dropped 2026-10-01: not needed, 4b.0.1 is verified (D18); revisit only if the self-hosted player cannot be kept current, per the beta review in 9.2.3.

---

## Phase 5 — Web app: workspace

Goal: the main editing experience against a real generation stream. Gated by S1.

### Slice 5.1 App shell and design system

- [x] 5.1.1 Next.js app with the brief §3 tokens as CSS variables, base typography, and a sidebar layout (Home, Starters, Settings) that collapses to a drawer under 1024 px.
  Verify: Playwright: at 1280 px the sidebar is visible; at 768 px it is hidden and the drawer opens from the menu button; axe scan reports no serious violations.
  Verified 2026-10-01: `apps/web` now uses Tailwind v4 with the mockup's tokens as `@theme` variables (`app/globals.css`), Inter via `next/font`, and an `app/(shell)` route group whose layout redirects signed-out visitors to `/sign-in` and renders `Shell` (viewport-locked; only the page scrolls) with `Sidebar` (Home, Starters, Settings, a plan card with real builds used, credits, and reset date). Under 1024 px a top bar's menu button opens the sidebar as a drawer (`role=dialog`), closed by navigation, Escape, or the overlay. `apps/web/e2e/shell.spec.ts`: at 1280 px the sidebar is visible with the three links and `0/15 builds`, and Settings gets `aria-current`; at 768 px it is hidden, the menu button opens the drawer, a link closes it, Escape closes it; `@axe-core/playwright` reports no serious or critical violations at 1280 px, in the open drawer at 768 px, and on `/sign-in`. Starters and Settings are placeholder pages until 6.2 and 6.4.
- [x] 5.1.2 Auth pages: enter email, "check your inbox", error states; redirect to Home after callback.
  Verify: e2e with the console email adapter: full sign-in flow lands on Home.
  Verified 2026-10-01: `/sign-in` (`src/ui/SignInForm.tsx`): email form → `POST /api/auth/magic-link` → "Check your inbox" with the address; error states for an invalid email, a non-invited email ("Buildly is invite-only right now.", form kept), a network failure, and `?error=invalid_link`, which the callback now redirects to instead of a bare 400 (3.2.2 note). `apps/web/e2e/sign-in.spec.ts` with the console email adapter: the Playwright web server's output is teed to `e2e/.server.log`, the test invites a fresh address, submits the form, reads the printed magic link from the log, opens it, and lands on Home with the sidebar showing that email; opening the link again lands on the error state; a bogus token does too. 12 e2e tests pass.

### Slice 5.2 Chat panel

- [x] 5.2.1 `GET /api/projects/:id/stream` SSE endpoint relaying 4.4.4 events and assistant message deltas; reconnect with `Last-Event-ID`.
  Verify: integration test: client disconnects mid-run and reconnects; no events are lost or duplicated.
  Verified 2026-10-01: `apps/web/src/server/handlers/stream.ts` (`GET /api/projects/:id/stream`): SSE on a dedicated LISTEN connection from the pool (`Deps.pool`), stored events with their row id as the SSE id, deltas as id-less `delta` frames, `retry: 2000`, a comment ping, and resume from `Last-Event-ID` (or `?after=` on the first connection). `stream.test.ts`: a client reading four events disconnects, two more are published, a reconnect from the last id receives exactly those two, no id repeats; deltas arrive; other users get 404, anonymous 401. A reconnect that aborts before the subscription exists still releases the connection.
- [x] 5.2.2 Chat UI: message list, streamed assistant plan, progress steps (`Plan ready`, `Files written`, `Types checked`, `Preview bundled`) that only turn green on server events, subtle "OpenAI" label near the composer.
  Verify: e2e with a fake provider: steps appear in order and never before the server event; a run that fails at typecheck shows the failure reason and keeps the previous preview.
  Verified 2026-10-01: the workspace page (`app/app/[id]`, outside the shell) loads `loadWorkspace` (`GET /api/projects/:id`: project, messages, generations with recorded steps, `lastEventId`) and `src/ui/workspace/` follows the stream: per-generation threads with the streamed plan, the four steps (`state.ts` turns a step green only from a stored event; the running spinner is UI state), outcome text, and the summary; an "OpenAI" label sits by the composer. `e2e/chat.spec.ts` runs against the real pipeline with `e2e/fake-worker.ts` (the real worker loop, generation handler, checker, and events with a scripted model, registered as a second Playwright web server): Plan ready turns green while Types checked and Preview bundled are not, then each in order, outcome "Build succeeded", the summary, and a snapshot; a build whose type check fails three times ends "Type check failed" with the diagnostics (`src/screens/HomeScreen.tsx`), the type-check step red, and the preview's snapshot unchanged. Found on the way: `createPool` had no `error` listener, so a terminated idle connection (here the e2e database being recreated under a running worker; in production a Postgres restart) crashed the process; it now logs and the pool reconnects (`packages/db/src/client.test.ts`).
- [x] 5.2.3 Composer disabled during an active run; Cancel button visible; cancel keeps the last snapshot.
  Verify: e2e: click Cancel mid-run → status "Cancelled", preview unchanged, composer re-enabled.
  Verified 2026-10-01: the composer is disabled while a generation is active and shows Cancel, which calls `POST /api/generations/:id/cancel`. `chat.spec.ts`: Cancel during a stalled first turn → outcome "Cancelled", generation status `cancelled`, preview still "No preview yet", composer enabled, Cancel gone.
- [x] 5.2.4 Cap and error handling: 429 shows the reason and `resetAt`; the prompt text is preserved.
  Verify: e2e: exceed the hourly cap → inline message, textarea still contains the prompt.
  Verified 2026-10-01: a 4xx from `POST /api/projects/:id/messages` shows its message inline with "Try again after <resetAt>" (a `<time>` element) and keeps the prompt. `chat.spec.ts`: a user with ten builds in the hour sends an eleventh → the hourly message and reset time show, the textarea still holds the prompt.

### Slice 5.3 Preview panel

- [x] 5.3.1 Web player iframe (the self-hosted player from 4b.0.1, D18) inside a phone frame, wired through the SDK web preview reference; CSP `frame-src` limited to the player origin; label "Web preview".
  Verify: e2e (tagged `@snack`): iframe `src` equals the session `webPreviewURL` on the player origin; any other `src` is blocked by CSP (checked via console error).
  Verified 2026-10-01: the player only receives code by postMessage from a snack-sdk instance in the same page, so the workspace runs its own offline instance (`src/ui/workspace/usePlayer.ts`) fed by `GET /api/projects/:id/preview` (the current snapshot assembled exactly as a worker session sends it, via `assembleSnackFiles` shared with `packages/snack`, plus dependencies, SDK version, and `SNACK_WEB_PLAYER_URL`); the worker's online session keeps serving Expo Go. The iframe sits in a phone frame under a "Web preview" label; `next.config.ts` sets `Content-Security-Policy: frame-src <player origin>` on `/app/*`. `e2e/preview.spec.ts`: the iframe `src` is `<player>/v2/54/index.html?…&origin=http://localhost:3310` with no CSP error; an injected `https://example.com` frame is refused by `frame-src`. `@snack` (`SNACK_LIVE=1 … -g @snack`, passed 2026-10-01): the player connected through CloudFront and Snack and reported `ok` in about 5 s. Found on the way: Turbopack cannot bundle the foundation's Node loader (`new URL("..", import.meta.url)`), so the digest script now also emits the committed `dist/foundation-files.json`, which the web app imports; CI diffs all of `packages/foundation/dist`.
- [x] 5.3.2 Two viewport presets (small and large phone), build status chip, Refresh, Reset demo data (posts a message the foundation listens for, or reloads with a `reset=1` param).
  Verify: e2e: preset toggles the frame dimensions; Reset triggers `preview.reset_demo_data` event; **manual**: demo pill reappears after reset.
  Verified 2026-10-01: Small/Large phone presets (`PhoneFrame`, 300×600 and 330×680), a Web status chip (bundling… / bundled ✓ / error / no build yet), Refresh (remounts the iframe; the SDK re-sends the code), and Reset demo data, which posts `buildly:reset-demo-data` into the player; the foundation's `usePreviewBridge` (read-only `src/components/PreviewBridge.ts`, constant pinned to `@buildly/shared` by tests on both sides) reseeds and remounts the app. `POST /api/projects/:id/track` records `preview.reset_demo_data` and `preview.web_loaded` (`load_ms`). `preview.spec.ts`: the preset shrinks the frame; Reset writes the analytics row. The manual item ran as a live test instead (`@snack Reset demo data reseeds…`): with the journal starter in the player, deleting "Sprint review" removes it; Reset brings it back with the demo pill visible.
- [x] 5.3.3 Browser and phone verification shown separately: "Web: bundled ✓ / Phone: not verified" until the user opens the QR modal.
  Verify: e2e: after a successful build the two statuses render with distinct values.
  Verified 2026-10-01: `status-web` and `status-phone` chips; phone stays "not verified" until the QR modal opens (5.4). `preview.spec.ts`: after a successful build the chips read `bundled ✓` and `not verified`.

### Slice 5.4 Open on phone

- [x] 5.4.1 Modal with QR of the Expo Go `url`, Expo Go install links, and the one-line note about internet access; emits `preview.phone_opened`.
  Verify: unit test decodes the rendered QR (jsQR) to the session URL; e2e: opening the modal writes the analytics row.
  Verified 2026-10-01: `src/ui/workspace/OpenOnPhoneModal.tsx`: QR (SVG from `qrcode` modules, `src/ui/workspace/qr.ts`) of the session's Expo Go URL, the App Store and Play links, the internet-access note, Escape and overlay to close. The URL comes from `expoGoUrlFor(channel, sdkVersion)` in `packages/snack` (snack-content's `createRuntimeUrl` with the stored channel; a test checks it equals a real `Snack` instance's `url`). Opening calls `POST /api/projects/:id/phone`, which records `preview.phone_opened` and enqueues a `preview` job so the worker's session exists (recreated from the stored channel after a worker restart) before Expo Go connects; the modal polls until the channel exists. `qr.test.ts`: jsQR decodes the rendered modules back to the URL. `e2e/phone.spec.ts`: before a build the modal explains and queues nothing; opening writes the analytics row and flips the phone chip to "QR opened"; after a build the QR and a URL with the session's channel show and a `preview` job was queued.
- [~] 5.4.2 Starter opens in Expo Go from the workspace QR.
  Verify: **manual** on iOS and Android; note date and devices here.
  Pending the founder's device test (see the steps in the 5.4 hand-off): `pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`, run the web app and the worker, sign in as admin@buildly.test, open a seeded starter project's workspace, Open on phone, scan with Expo Go on iOS and Android; note date and devices here.

### Slice 5.5 Code tab

- [x] 5.5.1 Read-only file tree from the current snapshot and a syntax-highlighted viewer (Shiki or Prism), foundation files shown collapsed under a "Foundation (read-only)" group.
  Verify: e2e: tree lists every project file in the snapshot; clicking a file shows its contents; no editable inputs exist.
  Verified 2026-10-01: `GET /api/projects/:id/files` returns the current snapshot's project files and the foundation files (from `foundation-files.json`); `src/ui/workspace/CodeView.tsx` lists the project files, the foundation files collapsed under "Foundation (read-only)", and a line-numbered viewer highlighted by `prism-react-renderer` (tsx, ts, json). Preview and Code are tabs on the workspace; `?tab=code` deep-links. `e2e/code.spec.ts`: after a build, the tree's paths equal the API's project file list, clicking `src/screens/HomeScreen.tsx` shows its lines, the foundation group expands to every foundation file and marks them read-only, and the code view contains no input, textarea, select, or contenteditable element.

### Slice 5.6 Screen list

- [x] 5.6.1 Derive screens from the `finish` tool output stored on the generation, falling back to route registrations in files; collapsible panel.
  Verify: unit test: journal starter yields Entries, Entry detail, New entry, Tags; e2e: panel collapses under 1024 px.
  Verified 2026-10-01: the worker stores the `finish` tool's validated screen names on `generations.screens` (migration `0003_generation_screens`); `loadWorkspace` serves the latest successful build's list, falling back to `screensFromNavigation` (`packages/shared/src/screens.ts`) over the current snapshot's `src/navigation.tsx`: routes whose component is imported from `./screens/`, humanized, skipping nested navigators and foundation screens. `screens.test.ts`: the journal starter yields Entries, Entry detail, New entry, Tags (registration order Entries, Tags, Entry detail, New entry); the template yields Home. The panel sits beside the preview, expanded from 1024 px and collapsed below (`matchMedia`), with a toggle. `e2e/screens.spec.ts`: after a build the list shows Home at 1280 px; the toggle collapses it; at 768 px it loads collapsed and expands on the toggle. The preview section now shows from 768 px (chat 360 px) so that collapse is visible.

### Slice 5.7 Toolbar

- [x] 5.7.1 Back, app icon, inline-editable name (PATCH on blur), "Expo + TypeScript" badge, Open on phone, Export code.
  Verify: e2e: rename persists after reload; Export triggers 6.3.
  Verified 2026-10-01: toolbar with Back, the project icon (by starter, else a phone), the inline name (`PATCH /api/projects/:id`, saved on blur or Enter, Escape reverts, 1–80 chars; `projects-toolbar.test.ts`), the "Expo + TypeScript" badge, History, Open on phone, and Export code, which POSTs `/api/projects/:id/export` and shows "Export is not available yet." until 6.3.2 exists. `e2e/toolbar.spec.ts`: a rename persists after reload (and in the API); Export code issues the POST.
- [x] 5.7.2 Snapshot history drawer with Restore.
  Verify: e2e: after two builds, history shows two entries; Restore of the first refreshes the code tab to its files.
  Verified 2026-10-01: `GET /api/projects/:id/snapshots` lists a project's snapshots newest first with the current one flagged and each one's label (the build's prompt, "Restored version", or "Starter"); `src/ui/workspace/SnapshotDrawer.tsx` shows them with Restore (disabled while a build runs) calling 4.6.2's restore, then resyncs the workspace. `e2e/history.spec.ts`: after two builds the drawer shows two entries with the newest current; Restore of the first adds a third, current "Restored version" entry (history is never edited), and the code tab's HomeScreen shows the first build's contents under the restored snapshot. The fake worker now writes the prompt into the file so builds differ.

---

## Phase 6 — Web app: home, starters, settings, export

### Slice 6.1 Home

- [x] 6.1.1 Heading "What mobile app will you build?", composer with placeholder "Describe your mobile app...", starter chip at lower left, "Build app" at lower right.
  Verify: e2e: empty prompt → button disabled; select starter → enabled with empty prompt; chip removable.
  Verified 2026-10-01: `app/(shell)/page.tsx` greets by first name over the heading; `src/ui/home/Composer.tsx` has the prompt (placeholder "Describe your mobile app...", ⌘↵ builds), the Choose starter menu that becomes a removable chip at lower left (starters from `packages/starters/dist/starters-files.json`, emitted by `pnpm --filter starters dist` and checked in CI like the foundation's), and Build app at lower right. `e2e/home.spec.ts`: empty prompt → disabled; a starter alone → enabled; removing the chip → disabled.
- [x] 6.1.2 Submit creates a project and enqueues the first build, then routes to the workspace with the stream already open.
  Verify: e2e with fake provider: first step appears within 2 s of landing.
  Verified 2026-10-01: `POST /api/projects` accepts `prompt` and `starterSlug`: the build caps are checked first, then the project, the message, the generation, the usage event (and credit), and the job are written in one transaction through `src/server/builds.ts` `startBuild`, now shared with the message handler; the name comes from the prompt (`nameFromPrompt`). The composer routes to `/app/<id>`, whose stream opens on mount. `home.test.ts` covers the transaction, the name, and a cap refusal creating nothing. `home.spec.ts`: after Build app the workspace shows the plan step within 2 s of landing (the route is warmed once first, since dev compiles on first visit), then the fake worker finishes the build.
- [x] 6.1.3 Recent apps grid (icon, name, updated time, overflow menu with Rename and Archive); empty-state invitation for new users.
  Verify: e2e: new user sees the invitation; after creating a project the grid shows it.
  Verified 2026-10-01: `src/ui/home/HomeBrowse.tsx`: Recent apps grid (icon by starter, name, relative updated time) with an overflow menu whose Rename edits inline (PATCH name) and whose Archive calls `PATCH /api/projects/:id` with `archived: true` (sets `archived_at`; archived projects leave every list and are no longer reachable); an invitation card when the user has no apps. `home.spec.ts`: a new user sees "No apps yet"; after a build the card shows; Rename persists after reload; Archive removes it and the invitation returns.
- [x] 6.1.4 Prompt preserved on any error before navigation.
  Verify: e2e: force a 500 on create → error toast, textarea unchanged.
  Verified 2026-10-01: the composer shows the API's message (and reset time) inline and keeps the prompt on any non-2xx or network failure; navigation happens only on 201. `home.spec.ts` forces a 500 on the create request with a Playwright route and checks the error text and the unchanged textarea.

### Slice 6.2 Starters

- [x] 6.2.1 Starter cards on Home from `starters.json` with thumbnail, description, and Use starter; reserved `/starters` route rendering the same list.
  Verify: e2e: three cards render with images; `/starters` responds 200.
  Verified 2026-10-01: `src/ui/home/StarterCard.tsx` (thumbnail from `apps/web/public/starters/<slug>.png`, copies of the package's PNGs pinned byte-for-byte by `thumbnails.test.ts`; description; screen chips on the large variant; Use starter) renders on Home's Starters tab and on `/starters` (`app/(shell)/starters/page.tsx`), both from `starters-files.json`. `e2e/starters.spec.ts`: three cards whose images have loaded (`naturalWidth > 0`) on Home and on `/starters`, which answers 200.
- [x] 6.2.2 Use starter creates the project from the fixture files with an initial snapshot and no build consumed.
  Verify: integration test: `usage_events` count unchanged; snapshot files equal the fixture; workspace preview loads without a generation row.
  Verified 2026-10-01: Use starter posts `starterSlug` to `POST /api/projects`, which creates the project with the fixture files as its initial snapshot and queues a `preview` job, with no generation, message, or usage event. `home.test.ts`: `usage_events` unchanged, the snapshot's files equal `loadStarterFiles("journal")`, no generation row, the preview job queued; a starter plus a prompt makes the prompt an edit on that base. `starters.spec.ts`: the workspace opens named Journal with no generation thread, the player iframe and "Snapshot …" caption, the screen list (Entries), and `/api/me` still at 0 builds.

### Slice 6.3 Export

- [x] 6.3.1 `packages/exporter`: assemble foundation + project files, `package.json` with pinned deps, `app.json` with the project name, README from 2.3.3, attribution flag by plan; produce a ZIP.
  Verify: unit test: ZIP entries match the expected set; Free plan README contains "Made with Buildly", Pro does not.
  Verified 2026-10-01: `packages/exporter` (`buildExportEntries`, `buildExportZip` on `fflate`, `readExportZip`): the foundation's shipped files, the project files, `app.json` with the project's name, slug, and `showAttribution` by plan, `package.json` with the allowlist pinned from `foundation.json` plus TypeScript and React types (pinned to the foundation catalog by a test), `index.ts` (`registerRootComponent`), the README from `export/README.md` (now carried in `foundation-files.json`), and a `.gitignore`. `src/index.test.ts`: the entry set equals foundation + project + the four generated files; Free README contains "Made with Buildly.", Pro's does not and its `app.json` hides the attribution; the ZIP round-trips.
- [x] 6.3.2 `POST /api/projects/:id/export` stores the ZIP and returns a signed URL; emits `export.created`.
  Verify: integration test: response URL downloads a ZIP whose size matches `zip_bytes` in the event.
  Verified 2026-10-01: `POST /api/projects/:id/export` builds the ZIP for the current snapshot, stores it at `exports/{projectId}/{exportId}.zip`, returns a 10-minute signed URL, records an `export` usage event and `export.created` with `zip_bytes`; 409 without a snapshot; 422 when the secret guard blocks. `export.test.ts`: the returned URL downloads a ZIP whose byte length equals `zip_bytes` in the event, and the ZIP holds the README, `app.json`, and the starter's screens. The toolbar's Export code starts the download or shows the API's message.
- [x] 6.3.3 Secret guard on every export using 0.3.2.
  Verify: CI test unzips a generated export and runs the guard; a fixture containing a key fails the build.
  Verified 2026-10-01: the guard's rules moved behind `scanFiles` (shared with `scanDirectory`, exported from `@buildly/scripts/check-no-secrets`); the exporter runs it over every entry and throws `ExportBlockedError` naming files and rules but never the match. `index.test.ts`: an unzipped export passes `scanDirectory`; a project file with `sk-abc123` blocks the export. CI's `export-smoke` job also runs `pnpm check:secrets` on the unzipped journal export.
- [~] 6.3.4 Exported project runs outside Buildly.
  Verify: CI job: unzip, `npm ci`, `npx tsc --noEmit` exit 0; **manual** on a clean machine: `npx expo start` and open in Expo Go following only the README.
  In progress 2026-10-01: CI job `export-smoke` (`.github/workflows/ci.yml`) exports the journal starter (`pnpm --filter @buildly/exporter export-starter journal <zip>`), unzips it, runs the secret guard, then `npm install` and `npx tsc --noEmit` in the unzipped project (`npm install`, not `npm ci`: exports ship no lockfile, and the README says `npm install`). The job passed on PR #12 (run 36847300736, `export-smoke` 46 s: the journal export installed with npm and type-checked on its own, after the secret guard). Pending: the founder's manual check on a clean machine (`npx expo start`, open in Expo Go following only the README); note date and machine here.

### Slice 6.4 Settings

- [x] 6.4.1 Display name, plan, builds used this month against cap, Sign out.
  Verify: e2e: name change persists; usage matches `usage.countBuildsThisMonth`; sign out clears the cookie and `GET /api/me` → 401.
  Verified 2026-10-01: `app/(shell)/settings/page.tsx` with `src/ui/settings/SettingsForm.tsx`: display name saved on blur or Enter through `PATCH /api/me` (trimmed, ≤ 60, empty clears; `me.test.ts`), "Signed in as", plan and "N of M builds used this month · resets <date>" with the top-up credit balance and a progress bar, the Pro and top-up panels with their buttons disabled until billing (D11), and Sign out (`POST /api/auth/sign-out` deletes the session and clears the cookie; `me.test.ts` shows `/api/me` answering 401 afterwards). `e2e/settings.spec.ts`: three recorded builds show as "3 of 15", equal to `/api/me`; the name persists after reload and reaches the sidebar; Sign out lands on `/sign-in`, `/api/me` answers 401, and `/settings` redirects.

---

## Phase 7 — Metrics, security, tuning

### Slice 7.1 Instrumentation

- [x] 7.1.1 Every event in METRICS.md emitted from the listed component with typed props.
  Verify: unit test per emitter; integration test that a full fake build produces `build.started`, ≥ 4 `build.step`, `build.finished`.
  Verified 2026-10-01: `EventProps` in `packages/shared/src/events.ts` types every event's props and `analytics.track` is generic over the name, so a wrong prop fails `pnpm typecheck`. New emitters: `user.signed_in` (auth callback), `project.opened` (workspace page), `starter_slug` on `project.created`; the preview tracker validates `load_ms`. Tests: `auth.test.ts` (signed_in), `home.test.ts` (created with source and slug), `projects-toolbar.test.ts` (opened), `builds.test.ts` (cap.hit, build.cancelled), `preview.test.ts`, `phone.test.ts`, `export.test.ts`, `snapshots.test.ts`, and the worker's `generation.test.ts` (started, ≥ 4 steps, finished).
- [x] 7.1.2 `/admin/metrics` page computing the METRICS.md formulas for 7 and 30 days plus the last nightly eval.
  Verify: integration test seeds events and asserts H1, H2, H3 values; e2e: non-admin → 404.
  Verified 2026-10-01: `metrics.compute` in `packages/db/src/metrics.ts` (tests seed events and assert every formula), `apps/web/src/server/metrics.ts` loads 7/30 days plus the newest `eval/nightly/*.json` from storage (`metrics.test.ts` asserts H1, H2, H3 for both windows and the nightly summary), `app/admin/metrics/page.tsx` renders them; `e2e/admin-metrics.spec.ts`: anonymous and member → 404, admin → the table. The nightly report reaches storage when `EVAL_STORAGE_BUCKET` is the app's bucket (eval-nightly.yml).
- [x] 7.1.3 Weekly report script writing `.plan/mvp/reports/YYYY-WW.md`.
  Verify: run once locally against seeded data and commit the sample.
  Verified 2026-10-01: `pnpm report:weekly [--date YYYY-MM-DD]` (`scripts/weekly-report.ts`, ISO-week and rendering tests in `weekly-report.test.ts`) run against the local docker database with the events from the Phase 5–6 manual builds; sample committed as `.plan/mvp/reports/2026-W40.md`.

### Slice 7.2 Security and abuse

- [~] 7.2.1 Client bundle secret scan in CI on `apps/web/.next` using 0.3.2.
  Verify: CI step passes; injecting `process.env.OPENAI_API_KEY` into a client component fails the build.
  2026-10-01: CI step "Client bundle secret scan" runs `next build` and `pnpm check:secrets apps/web/.next/static`; locally the production client bundle scans clean. Open: the injection check (add a reference to the key's env name in a client component, build, expect the scan to fail, revert) was not run here and needs a manual run.
- [x] 7.2.2 Security headers: CSP with the web player origin as the only `frame-src`, `frame-ancestors 'none'`, HSTS, cookie `SameSite=Lax` `Secure` `HttpOnly`.
  Verify: integration test asserts headers on `/` and the workspace route.
  Verified 2026-10-01: `securityHeaders` (`apps/web/src/server/security-headers.ts`, unit-tested) is applied to every route by `next.config.ts`; `e2e/security-headers.spec.ts` asserts the CSP's player-only `frame-src`, `frame-ancestors 'none'`, HSTS, `X-Frame-Options`, and `nosniff` on `/` and `/app/:id` from the running server; the cookie flags stay asserted in `auth.test.ts`; `preview.spec.ts` still sees other frames blocked. Script, style, and connect sources are not restricted yet (ARCHITECTURE.md §8).
- [x] 7.2.3 Rate limit on magic-link requests (5 per email per hour) and on API routes by session.
  Verify: integration test: 6th request → 429.
  Verified 2026-10-01: `auth.test.ts`: five links in an hour → 200, the 6th (case and spacing variant of the same email) → 429 with no email sent, one slot frees an hour after the first. `rate-limit.test.ts`: request 121 in a minute on one session → 429 with `Retry-After`, another session is unaffected, the next minute is allowed. Limits in `ABUSE_LIMITS`.
- [x] 7.2.4 One Free account per email and email verification by construction of magic links; duplicate `users.email` rejected.
  Verify: unique index test.
  Verified 2026-10-01: `queries.test.ts`: a second insert of the same email fails with 23505 on `users_email_unique`; sign-in normalizes the email, so case and spacing variants reach the same account.

### Slice 7.3 Model selection and tuning

- [x] 7.3.1 Run EVAL.md E1 (`--runs 3`, each candidate model, all tasks) and record P3 and P5 in DECISIONS.md.
  Verify: report files committed under `.eval/`; DECISIONS.md P3 and P5 resolved; the report shows blended cost per build against the $0.04 guardrail.
  Verified 2026-10-01 at `--runs 1` per candidate, not 3 (the founder chose the smaller run to limit spend; a three-run E1 remains worth doing before beta). Reports `.eval/2026-10-01-gpt-6.1-sol.json`, `…-gpt-5.3-codex.json`, `…-gpt-6-luna.json` committed (`.gitignore` now keeps root reports, ignores dry runs and scratch). D22 resolves P3 (`gpt-5.3-codex` plans, `gpt-6-luna` edits) and P5 (keep Pro 200 builds at $12); `pnpm eval:report` shows the blended-cost row against $0.04. Results and rule applications in EVAL.md "E1 result". The first attempt was lost to the laptop sleeping mid-run; the CLI now saves the report after every run, and `--keep-files` keeps each run's files for diagnosis.
- [x] 7.3.2 Tune system prompt, API digest, and tool error messages until EVAL.md thresholds are met on the chosen config.
  Verify: `pnpm eval --tasks all --runs 1` report shows H1 ≥ 70%, H2 ≥ 80%, T9 100%.
  Verified 2026-10-01: `.eval/2026-10-01-tuned-gpt-5.3-codex+gpt-6-luna.json` (9 / 10): H1 75%, H2 100%, T9 100%, median initial wall 59 s, blended $0.020 per build. Changes: the system prompt (`packages/generator/src/context.ts`; fewer turns, refuse an unavailable package in the plan, always finish, name types and screens after the user's nouns, store each logged event as a record, seed ≥ 3 records) and three eval checks that failed correct work (T6 smoke rewrite, qualified model names, T9 wording; EVAL.md lists them with tests in `checks.test.ts`). The API digest and tool error messages were unchanged. Open: T2's "a Today screen" check still fails; whether the T2 spec should require it is a founder decision. Tuning spend about $0.9 of the $10 budget (E1 about $2.6, including the lost first attempt).
- [x] 7.3.3 Failure explanations: map `error_code` to user-facing copy (typecheck, bundle, timeout, cancelled, context too large, dependency not allowed).
  Verify: unit test covers every code; e2e shows the copy for a forced typecheck failure.
  Verified 2026-10-01: `FAILURE_COPY` and `failureCopy` in `packages/shared/src/failures.ts` give a title and a help line for every `GENERATION_ERROR_CODES` entry (the generator's `ErrorCode` is now that type) plus the build cap codes; `failures.test.ts` covers every code, the status mapping, and unknown codes. New code `dependency_not_allowed`: a rejection budget spent at least half on `import_not_allowed` ends the run with it (`run.test.ts`). The chat shows the title and help line (`outcome-help`); `chat.spec.ts` asserts both for the forced typecheck failure and that the raw code is gone.

---

## Phase 8 — Acceptance criteria (brief §12)

Check each only with the evidence named.

- [x] 8.1 Prompt or starter → workspace with a live preview from the generated project. Evidence: 6.1.2, 6.2.2, 5.3.1.
  Verified 2026-10-02: 6.1.2, 6.2.2, and 5.3.1 are `[x]`; e2e `home.spec.ts` (prompt → workspace), `starters.spec.ts` (starter → workspace with its preview), and `preview.spec.ts` (player iframe on the player origin) pass on `main`.
- [x] 8.2 Each starter's navigation and CRUD work on web and Expo Go. Evidence: 2.4.1–2.4.3 smoke tests and 2.4.5 manual.
  Verified 2026-10-02: 2.4.1–2.4.3 smoke tests pass in CI; 2.4.5 manual: all three starters on Snack web through the self-hosted player and in Expo Go on Android (2026-10-01). iPhone not tested; the brief does not require it.
- [x] 8.3 Records survive app restart in Expo Go. Evidence: 2.2.4 manual.
  Verified 2026-10-02: 2.2.4 manual, Android Expo Go, 2026-10-01: a created entry survived force-quit and reopen.
- [x] 8.4 Add-a-screen edit passes without breaking existing screens. Evidence: EVAL T4 pass in 7.3.2.
  Verified 2026-10-02: T4 passed on the chosen config in `.eval/2026-10-01-tuned-gpt-5.3-codex+gpt-6-luna.json` (tsc, bundle, starter smoke tests, new tab registered).
- [x] 8.5 Data-model change bumps `schemaVersion` and reseeds with a notice. Evidence: EVAL T5 plus 2.2.2.
  Verified 2026-10-02: T5 passed in the same report (schemaVersion bumped, smoke tests pass); 2.2.2 store tests cover the reseed and the one-time `didReseed` flag, which `App.tsx` shows as `ReseedNotice`.
- [x] 8.6 Failed build keeps the last snapshot and explains why. Evidence: 4.4.2, 5.2.2, 7.3.3.
  Verified 2026-10-02: 4.4.2 (failure keeps the snapshot, `error_detail` set), 5.2.2 (e2e: a failed build keeps the preview), 7.3.3 (user-facing title and help line per error code; e2e for a forced type-check failure).
- [x] 8.7 Restore swaps source and refreshes preview. Evidence: 4.6.2, 5.7.2.
  Verified 2026-10-02: 4.6.2 restore handler tests and 5.7.2 e2e `history.spec.ts` (Restore of the first build refreshes the code tab).
- [ ] 8.8 Export runs with `npm install && npx expo start` on a clean machine. Evidence: 6.3.4.
  Open 2026-10-02: 6.3.4 is `[~]`. CI `export-smoke` installs and type-checks the journal export; the founder's clean-machine run (`npm install && npx expo start`, open in Expo Go following only the README) is still needed.
- [x] 8.9 Web and phone verification reported separately. Evidence: 5.3.3.
  Verified 2026-10-02: 5.3.3 e2e `preview.spec.ts`: after a build the web and phone statuses differ until the QR modal is opened.
- [ ] 8.10 No OpenAI credentials in client code, Snack sessions, or exports. Evidence: 7.2.1, 6.3.3, 4.5.1 (files sent assertion).
  Open 2026-10-02: 6.3.3 (export guard) and 4.5.1 (Snack receives only foundation and project files and pinned dependencies) are `[x]`, and CI scans the production client bundle; 7.2.1 is `[~]` until the injection check (a key reference in a client component must fail the scan) is run by hand.
- [x] 8.11 Metrics recorded for every generation. Evidence: 7.1.1.
  Verified 2026-10-02: 7.1.1: `build.started`, `build.step`, `build.finished` (tokens, cost, repairs, wall time) per generation from the worker, plus the web events, typed and tested; `/admin/metrics` and `pnpm report:weekly` compute the §1 metrics from them.

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
