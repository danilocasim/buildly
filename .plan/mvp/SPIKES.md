# Spikes

Time-boxed. Each ends with a written result in this file and, if needed, an update to `DECISIONS.md`. Spike code lives under `spikes/` and is never imported by product packages.

## S1. Snack web preview on the staging domain (gates Phases 5 and 6)

**Time box:** 2 days.
**Why:** An open issue reports the `snack-sdk` web preview iframe failing outside localhost.

Steps:

1. Create `spikes/snack-embed/` as a minimal Next.js page that instantiates `Snack` from `snack-sdk` with a hello-world `App.tsx`, a bottom-tab React Navigation setup, and an AsyncStorage read/write, using the SDK version candidate for P2.
2. Wire the iframe using the SDK's web preview reference and render `webPreviewURL`.
3. Enable online mode and render the `url` as a QR code.
4. Deploy to the real staging domain, not a preview URL on a platform subdomain if the product domain will differ.
5. Load in Chrome, Safari, and Firefox. Scan the QR in Expo Go on iOS and Android.
6. Introduce a type error and a runtime throw; capture how errors surface in the SDK state.

Pass criteria (all required):

- Web preview renders on the staging domain in all three browsers.
- Expo Go opens the same session on both platforms and the AsyncStorage value persists across app restart.
- Bundle and runtime errors are readable programmatically from the SDK state with file and message.
- A dependency update in the session resolves within 60 seconds.

Fail handling: record the exact failure. If it is a domain restriction, try the SDK's documented options and contact Expo once. If still failing after the time box, set P1 to the fallback runner for web and open a Phase 4 slice for it.

Result (2026-09-30): **web preview fails on any non-allowlisted origin (resolved by D18); Expo Go passes on Android.** Code: `spikes/snack-embed/` (Next.js 16, `snack-sdk` 6.6.2, SDK 54, the S2 allowlist app).

- Served through a temporary Cloudflare quick tunnel (`https://*.trycloudflare.com`, standing in for the staging domain, which does not exist yet). The page loads, the Snack goes online, dependencies resolve from Snackager, and the iframe loads `snack-runtime.eascdn.net/v2/54/index.html?origin=<our origin>`, but the web player never connects (no `web` client in `connectedClients`, no logs, blank frame after 30 s).
- Cause, from the runtime source (`runtime/src/transports/RuntimeTransportImplWebPlayer.ts` in expo/snack): the hosted web player talks only to a hardcoded list of origins (Expo's Snack domains, Draftbit, Codecademy) plus `http://localhost:*`; for anything else it logs "Access to origin ... is forbidden" and drops all messages. This is expo/snack#535 (open since 2024-01). It does not depend on the browser, so the Chrome/Safari/Firefox matrix is moot for web: every non-allowlisted origin fails, including Buildly's staging and production domains.
- Options (DECISIONS.md P1): ask Expo to allowlist Buildly's origins (they have for partners, most recently Codecademy in #698); self-host the open-source web player with Buildly's origin allowed and point `webPlayerURL` at it; or the `expo export` fallback runner (TODO Phase 4b).
- Decision: D18. Self-host the Snack web player with Buildly's origins allowed (TODO 4b.0.1), ask Expo once to allowlist Buildly, and keep the `expo export` runner as the fallback. Feasibility: expo/snack is MIT-licensed and its `runtime` package already has a web build and deploy script (`web/deploy-script.js`) that Buildly can point at its own bucket.
- Expo Go, from this page's QR on the tunnel origin (founder's phones, current store Expo Go):

  | Device | Opens SDK 54 session | All allowlisted deps render | AsyncStorage survives force-quit |
  | --- | --- | --- | --- |
  | Android (model 2412DPC0AG) | yes | yes ("S2 dependencies loaded", tabs) | yes (counter 7 → 8) |
  | iPhone | not run in S1; the SDK 54 Snack template opened in S2 | not run | not run; covered by TODO 2.2.4 |

  One warning is forwarded from the device on load: React Native's deprecated `SafeAreaView` is used by a dependency (the app itself imports it from `react-native-safe-area-context`).
