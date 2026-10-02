# Buildly — Revised MVP

> Build mobile apps with AI.

**Product name:** Buildly (confirmed; repo: `buildly`)
**Audience:** Developers and indie builders
**Generated stack:** React Native + Expo + TypeScript
**AI provider:** OpenAI (behind a provider-agnostic interface)
**MVP outcome:** A prompt or starter becomes a working app with a browser preview, a phone preview in Expo Go, chat edits, and an exportable Expo project

This revision keeps the original brief's product direction and visual concept, and narrows the build to what is needed to test the core hypothesis: **can an AI reliably turn a short description into a working, editable, exportable Expo app?** Everything that does not move that answer is cut or simplified.

## 0. What changed from the original brief and why

| Area | Original brief | Revised MVP | Reason |
| --- | --- | --- | --- |
| Preview runtime | Custom isolated runner, preview gateway, per-project Expo Web bundling | **Expo Snack runtime via `snack-sdk`** (web player iframe + Expo Go QR) | Removes the most expensive infrastructure in the plan. Snack gives both preview paths, dependency resolution, and bundle error reporting out of the box. |
| Navigation | Expo Router | **React Navigation** (native stack + bottom tabs) | Snack does not support Expo Router (open community request since Jan 2024, no maintainer response as of May 2025). |
| Persistence | expo-sqlite native + IndexedDB browser adapter + migrations | **AsyncStorage-backed typed document store** with a schema version | One implementation that works on web and native in Snack. SQL migrations are premature before the data model shape is validated. |
| Templates | Several template foundations, each versioned separately | **One foundation** + three pre-generated **starters** (Journal, Habit Tracker, Inventory) | One dependency set to maintain, verify, and pre-bake. Starters open instantly with no AI call. |
| Verification | TypeScript, bundling, and workflow checks in a runner | **`tsc --noEmit` against the pre-baked foundation** on the server + Snack bundle/runtime errors | Cheap and fast because every project shares the foundation's `node_modules`. |
| Checkpoints | Source checkpoints with explicit migration compatibility handling | **Immutable file snapshots per successful generation**; restore swaps files, and the app reseeds demo data on a store version mismatch | Data in an MVP preview is demo data. Migration semantics are deferred until real user data exists. |
| Plan review gate | Open decision | **No gate.** The plan is the first streamed message, then generation continues | Reduces friction; users can correct via chat immediately after. |
| Navigation surface | Home, My Apps, Templates, Settings | **Home (with recent apps), Starters, Workspace**; Settings reduced to name, usage, sign out | Fewer screens to build and test before the hypothesis is answered. |
| Accounts | Undecided | **Magic-link email auth, invite-only, hard per-user generation caps** | Needed to persist projects and control AI spend. |
| AI provider | DeepSeek | **OpenAI**, with a flagship model for plans and initial builds and a small model for edits and repairs | Decided 2026-09-30. Mature tool calling and SDK. Costs more per build than DeepSeek, so model routing is part of the pricing (section 13). |

Confirmed decisions from the original brief that are unchanged: mobile-only focus, React Native + Expo + TypeScript output, developers and indie builders first, prompts and starters, browser and phone previews, source export, no generated backend, and the approved dashboard and workspace mockup as visual direction.

## 1. Hypothesis and success metrics

The MVP exists to answer three questions. Each has a measurable target that decides whether to invest in the heavier architecture.

| Hypothesis | Metric | Target |
| --- | --- | --- |
| H1: A prompt produces a working app without manual fixes | Generations that pass checks (tsc + Snack bundle) within 2 repair attempts | ≥ 70% |
| H2: Chat edits preserve existing behavior | Follow-up edits that pass checks within 2 repair attempts, with no regression on the starter's smoke checks | ≥ 80% |
| H3: Users want the code, not just the demo | Active projects that are exported or opened on a phone | ≥ 30% |
| Operational | Median time from prompt to interactive preview | ≤ 3 minutes |
| Operational | AI cost per successful generation | Tracked from day one; no target yet |

Instrument these before the first external user.

## 2. Product direction

Users describe a mobile app or pick a starter, refine it through chat, preview it in the browser and on a phone, and export the Expo project to continue in their own IDE.

The public message is **building mobile apps**. Local-first persistence is an internal architecture property, not the headline.

## 3. Visual direction

Unchanged from the original brief: spacious, calm, practical, inspired by the Base44 dashboard reference. Warm white background, white surfaces, near-black and muted gray text, restrained orange accent, thin neutral borders, moderately rounded corners, subtle shadows, lightweight line icons.

