# Decision log

Newest at the bottom. A decision is one line of what, one of why, and what would reopen it.

| # | Date | Decision | Why | Reopen if |
| --- | --- | --- | --- | --- |
| D1 | 2026-09-30 | Product name is **Buildly** | Confirmed by the founder | Never for the MVP |
| D2 | 2026-09-30 | Previews run on **Expo Snack** via `snack-sdk`, not a custom runner | Removes the runner, gateway, and per-project bundling; gives web and Expo Go for free | Spike S1 fails, or Snack terms or availability change |
| D3 | 2026-09-30 | Generated apps use **React Navigation**, not Expo Router | Snack does not support Expo Router | Snack adds support and the harness shows no regression |
| D4 | 2026-09-30 | Persistence is an **AsyncStorage typed document store** with `schemaVersion`; no SQL, no migrations | One implementation on web and native inside Snack; migrations premature | Real user data exists in installed apps |
| D5 | 2026-09-30 | **One foundation, three starters** as committed fixtures | One dependency set to verify and pre-bake; starters double as regression fixtures | Harness shows the foundation cannot express common prompts |
| D6 | 2026-09-30 | Verification is **`tsc --noEmit` + Snack bundle result**, repair cap **2**, timeout **4 min** | Cheap, fast, bounded | H1 target missed because of check gaps |
| D7 | 2026-09-30 | **No plan approval gate**; plan streams as the first message | Less friction | Beta users repeatedly ask to edit the plan before generation |
| D8 | 2026-09-30 | **Magic-link auth, invite-only, hard caps** | Persist projects and control spend | Public launch |
| D9 | 2026-09-30 | Builder stack defaults: **Next.js, Postgres, S3-compatible storage, queue table + one worker** | One engineer can ship in weeks | Scale or hosting constraints |
| D10 | 2026-09-30 | Business model: **Free 15 builds / Pro $12 for 200 builds / $5 top-up**; export never gated; **no bring-your-own-key** (usage governed only by the plan) | Cost per build is cents; developer trust needs ungated export; one key keeps cost tracking and the product simple | Blended cost per build rises above $0.06 (see D16) or conversion data says otherwise |
| D11 | 2026-09-30 | Billing implementation is **post-beta** | Beta is invite-only; plan column exists from day one | Beta ends |
| D12 | 2026-09-30 | Export ZIP is **assembled by Buildly**, not Snack's download | No Expo account dependency; control over README and "Made with Buildly" | Never for the MVP |
| D13 | 2026-09-30 | Web app, worker, and Postgres run on **Railway** in Singapore, with staging and production environments (see HOSTING.md) | Cheapest and fastest to set up for one engineer; the worker needs a long-lived container, which rules out serverless-only hosts | AWS credits appear, or paying users justify ECS Fargate |
| D14 | 2026-09-30 | Object storage is **AWS S3** in `ap-southeast-1`, private bucket, presigned downloads, exports expire after 7 days | Costs under $1 a month at beta size; the code already targets the S3 API; keeps a path to AWS open | Download volume reaches hundreds of GB a month (R2 has free egress) |
| D15 | 2026-09-30 | Supporting services: **Resend** for email, **Cloudflare** for DNS and TLS, **Sentry** for errors; Stripe only after the beta | Free tiers cover the beta | Public launch (Resend paid plan) |
| D16 | 2026-09-30 | AI provider is **OpenAI**, replacing DeepSeek. Official `openai` SDK behind a provider interface; model names are config; **model routing**: flagship for plans and initial builds, small model for edits and repairs | Founder's choice; mature tool calling. Flagship-only costs about $0.12 per build, which breaks the Pro plan at full usage, so routing (blended about $0.04) is required | Harness shows the small model misses H2 (then P5), or OpenAI prices change |
| D17 | 2026-09-30 | Foundation pins **Expo SDK 54.0.0** (resolves P2), with the versions in `packages/foundation/foundation.json` | Newest SDK the published `snack-sdk` (6.6.2) accepts; every allowlisted dependency resolves on it (SPIKES.md S2) | `snack-sdk` on npm supports a newer SDK, or store Expo Go stops opening SDK 54 Snacks (it did on iOS and Android on 2026-09-30, SPIKES.md S2) |
| D18 | 2026-09-30 | Web preview uses a **self-hosted build of Snack's open-source web player** with Buildly's origins allowed, passed to `snack-sdk` as `webPlayerURL`, on its own registrable domain; Expo Go stays on Snack. Resolves P1. Ask Expo once to allowlist Buildly's origins; the `expo export` runner (TODO 4b.1–4b.3) is the fallback | Snack's hosted player refuses origins outside Expo's hardcoded allowlist (SPIKES.md S1). Self-hosting keeps the Snack pipeline and error reporting with one static build per SDK; the export runner needs containers and per-project builds | Expo allowlists Buildly (drop the self-hosted copy), or the player cannot be built or kept current per SDK (move to the export runner) |
| D19 | 2026-09-30 | The foundation and starters test on **Jest with `jest-expo`** and React Native Testing Library; every other package keeps Vitest | React Native ships untranspiled Flow and needs Expo's Babel preset and native mocks, which `jest-expo` provides and Vitest does not; `pnpm test` still runs everything | Vitest gains first-class React Native support |

## Pending, gated on spikes or the harness

| # | Question | Gate | Options |
| --- | --- | --- | --- |
| P3 | Which OpenAI model for plans and which for edits | EVAL.md run E1 | Plan: `gpt-6.1-sol` or `gpt-5.3-codex`. Edit: `gpt-6-luna`, or the plan model if the small one misses H2 |
| P5 | Pro build cap or price if routing cannot hold blended cost near $0.04 | EVAL.md run E1 | Keep 200 builds at $12; lower Pro to 80 builds; raise Pro price |
| P4 | Whether a Starters page is needed beyond Home cards | Beta feedback | Reserve the route; ship only Home cards |