- Errors, read from the SDK state with the Android client connected:
  - Type error (`const x: number = "..."`): not reported and the app keeps running. Snack strips types without checking, so `tsc` in the checker (S4) is the only type gate.
  - Syntax error: `connectedClients[*].status = "error"` with `fileName: "App.tsx"` and the right `lineNumber`; this is what `awaitBundle` (TODO 4.5.1) can read.
  - Runtime throw at module load: the phone showed a red error screen, but the SDK state stayed `status: "ok"` and no log arrived. The repair loop cannot rely on Snack for runtime errors. Device `console.warn` is forwarded to the log listener, so the foundation should add an error boundary and a global error handler that `console.error` the error with file and message (TODO 2.1.1), and `awaitBundle` should treat those logs as runtime errors.
- Dependency update: adding `dayjs` resolved from Snackager in 725 ms (limit 60 s) while the device stayed connected.
- AsyncStorage also persisted across the six hot reloads the error tests caused (counter 1 → 7).

## S2. Snack SDK and dependency allowlist check (gates Phase 2)

**Time box:** half a day.

Steps:

1. List the Expo SDK versions Snack currently supports.
2. For the candidate SDK, verify each allowlisted dependency resolves in a Snack session: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, `expo-status-bar`, `@expo/vector-icons`.
3. Record resolved versions into `packages/foundation/foundation.json`.

Pass criteria: every dependency resolves on both web and Expo Go. Any that does not is removed from the allowlist or replaced.

Result (2026-09-30): **pass.** Code and raw output: `spikes/snack-sdk-check/` (`pnpm install && pnpm check`, results in `results/sdk-*.json`).

