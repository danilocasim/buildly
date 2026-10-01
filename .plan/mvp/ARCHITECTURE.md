# Architecture reference for the MVP

Concrete names that `TODO.md` tasks point at. Change this file first when a task needs a different shape.

## 1. Repository layout (pnpm workspace)

```
buildly/
  apps/
    web/                 Next.js (App Router). Home, workspace, settings, auth, API routes, SSE stream
    worker/              Long-lived Node process. Claims jobs, runs the generation loop, talks to Snack
  packages/
    shared/              Types, zod schemas, constants, event names shared by web and worker
    db/                  Drizzle schema + migrations + query helpers (Postgres)
    storage/             Object storage adapter (S3-compatible) for snapshot file sets and export ZIPs
    foundation/          The Expo foundation: App.tsx, src/theme, src/components, src/data, foundation.json
    starters/            journal/, habit-tracker/, inventory/ as committed file sets on top of foundation
    checker/             check-project: assembles foundation + project files, runs tsc, returns diagnostics
    generator/           Provider client, tools, context builder, generation state machine
    snack/               Thin wrapper over snack-sdk: session create/update, errors, online URL
    exporter/            Builds the export ZIP (foundation + project files + README)
    eval/                Evaluation harness and task set (see EVAL.md)
  scripts/               Repo tooling as a workspace package (@buildly/scripts), e.g. check-no-secrets.ts
  docs/                  Product brief
  .plan/                 This plan
```

