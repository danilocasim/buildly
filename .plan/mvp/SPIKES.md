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

Result: _pending_

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
