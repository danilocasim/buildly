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

Result: _pending_

## S2. Snack SDK and dependency allowlist check (gates Phase 2)

**Time box:** half a day.

Steps:

1. List the Expo SDK versions Snack currently supports.
2. For the candidate SDK, verify each allowlisted dependency resolves in a Snack session: `@react-navigation/native`, `@react-navigation/native-stack`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, `expo-status-bar`, `@expo/vector-icons`.
3. Record resolved versions into `packages/foundation/foundation.json`.

Pass criteria: every dependency resolves on both web and Expo Go. Any that does not is removed from the allowlist or replaced.

Result (2026-09-30): **resolution passes; Expo Go on phones is unverified and at risk.** Code and raw output: `spikes/snack-sdk-check/` (`pnpm install && pnpm check`, results in `results/sdk-*.json`).

- `snack-sdk` 6.6.2 (latest on npm, published 2026-04-01) accepts SDKs 50–54 and rejects anything newer (`Invalid SDKVersion`). Upstream `expo/snack` main supports 55 and 56 (#677, #690), and the hosted web player serves 50–56 (57 returns 404), but no npm release carries them. SDK 57 support is an open issue (#691).
- For every SDK 50–54, all eight allowlisted dependencies resolve in a Snack session with no missing peers: React Navigation and `react-native-screens` / `expo-status-bar` get Snackager bundles; `react-native-safe-area-context`, `@react-native-async-storage/async-storage`, and `@expo/vector-icons` are preloaded in the Snack runtime.
- Pinned **SDK 54.0.0** (newest the SDK accepts). Versions in `packages/foundation/foundation.json`: React Navigation `native` 7.5.0, `native-stack` 7.20.0, `bottom-tabs` 7.20.0 (latest stable; 8.x is alpha); `react-native-screens` ~4.16.0, `react-native-safe-area-context` ~5.6.0, `@react-native-async-storage/async-storage` 2.2.0, `expo-status-bar` ~3.0.9, `@expo/vector-icons` ^15.0.3 (Expo's SDK 54 versions); core `expo` ~54.0.32, `react` 19.1.0, `react-native` 0.81.5.
- **Risk:** Expo's current SDK is 57 and expo.dev/go offers Expo Go only for SDK 57. Store Expo Go runs a single SDK, so it most likely cannot open an SDK 54 Snack. This check does not run code on a device, so the "Expo Go" half of the pass criteria is not met yet. S1 must test an SDK 54 Snack on current store Expo Go (iOS and Android); if it fails, P1 needs a phone-preview decision (wait for Snack SDK 57 on npm, or a development build).

## S3. OpenAI tool calling and cost smoke (gates Phase 4)

**Time box:** half a day.

Steps:

1. Call the OpenAI API with the official `openai` SDK, streaming on, with the five tool definitions from ARCHITECTURE.md section 4 declared as strict function schemas.
2. Ask for a two-screen app on the foundation API digest; run until `finish`.
3. Record: tool-call correctness (valid JSON args, valid paths), number of turns, input/cached/output tokens, wall time, and cost at published rates, for the flagship candidate (`gpt-6.1-sol`), the coding candidate (`gpt-5.3-codex`), and the small candidate (`gpt-6-luna`).
4. Run one follow-up edit ("add a Favorites tab") on the small model to get an early read on routing.
5. Confirm usage fields expose cached tokens so cost accounting can be exact.

Pass criteria: tool calls parse on the first try in at least 4 of 5 runs per model; usage reports cached tokens; an initial build costs under $0.20 on the flagship; the small-model edit costs under $0.02.

Result: _pending_

## S4. Checker speed with pre-baked node_modules (gates Phase 2 slice 2.5)

**Time box:** half a day.

Steps:

1. Install foundation dependencies once into `packages/foundation/node_modules`.
2. Assemble a starter into a temp dir with a symlinked `node_modules`, run `tsc --noEmit -p tsconfig.json`.
3. Measure cold and warm times; try `tsc --incremental` with a shared `tsbuildinfo`.

Pass criteria: warm check under 15 seconds on the worker's target instance size.

Result: _pending_