```css
--background: #FAF9F7;
--surface: #FFFFFF;
--text-primary: #171717;
--text-secondary: #737373;
--border: #E8E5E1;
--accent: #FF641A;
--accent-subtle: #FFF0E6;
--success: #16A37B;
```

No promotional countdowns, decorative illustrations, or crowded navigation. The generated app is the primary visual content.

## 4. Screens in the MVP

| Route | Purpose | Notes |
| --- | --- | --- |
| Home | Heading, prompt composer, three starter cards, recent apps | Recent apps replaces a separate "My Apps" page for the MVP |
| Starters | The three starters with a phone thumbnail, description, and **Use starter** | Optional if Home cards are sufficient; keep the route reserved |
| Workspace | Chat, preview/code | The main experience; separate route from Home |
| Settings | Display name, generation usage against cap, sign out | Minimal |

Sidebar stays visible on desktop and collapses to a drawer below tablet width. The workspace must be usable on a 13-inch laptop.

### Home

**Heading:** What mobile app will you build?
**Prompt placeholder:** Describe your mobile app...
**Starter action:** Choose starter
**Primary action:** Build app

Composer rules: multiline input, starter chip at lower left (removable), Build at lower right, disabled on empty prompt unless a starter is selected, prompt preserved on error.

New users see a short invitation in place of the recent apps list.

### Workspace

Toolbar: back, app icon, editable project name, "Expo + TypeScript" badge, **Open on phone**, **Export code**.

| Panel | Contents |
| --- | --- |
| Chat | User requests, streamed progress, assistant responses, change composer with a subtle "OpenAI" label |
| Preview / Code | Snack web player inside a phone frame, or read-only file tree with highlighted source |