Package manager: pnpm (versions pinned once in the `catalog:` of `pnpm-workspace.yaml`; the Expo foundation's versions in the named `catalog:foundation`, kept equal to `foundation.json` by a test). Node 22 LTS. TypeScript strict everywhere, every package extending `tsconfig.base.json`; TypeScript stays on 6.0.x until typescript-eslint supports 7. Packages are named `@buildly/<dir>` and export their TypeScript source directly (no build step for internal packages). Tests: Vitest for unit and integration, Playwright for web e2e, React Native Testing Library on Jest (`jest-expo`) for the foundation and starters (D19).

`packages/foundation` ships `App.tsx`, `app.json`, `tsconfig.json`, and `src/` to Snack and exports; `lib/` (Node loaders), `scripts/` (API digest), `export/README.md` (export README template), `dist/api-digest.md`, and `test/` never ship. `packages/starters/<slug>/src/` holds only project-owned files; their tests overlay them on the foundation with a Jest resolver, and the checker type-checks each real assembly.

## 2. Data model (Postgres)

| Table | Key columns | Notes |
| --- | --- | --- |
| `users` | id, email (unique), display_name, plan (`free` default), created_at | Plan column exists from day one even though billing is post-beta |
| `invites` | email (unique), invited_by, accepted_at | Invite-only gate |
| `magic_links` | token_hash, user_id or email, expires_at, used_at | Single-use, 15-minute expiry |
| `sessions` | id, user_id, expires_at | Cookie session |
| `projects` | id, user_id, name, starter_slug nullable, current_snapshot_id, snack_session_id nullable, archived_at, created_at, updated_at | One Snack session per project |
| `snapshots` | id, project_id, parent_snapshot_id, storage_key, file_count, schema_version, created_by_generation_id nullable, created_at | Immutable. `storage_key` points to a JSON bundle `{ files: { path: contents } }` |
| `messages` | id, project_id, role (`user`/`assistant`/`system`), content, generation_id nullable, created_at | Conversation history |
| `generations` | id, project_id, user_id, status, trigger_message_id, base_snapshot_id, result_snapshot_id nullable, repair_attempts, model, input_tokens, cached_tokens, output_tokens, cost_usd, error_code nullable, error_detail nullable, started_at, finished_at | One row per **build** |
| `generation_steps` | id, generation_id, step (`plan`/`edit`/`typecheck`/`bundle`/`repair`/`snapshot`), status, detail jsonb, started_at, finished_at | Feeds the progress UI; only written when the step actually completes |
| `jobs` | id, type, payload jsonb, status (`queued`/`running`/`done`/`failed`/`cancelled`), attempts, locked_by, locked_at, heartbeat_at, run_after, created_at | Queue table, claimed with `FOR UPDATE SKIP LOCKED` |
| `usage_events` | id, user_id, project_id nullable, type, quantity, occurred_at | Builds consumed (every build, whoever pays), exports, phone opens |
| `build_credits` | id, user_id, delta, reason (`topup`/`grant`/`build`/`refund`), generation_id nullable, note, created_at | Top-up credit ledger (D21); balance = sum of `delta`; a build past the monthly allowance spends one |
| `analytics_events` | id, user_id nullable, project_id nullable, name, props jsonb, occurred_at | See METRICS.md |

Generation `status` values: `queued`, `planning`, `editing`, `checking`, `bundling`, `repairing`, `succeeded`, `failed`, `cancelled`, `timed_out`.

Implemented in `packages/db/src/schema.ts` (Drizzle; `pnpm db:generate` writes the up migration, and each one needs a hand-written `migrations/down/<tag>.sql`). Beyond the table above: `users.is_admin`; `generations.kind` (`initial` | `edit`, for model routing and `build.*` metrics); `jobs.cancel_requested`, `jobs.last_error`, `jobs.finished_at`. `magic_links.token_hash` and `sessions.id` are SHA-256 hashes of the emailed and cookie tokens; the tokens themselves are never stored. A snapshot's JSON holds only the project-owned files; the foundation is added when an app is assembled.

## 3. Generation state machine (worker)

```
queued
  └─> planning        call provider for plan; write assistant message (streamed)
        └─> editing   tool-call loop: read_file / write_file / delete_file / list_files
              └─> checking      packages/checker: tsc --noEmit against pre-baked node_modules
                    ├─ ok ──> bundling     push files to Snack session; await bundle result
                    │           ├─ ok ──> snapshot ──> succeeded
                    │           └─ error ──> repairing (attempt < 2) ──> editing
                    └─ error ──> repairing (attempt < 2) ──> editing
repairing with attempt == 2 ──> failed (keep base_snapshot_id as project.current_snapshot_id)
any state on cancel ──> cancelled (keep base snapshot)
any state at 4 min ──> timed_out (keep base snapshot)
```

Rules the code must enforce:

- `generation_steps` rows are written by the worker after the operation succeeds or fails, never from model text.
- `projects.current_snapshot_id` changes only in the `snapshot` step or on restore.
- Restore never edits history: it writes a new snapshot with the target's files (parent: the snapshot that was current), sets it current, and enqueues a `preview` job. It is refused (409) while a build is active. Starting a build and restoring both lock the project row (`projects.lock`), and a build reads its base snapshot under that lock.
- Exactly one generation per project may be in a non-terminal state (partial unique index).
- Working files live in memory and in a temp dir on the worker for the duration of the run, seeded from the base snapshot.

## 4. Tool contract (model ↔ server)

| Tool | Args | Server validation |
| --- | --- | --- |
| `list_files` | none | Returns project-owned paths only, never foundation internals |
| `read_file` | `path` | Path must be inside allowed layout (`src/screens/**`, `src/data/models.ts`, `src/data/seed.ts`, `src/navigation.tsx`) or a foundation read-only path (including `app.json`; Buildly writes the app name into it from the project name, the model never edits it) |
| `write_file` | `path`, `contents` | Same layout rules; rejects `package.json`, `foundation.json`, `src/data/store.ts`, `src/theme/**`, `src/components/**`; rejects imports not in the allowlist; size cap 64 KB per file |
| `delete_file` | `path` | Only project-owned paths |
| `finish` | `summary`, `screens[]` | Ends the edit loop; `screens` feeds the screen list |

Rejections are returned to the model as tool errors with a reason, and count toward a per-run rejection budget (10) after which the run fails.

The layout, allowlist, forbidden files, and schema-version rule live in `packages/foundation/foundation.json` (schema: `foundationManifestSchema` in `packages/shared`). Project files must keep this contract with the read-only `App.tsx`: `src/navigation.tsx` exports `RootNavigator`, `src/data/models.ts` exports `schemaVersion`, and `src/data/seed.ts` exports `seed()`.

## 5. Context builder

Input order, with a token budget of 80k input tokens per turn:

1. System prompt: role, hard rules from `foundation.json`, the layout rules above, the schema-version rule.
2. Foundation public API digest: exported component props, store and repository signatures, navigation registration pattern. Generated at build time from the foundation source into `packages/foundation/dist/api-digest.md`.
3. Current project files (full contents; they are small by construction).
4. Conversation history (last 20 messages, older ones summarized).
5. The user's message.

Prompt caching: keep 1 to 3 byte-identical across turns in a run so cache hits apply.

## 6. Snack integration

- One Snack session per project, held by the worker process, created lazily on first successful generation, updated on every snapshot change and on restore. After a successful build the generation job pushes the new snapshot itself; a restore enqueues a `preview` job (payload `{ projectId }`) that pushes whatever snapshot is current. Each push stores the channel in `projects.snack_session_id` and publishes a `preview_updated` project event. A failed push leaves the build `succeeded`; only the preview is stale.
- `sdkVersion` is pinned in `packages/foundation/foundation.json` (54.0.0, D17) and must be one the published `snack-sdk` accepts (SPIKES.md S2); `SNACK_SDK_VERSION` must equal it.
- The worker reads bundle errors from the session's state and normalizes them into the same diagnostic shape the checker uses (`packages/shared/src/diagnostics.ts`). Snack does not report runtime errors (SPIKES.md S1), so the foundation logs each one as a `[buildly:runtime-error] {json}` console line, which the log listener parses with `fromRuntimeLog`.
- Snack transforms app code on the viewing client (Expo Go or the web player), not on Snack's servers. The generation's bundle step (`checkBundle`) therefore uploads the files to a throwaway offline session and checks what is knowable server-side: the upload completes and every dependency resolves (missing peers included). Compile and runtime errors are reported only by connected clients, which the live session collects after the snapshot is pushed. Syntax and type errors are caught earlier by the checker's `tsc`. A failing bundle step never changes what the live preview shows.
- Files sent are the foundation files (including `app.json`) plus the project files; dependencies are the `foundation.json` allowlist minus `react`, `react-native`, and `expo`, which the runtime provides.
- Each project's `app.json` gets a unique `expo.slug` (derived from the project id). Expo Go shares one AsyncStorage between every Snack on a phone, and the store scopes all keys by that slug, so two previews never read each other's data or `schemaVersion`.
- The web preview is a second, offline snack-sdk instance in the browser: the player receives code only by postMessage from an SDK instance in the same page, so `GET /api/projects/:id/preview` returns the current snapshot assembled with `assembleSnackFiles` (the same file set the worker's session sends), the dependencies, the SDK version, and `SNACK_WEB_PLAYER_URL`; the workspace feeds them to its instance and renders the iframe through the SDK's web preview reference. The worker's online session serves Expo Go (its `url` and channel). "Reset demo data" posts `buildly:reset-demo-data` into the player, which the foundation's `PreviewBridge` handles on web. The web app cannot read the foundation package's directory at runtime (Turbopack), so it imports `packages/foundation/dist/foundation-files.json`, emitted with the digest and checked in CI.
- Web preview uses Buildly's self-hosted build of the Snack web player (`webPlayerURL`, D18) because Snack's hosted player only talks to Expo's allowlisted origins. It lives on its own registrable domain, since it runs generated code in the user's browser. Expo Go uses Snack directly.
- The player is `packages/web-player`: expo/snack's `runtime` (web target) at the last commit on the foundation's SDK, with one patch that reads the allowed origins from `EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS` at build time (exact origins or `https://*.host`; `http://localhost:*` always) and one that uses the published `snack-*` packages instead of the monorepo's `file:` links. `build.sh` writes `dist/v2/<sdk major>/`, the path `snack-sdk` requests (`<webPlayerURL>/index.html?initialUrl=…&origin=<page origin>`), and `deploy.sh` uploads it to the player bucket behind CloudFront (HOSTING.md). A new SDK or a new origin is a rebuild and redeploy; its README has the steps.
- Snack sessions never receive secrets. Files sent are exactly the foundation plus project files.

## 7. API surface (apps/web)

Route files are thin: each calls a handler in `apps/web/src/server/handlers/` with injected `Deps` (db, storage, email sender, app URL, clock), which is what the integration tests call. `@buildly/db` exposes the runtime API; migrations (`@buildly/db/migrate`), the dev seed (`/seed`), and test helpers (`/testing`) are separate entry points so they stay out of the web bundle.

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/magic-link` | POST | Request link (invite gate) |
| `/api/auth/callback` | GET | Consume link, create session |
| `/api/projects` | GET, POST | List, create from prompt or starter |
| `/api/projects/:id` | GET, PATCH | Load workspace state (project, messages, generations with steps, `lastEventId`), rename |
| `/api/projects/:id/messages` | POST | Send chat message, enqueue generation (returns generation id or 429 with reason) |
| `/api/projects/:id/stream` | GET (SSE) | Stored progress events (SSE id = `project_events.id`, resumable from `Last-Event-ID` or `?after=`) and live assistant deltas |
| `/api/generations/:id/cancel` | POST | Cancel |
| `/api/projects/:id/snapshots` | GET | History |
| `/api/projects/:id/snapshots/:sid/restore` | POST | Restore |
| `/api/projects/:id/export` | POST | Build ZIP, returns signed download URL |
| `/api/projects/:id/preview` | GET | Snapshot files assembled for Snack, dependencies, SDK version, player URL, channel, build status |
| `/api/projects/:id/track` | POST | `preview.*` analytics from the browser |
| `/api/me` | GET, PATCH | Profile, usage against cap |

## 8. Security boundaries

- OpenAI key, storage credentials, and DB URL exist only in the worker and server runtime env. A CI test greps the built client bundle and every export ZIP for key prefixes and env names.
- The web player iframe is sandboxed; the workspace page sets a CSP that allows only the self-hosted player origin for `frame-src`.
- Generated code never runs on Buildly servers. The checker runs `tsc` only, with a 60-second timeout and no scripts, against the foundation `node_modules` baked into the worker image (`apps/worker/Dockerfile`, `CHECKER_NODE_MODULES`).
- Rate limits and caps are enforced in the API before a job is enqueued, and re-checked by the worker on claim.

## 9. Environment variables

Documented in `.env.example`; validated with zod at startup in both apps by `loadConfig('web' | 'worker', env)` from `@buildly/shared/config`, which checks only the variables that service receives. The config entry point is separate from `@buildly/shared` so env names never reach a client bundle, where the secret guard (`scripts/check-no-secrets.ts`) would flag them. Which service receives which variable is in [`HOSTING.md`](HOSTING.md) §4.

```
DATABASE_URL
STORAGE_REGION, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
STORAGE_ENDPOINT            optional: empty for AWS S3, http://localhost:9000 for the local RustFS server (D20)
OPENAI_API_KEY, GENERATION_MODEL_PLAN, GENERATION_MODEL_EDIT
OPENAI_BASE_URL             optional: only for a proxy or a test server
EMAIL_PROVIDER_API_KEY, EMAIL_FROM
SESSION_SECRET
APP_URL
SNACK_SDK_VERSION
SNACK_WEB_PLAYER_URL        web, optional: Buildly's self-hosted Snack web player, https://<player host>/v2/%%SDK_VERSION%% (D18); empty falls back to Expo's hosted player, which only works from localhost
SENTRY_DSN                  optional: empty disables Sentry (local development)
```

## 10. Hosting

Railway (web, worker, Postgres) and AWS S3 (storage), both in Singapore. Full setup, costs, and alternatives in [`HOSTING.md`](HOSTING.md).