- `snack-sdk` 6.6.2 (latest on npm, published 2026-04-01) accepts SDKs 50–54 and rejects anything newer (`Invalid SDKVersion`). Upstream `expo/snack` main supports 55 and 56 (#677, #690), and the hosted web player serves 50–56 (57 returns 404), but no npm release carries them. SDK 57 support is an open issue (#691).
- For every SDK 50–54, all eight allowlisted dependencies resolve in a Snack session with no missing peers: React Navigation and `react-native-screens` / `expo-status-bar` get Snackager bundles; `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, and `@expo/vector-icons` are preloaded in the Snack runtime.
- Update 2026-09-30 (Phase 2): `expo-constants` ~18.0.14 joined the allowlist so the About screen can read `app.json` `extra.showAttribution`; it is preloaded in the SDK 54 runtime and the re-run check passes. `react`, `react-native`, and `expo` are in the allowlist too (they are the app's own dependencies).
- Pinned **SDK 54.0.0** (newest the SDK accepts). Versions in `packages/foundation/foundation.json`: React Navigation `native` 7.5.0, `native-stack` 7.20.0, `bottom-tabs` 7.20.0 (latest stable; 8.x is alpha); `react-native-screens` ~4.16.0, `react-native-safe-area-context` ~5.6.0, `@react-native-async-storage/async-storage` 2.2.0, `expo-status-bar` ~3.0.9, `@expo/vector-icons` ^15.0.3 (Expo's SDK 54 versions); core `expo` ~54.0.32, `react` 19.1.0, `react-native` 0.81.5.
- Expo Go on devices: Expo's current SDK is 57 and expo.dev/go lists only SDK 57 builds, which suggested store Expo Go could not open older Snacks. A manual test disproved that: the snack.expo.dev template on SDK 54 and on SDK 55 opened in current store Expo Go on an iPhone and an Android phone (founder, 2026-09-30; device models and Expo Go version not recorded). This used Snack's template, not the allowlist app; running `App.tsx` from the spike on devices, including AsyncStorage persistence, is part of S1.
- Watch item: Snack trails Expo (SDK 57 support, expo/snack#691, has been open since 2026-06-26, and npm `snack-sdk` has not been published since 2026-04-01). If store Expo Go drops SDK 54 before `snack-sdk` supports a newer SDK, phone preview breaks; D17 names this as a reopen condition.

## S3. OpenAI tool calling and cost smoke (gates Phase 4)

**Time box:** half a day.

Steps:

1. Call the OpenAI API with the official `openai` SDK, streaming on, with the five tool definitions from ARCHITECTURE.md section 4 declared as strict function schemas.
2. Ask for a two-screen app on the foundation API digest; run until `finish`.
3. Record: tool-call correctness (valid JSON args, valid paths), number of turns, input/cached/output tokens, wall time, and cost at published rates, for the flagship candidate (`gpt-6.1-sol`), the coding candidate (`gpt-5.3-codex`), and the small candidate (`gpt-6-luna`).
4. Run one follow-up edit ("add a Favorites tab") on the small model to get an early read on routing.
5. Confirm usage fields expose cached tokens so cost accounting can be exact.

Pass criteria: tool calls parse on the first try in at least 4 of 5 runs per model; usage reports cached tokens; an initial build costs under $0.20 on the flagship; the small-model edit costs under $0.02.

Result (2026-09-30): **pass on every criterion.** Code: `spikes/openai-smoke/` (`pnpm smoke`, key from the gitignored repo-root `.env`); raw output `results/2026-09-30T14-56-58-636Z.json`; rates from `packages/generator/src/rates.ts` (Standard tier, short context, retrieved 2026-09-30). Total spend $0.69.

- Setup: Responses API through the official `openai` SDK 7.25.0, streaming, the five tools from ARCHITECTURE.md §4 as strict function schemas, `previous_response_id` between turns, a fixed `prompt_cache_key`. Server-side path, layout, size, and import validation as in §4. The prompt asks for a two-screen recipe app on a hand-written foundation API digest (the S4 fixture's theme, components, and store stand in for the foundation). Each result is assembled with the foundation files and type-checked with the S4 pre-baked `node_modules`. The follow-up edit ("add a Favorites tab") runs on `gpt-6-luna` from the first flagship result.
- Criteria:
  - Tool calls parse on the first try in at least 4 of 5 runs per model: **5 of 5 for all three models** (0 JSON errors in 248 tool calls).
  - Usage reports cached tokens: **yes**; `input_tokens_details.cached_tokens` and `cache_write_tokens` are both present, so `costFor` (TODO 4.1.2) can be exact. `gpt-5.3-codex` reports 0 cache writes, matching its price sheet (no cache-write price).
  - Flagship initial build under $0.20: **mean $0.084, max $0.096**.
  - Small-model edit under $0.02: **$0.0029**.
- Per run:

  | Kind | Model | Run | Turns | Tool calls | JSON errors | Rejections | Input | Cached | Cache writes | Output | Cost | Wall | `tsc` |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | initial | `gpt-6.1-sol` | 1 | 5 | 15 | 0 | 0 | 21,842 | 10,352 | 9,814 | 6,746 | $0.0964 | 127 s | ok |
  | initial | `gpt-6.1-sol` | 2 | 7 | 17 | 0 | 1 | 36,262 | 27,996 | 6,584 | 6,775 | $0.0904 | 129 s | ok |
  | initial | `gpt-6.1-sol` | 3 | 7 | 16 | 0 | 1 | 29,438 | 19,302 | 8,454 | 5,345 | $0.0799 | 91 s | ok |
  | initial | `gpt-6.1-sol` | 4 | 6 | 16 | 0 | 1 | 24,577 | 16,906 | 5,992 | 6,210 | $0.0821 | 113 s | ok |
  | initial | `gpt-6.1-sol` | 5 | 6 | 16 | 0 | 1 | 25,630 | 18,883 | 5,068 | 5,256 | $0.0705 | 87 s | ok |
  | initial | `gpt-5.3-codex` | 1 | 3 | 13 | 0 | 0 | 9,588 | 2,560 | 0 | 2,745 | $0.0512 | 30 s | 1 err |
  | initial | `gpt-5.3-codex` | 2 | 3 | 13 | 0 | 0 | 9,382 | 5,120 | 0 | 2,565 | $0.0443 | 28 s | 2 err |
  | initial | `gpt-5.3-codex` | 3 | 3 | 13 | 0 | 0 | 9,679 | 5,120 | 0 | 2,860 | $0.0489 | 31 s | 1 err |
  | initial | `gpt-5.3-codex` | 4 | 3 | 13 | 0 | 0 | 9,441 | 5,120 | 0 | 2,607 | $0.0450 | 28 s | 1 err |
  | initial | `gpt-5.3-codex` | 5 | 3 | 13 | 0 | 0 | 9,717 | 5,120 | 0 | 2,914 | $0.0497 | 32 s | 1 err |
  | initial | `gpt-6-luna` | 1 | 13 | 24 | 0 | 0 | 106,082 | 86,969 | 17,413 | 11,677 | $0.0091 | 99 s | ok |
  | initial | `gpt-6-luna` | 2 | 5 | 16 | 0 | 0 | 22,042 | 10,991 | 9,375 | 6,459 | $0.0047 | 53 s | ok |
  | initial | `gpt-6-luna` | 3 | 12 | 19 | 0 | 0 | 84,000 | 68,631 | 14,526 | 9,603 | $0.0074 | 88 s | ok |
  | initial | `gpt-6-luna` | 4 | 9 | 16 | 0 | 0 | 37,626 | 28,112 | 7,826 | 4,931 | $0.0039 | 48 s | ok |
  | initial | `gpt-6-luna` | 5 | 10 | 16 | 0 | 0 | 43,383 | 35,223 | 6,469 | 6,592 | $0.0046 | 61 s | ok |
  | edit | `gpt-6-luna` | 1 | 5 | 12 | 0 | 0 | 30,198 | 17,963 | 10,636 | 2,463 | $0.0029 | 23 s | ok |

- Observations for later phases (not pass criteria):
  - `gpt-6-luna` passed `tsc` on all 5 initial builds and the edit at about 1/14 of the flagship's cost (mean $0.006), with more turns (mean 9.8). Early signal for P3 and P5; EVAL.md E1 decides.
  - `gpt-5.3-codex` was fastest (3 turns, 30 s) but failed `tsc` in 5 of 5 runs, always on React Navigation screen typing in `src/navigation.tsx`; it never read the foundation files. Every build would need a repair round.
  - The flagship's 4 rejections were all `read_file` on files that did not exist yet (probing before creating). TODO 4.2.2 should answer those as "not found" without spending the rejection budget.
  - Caveats: one small prompt, no repair loop, and a hand-written digest; real starters and edits will cost more. Treat these as lower bounds.

## S4. Checker speed with pre-baked node_modules (gates Phase 2 slice 2.5)

**Time box:** half a day.

Steps:

1. Install foundation dependencies once into `packages/foundation/node_modules`.
2. Assemble a starter into a temp dir with a symlinked `node_modules`, run `tsc --noEmit -p tsconfig.json`.
3. Measure cold and warm times; try `tsc --incremental` with a shared `tsbuildinfo`.

Pass criteria: warm check under 15 seconds on the worker's target instance size.

Result (2026-09-30): **pass, with a wide margin.** Code and raw output: `spikes/checker-speed/` (`results/*.json`).

- Setup: the SDK 54 set from `foundation.json` installed once with `npm install --ignore-scripts` (697 packages, 307 MB, TypeScript 5.9.3 as in Expo's SDK 54 template, `extends: expo/tsconfig.base` + `strict`). A journal-like fixture (4 screens, typed AsyncStorage store, theme, 7 components; 450 lines) is copied into a fresh temp dir per check with `node_modules` symlinked, and `tsc --noEmit` runs with no npm scripts. Each check loads 505 files and about 125k lines of declarations.
- `tsc` time per check (5 runs each):

  | Environment | Cold | Warm median (max) | Incremental after a one-file edit |
  | --- | --- | --- | --- |
  | MacBook (Apple M5), host | 0.9 s | 0.7 s (1.0 s) | 0.6 s |
  | Docker linux/arm64, 1 vCPU, 2 GB | 2.2 s | 1.8 s (1.9 s) | 1.9 s |
  | Docker linux/amd64 (emulated), 1 vCPU, 2 GB | 4.1 s | 3.4 s (3.4 s) | 3.3 s |

- The emulated x86 container is the pessimistic proxy for the Railway worker and is still about 4x under the 15 s budget. Not yet measured on Railway hardware itself; TODO 2.5.3's `checker:selftest` confirms it there.
- `--incremental` with a kept `tsbuildinfo` saves nothing at this size, so the checker should use a fresh temp dir per check and skip incremental builds.
- An injected `const x: number = "a"` returns exit 2 and `src/screens/Broken.tsx(1,14): error TS2322 ...`, the file/line shape TODO 2.5.1 parses.
- Copying the pre-baked `node_modules` takes 7–9 s, so the worker image must bake it at build time (TODO 2.5.3), not copy per job; per-job assembly symlinks it.