Preview controls: device presets (iPhone models at their real size in points, with the status bar and home indicator in each model's safe area; D24), build status, refresh, and **Reset demo data**. Label the runtime **Web preview**. Presets change dimensions and safe areas only; they do not emulate a native OS.

**Open on phone** shows the Snack QR code and the Expo Go install link, plus a one-line note that the phone must have Expo Go and internet access.

Chat rules:

- Stream progress only as real steps complete: `Plan ready`, `Files written`, `Types checked`, `Preview bundled`.
- Never mark a step done from the model's self-report.
- One generation at a time per project; the composer is disabled during a run.
- Cancel keeps the last working snapshot.
- Conversation history is stored per project.

## 5. Core user journey

1. Open Home and sign in via magic link if needed.
2. Enter a prompt or choose a starter.
3. Watch the plan stream, then the progress steps.
4. See the interactive web preview and the verification status.
5. Request changes in chat.
6. Scan the QR code to test in Expo Go.
7. Export the ZIP and run `npx expo start` locally.

Users can reopen projects and restore any earlier successful snapshot.

## 6. The foundation and starters

One versioned foundation, pinned to a Snack-supported Expo SDK, defines everything a generated app is allowed to use.

Foundation contents:

- `App.tsx` with React Navigation (native stack + bottom tabs) and a theme provider.
- `src/theme` tokens and a small component kit: Screen, Card, ListRow, Button, TextField, EmptyState, FAB.
- `src/data/store.ts`: typed collection store on AsyncStorage with `schemaVersion`, `seed()`, `reset()`, and a generic repository (`list`, `get`, `create`, `update`, `remove`, `search`).
- `src/data/seed.ts`: demo data, clearly labelled as demo in the UI.
- `package.json`, `app.json`, `tsconfig.json`, `README.md` with local run instructions.
- `foundation.json`: the allowlist of dependencies and their pinned versions, the file layout rules, and the smoke checks.

Starters are pre-generated file sets built on the foundation and committed to the repo, so they open instantly and act as regression fixtures for the generator:

| Starter | Screens | Data |
| --- | --- | --- |
| Journal | Entries, Entry detail, New entry, Tags | Entry, Tag |
| Habit Tracker | Today, Habits, Habit detail, History | Habit, CheckIn |
| Inventory | Items, Item detail, Adjust stock, Search | Item, Adjustment |

A free-form prompt always starts from the bare foundation. The model may not add dependencies outside the allowlist in the MVP.

## 7. Generated app architecture

| Concern | Implementation |
| --- | --- |
| Framework | React Native + Expo + TypeScript, Snack-supported SDK |
| Navigation | React Navigation (native stack, bottom tabs) |
| UI | Foundation component kit and tokens |
| Persistence | AsyncStorage typed document store, one implementation for web and native |
| Temporary UI state | React state |
| Demo data | `seed.ts`, reset from the preview toolbar |
| Backup | Deferred |

Rules:

- Screens use the repository layer; no direct AsyncStorage calls in screens.
- Records persist across app restarts on a phone.
- The store carries a `schemaVersion`. When the model changes a data model it must bump the version. On mismatch the app reseeds demo data and shows a one-time notice. Real migrations are deferred until real user data exists.
- Exported source has no dependency on the builder.

## 8. Preview and export via Snack

### How it works

- The server creates a Snack session per project with `snack-sdk`, sending the foundation files, the project files, and the pinned dependency list.
- The web player is embedded in an iframe using the SDK's web preview reference; bundle and runtime errors are read back from the session and fed to the repair loop.
- Enabling online mode yields a stable Expo Go URL, rendered as a QR code.
- Export is assembled server-side as a ZIP from the foundation plus project files, so it does not depend on an Expo account or Snack save state.

### Constraints to respect

- Expo Router is not available; generated apps use React Navigation.
- Only dependencies that Snack resolves are allowed; the foundation allowlist enforces this.
- Snack lags new Expo SDK releases; pin the foundation to a Snack-supported SDK and upgrade deliberately.
- Snack is a third-party hosted runtime. If it becomes unavailable or its terms change, previews stop working until the fallback below ships.

### Spike before committing (week 1)

There is an open issue reporting the SDK web preview iframe failing on non-localhost domains. Before building the workspace UI, deploy a throwaway page on the intended staging domain that embeds a Snack web preview from `snack-sdk`. If it fails and cannot be resolved, switch the web preview to the fallback while keeping Snack for the phone path.

### Fallback: pre-baked runner (not in MVP unless the spike fails)

A container image with the foundation's `node_modules` pre-installed. Per project, copy source files in, run `npx expo export --platform web`, and serve the static bundle on an isolated origin. Phone preview would then need a tunnelled dev server or EAS Update, which is why Snack remains the first choice.

## 9. OpenAI generation workflow

OpenAI is the provider, called through the official `openai` SDK behind a small provider interface so another provider can be added later. Model names are server config values, never hard-coded:

| Config | Used for | Chosen (E1, D22) | Fallback |
| --- | --- | --- | --- |
| `GENERATION_MODEL_PLAN` | Plans and initial builds | `gpt-5.3-codex` | `gpt-6.1-sol` |
| `GENERATION_MODEL_EDIT` | Follow-up edits and repairs | `gpt-6-luna` | the plan model, if the small model misses the H2 target |

Candidates came from OpenAI's pricing page as of 2026-09-30; the evaluation harness made the choice (EVAL.md run E1, DECISIONS.md D22).

1. Build the request context: user prompt, conversation history, `foundation.json` rules, the current project files, and the foundation's public API signatures.
2. Ask for a short plan (screens, data models, navigation). Stream it as the first chat message.
3. The model requests edits through tools: `read_file`, `write_file`, `delete_file`, `list_files`. The server validates paths against the foundation layout and rejects new dependencies.
4. Run `tsc --noEmit` on the server against the pre-baked foundation `node_modules`. Push to Snack and wait for a bundle result.
5. On failure, return the errors to the model. Maximum two repair attempts, then stop, keep the previous snapshot, and explain the failure in chat.
6. On success, store an immutable snapshot and refresh the preview.

The API key stays server-side. Structured outputs validate plans and tool arguments; they do not prove correctness.

Evaluation harness: a fixed task set run against each candidate model (initial generation for each starter, add a screen, change a data model, rename a field, repair an injected type error). Track completion rate, repair attempts, latency, and cost per success. Rerun it whenever the foundation or system prompt changes.

## 10. Builder infrastructure

Defaults chosen so one engineer can ship in weeks. Any can be swapped later.

| Component | Default | Responsibility |
| --- | --- | --- |
| Web app | Next.js (App Router), TypeScript | Home, workspace, auth, API routes |
| Database | Managed Postgres | Users, projects, conversations, snapshot metadata, usage |
| Object storage | S3-compatible bucket | Snapshot file sets and export ZIPs |
| Job runner | A single worker process with a queue table (or a managed queue) | Generation runs, tsc, Snack session updates |
| Auth | Magic-link email | Invite-only allowlist during MVP |
| Preview | Expo Snack via `snack-sdk` | Web player and Expo Go |
| Hosting | Any Node host that can run a long-lived worker | The worker needs the foundation `node_modules` on disk |

Limits: per-user daily generation cap, per-project max active generation of one, generation timeout of 4 minutes including repairs.

## 11. MVP boundaries

### Include

- Home with prompt composer, three starters, recent apps.
- Workspace with chat, Snack web preview, read-only code view.
- Free-form generation and follow-up edits with bounded repair.
- Phone preview via Snack QR into Expo Go.
- Snapshots per successful generation with restore.
- ZIP export with README.
- Magic-link auth, invite list, usage caps, basic analytics on the metrics in section 1.

### Defer

- Expo Router, expo-sqlite, IndexedDB adapter, data migrations.
- Custom isolated runner and preview gateway (fallback only).
- Multiple foundations, arbitrary dependencies, repository import.
- Editable code panel, drag-and-drop editing, theme controls.
- Generated cloud backends, auth, sync.
- Store submission, signing, standalone builds, development builds.
- Voice, image-to-app, marketplace, collaboration, billing.
- Additional AI providers and user-selectable models.

## 12. Acceptance criteria

- A user can start from a prompt or a starter and land in a workspace with a live preview rendered from the actual generated project.
- Each starter's navigation and CRUD flows work in the web preview and in Expo Go.
- Records created in Expo Go survive closing and reopening the app.
- A chat request to add a screen succeeds without breaking existing screens (verified by the starter smoke checks).
- A chat request that changes a data model bumps the store version and the app reseeds with a visible notice.
- A failed generation keeps the last working snapshot and shows the failure reason.
- Restoring an earlier snapshot swaps the source and refreshes the preview.
- The exported ZIP runs with `npm install && npx expo start` on a clean machine using the README instructions.
- Browser and phone verification results are reported separately in the workspace.
- No OpenAI credentials appear in client code, Snack sessions, or exports.
- The metrics in section 1 are recorded for every generation.

## 13. Business model, pricing, and limits

### Recommendation

Freemium with one paid plan, priced low because the unit economics allow it. The audience is developers and indie builders, who are price-sensitive and distrust tools that hold their code hostage. So: export is never gated and the free tier is genuinely usable. All builds run on Buildly's own OpenAI access; there is no bring-your-own-key option, so usage is governed only by the plan.

### Unit of usage: the build

A **build** is one user message that triggers a generation run, including the plan and up to two repair attempts. Users can predict it, and the server bounds its cost with the 4-minute timeout and the repair cap. Starters, restores, previews, QR scans, and exports do not consume builds.

### Cost basis

Estimated per build, assuming about 60k input tokens across tool-call turns with 70% prompt-cache hits and about 8k output tokens, at OpenAI's Standard rates (checked 2026-09-30):

| Model | Input / cached / output per 1M tokens | Cost per build |
| --- | --- | --- |
| gpt-6.1-sol | $2.00 / $0.10 / $10.00 | ~$0.12 |
| gpt-5.3-codex | $1.75 / $0.175 / $14.00 | ~$0.15 |
| gpt-6-luna | $0.10 / $0.01 / $0.50 | ~$0.006 |

**Model routing is required, not optional.** Plans and initial builds use the flagship model; edits and repairs use the small model. With about one initial build for every three edits, the blended cost is about **$0.035**, so plan for **$0.04 per build**. Using the flagship for everything costs about **$0.12 per build**, which breaks the Pro plan at full usage (see "Why these numbers").

Batch and Flex processing cost half, but they are too slow for interactive builds. Use them for the nightly evaluation harness.

Fixed costs at MVP scale are about $50 to $100 per month (managed Postgres, a small host with a worker, object storage, email). Snack is hosted by Expo at no charge. Break-even is roughly ten Pro subscribers.

### Plans

| | Free | Pro | Top-up |
| --- | --- | --- | --- |
| Price | $0 | **$12/month** or **$96/year** | **$5 for 50 builds**, never expire |
| Builds per month | 15 | 200 | Added to any plan |
| Projects | 2 | Unlimited | |
| Snapshot history | Last 10 per project | Unlimited | |
| Concurrent builds | 1 | 2 | |
| Queue | Standard | Priority | |
| Web + phone preview | Yes | Yes | |
| Export | Yes | Yes | |

Why these numbers:

- **$12 undercuts the category** (comparable AI builders sit at $20 to $25). With model routing, a Pro user who uses all 200 builds costs about $8, so even the heaviest user leaves margin. Real median usage will be far below 200 builds.
- **Guardrail.** Without routing, a maxed-out Pro user costs about $24, twice the price. If the evaluation harness shows the small model cannot meet the H2 target for edits, lower Pro to 80 builds or raise the price before the paid launch (open decision 4).
- **15 free builds** is enough to build one app and iterate on it a few times, which is what H1 and H3 need. Cost is about $0.60 per free user per month with routing, $1.80 without.
- **No bring-your-own-key.** Every build goes through Buildly's key, which keeps the product simple, keeps the cost signal in one place, and makes the plan the only lever for usage.
- **Top-ups** priced at $0.10 per build are 2.5x the blended cost and let occasional users avoid a subscription.

### Growth hooks that do not gate value

- Free-tier exports include a "Made with Buildly" line in the README and the app's About screen. Pro removes it. Users can delete it, and that is fine.
- Every project has a shareable Expo Go QR link; the landing page for that link says the app was built with Buildly.

### Limits after the beta

- Generation timeout stays at 4 minutes, repair cap at two.
- Free projects inactive for 90 days are archived (files kept, previews stopped) and restored on open.
- Abuse controls: email verification, one Free account per email, and a rate limit of 10 builds per hour on Free.
- Payments via Stripe Checkout and the customer portal; no custom billing UI in the first paid release.

### Not now

Team plans, seats, an enterprise tier, usage-based token billing, and a marketplace. Revisit once Pro has at least 100 subscribers and the metrics in section 1 hold.

## 14. Build order (about six weeks for one focused engineer)

| Week | Deliverable |
| --- | --- |
| 1 | Foundation package, three starters as committed fixtures, Snack embed spike on the staging domain, `tsc` check script |
| 2 | Auth, projects and snapshots schema, worker with generation loop and tool validation, evaluation harness with the fixed task set |
| 3 | Workspace UI: chat streaming, preview iframe, QR modal, code view |
| 4 | Home, starters, recent apps, restore, export ZIP, usage caps |
| 5 | Model evaluation pass, prompt and foundation tuning against the harness, error handling and repair polish |
| 6 | Invite-only beta with ten users, metrics review against section 1 targets |

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| Snack web preview fails on the production domain | Confirmed by the week-1 spike (Expo's player is origin-locked); self-host the open-source player (D18), fallback runner for web only |
| Snack availability or policy changes | Export never depends on Snack; fallback runner documented |
| Model output quality on React Native | Fixed harness, strict foundation allowlist, small component kit that constrains the solution space |
| Snack SDK version lag blocks a needed Expo feature | Pin the foundation; treat SDK upgrades as a planned task |
| AI cost overruns | Model routing, per-plan build caps, repair limit of two, cost tracked per run, spend limit set in the OpenAI dashboard |
| Small model too weak for edits | Harness decides routing; fall back to the flagship for edits and apply the Pro guardrail in section 13 |
| OpenAI price or model changes | Model names are config and cost per build is logged, so routing and caps can be adjusted without code changes; the provider interface allows adding another provider |

## 16. Open decisions

1. Whether a Starters page is needed beyond the Home cards.
2. Snack web preview versus fallback runner, decided by the week-1 spike: self-hosted Snack web player, with the runner as fallback (D18).
3. Which OpenAI model serves plans and which serves edits, decided by the evaluation harness.
4. Pro build cap or price if model routing cannot hold the blended cost near $0.04 per build.

Resolved: product name is Buildly (section 0 header); pricing and limits are in section 13, with no bring-your-own-key option; the AI provider is OpenAI (section 9).

## 17. References

- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing): basis for the cost-per-build estimates in section 13.
- [Snack SDK docs](https://github.com/expo/snack/blob/main/docs/snack-sdk.md): files, dependencies, web preview reference, online URL for Expo Go, ZIP download.
- [Snack Expo Router discussion](https://github.com/expo/snack/discussions/531): unanswered since January 2024.
- [snack-sdk web preview outside localhost](https://github.com/expo/snack/issues/535): open issue driving the week-1 spike.
- [Expo Snack repository](https://github.com/expo/snack)
- [OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling)
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) (deferred path)

Recheck Snack's supported SDK versions and dependency resolution during week 1. This document does not pin an Expo SDK; OpenAI model names are starting candidates only.
