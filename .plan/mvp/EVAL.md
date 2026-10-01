# Evaluation harness

`packages/eval` runs a fixed task set through the real generation loop against a chosen model and reports the metrics the brief asks for. It is the gate for model choice (P3) and for any change to the foundation, system prompt, or tool layer.

## Command

```bash
pnpm eval --plan-model gpt-6.1-sol --edit-model gpt-6-luna --tasks all --runs 3 --out .eval/<date>-<config>.json
pnpm eval:report .eval/<date>-<config>.json   # prints a markdown table
```

`--plan-model` serves T1–T3 and T10; `--edit-model` serves T4–T9. Passing only `--model` uses one model for everything.

Runs are real API calls and cost money. `--tasks smoke` is the CI subset (T1, T4, T7), run nightly. Harness runs use OpenAI's Flex processing where the model supports it, which costs half; interactive builds in the product always use Standard.

`--dry-run` swaps in a scripted provider (no API calls, no Snack): T1 replays the journal starter, T7 restores the broken file, other tasks finish unchanged. It exercises the loop, the checks, and the report for free and is labeled as not a model result. Without model flags the CLI uses `GENERATION_MODEL_PLAN` / `GENERATION_MODEL_EDIT`; `pnpm eval` reads `.env` if present.

Implementation (`packages/eval`): each run goes through the real `runGeneration` loop with the real checker (`typecheckFiles`) and, outside dry runs, the real OpenAI provider and Snack bundle check (`checkBundle`). Store and progress events are in memory rather than a temp Postgres; the database adds nothing to what is scored. `wall_seconds` is the loop's duration, since there is no queue in between. Checks are functions in `src/checks.ts`. Some are static heuristics over the files: routes come from `src/navigation.tsx`, models from exported types in `src/data/models.ts`, and seed counts from `.create(` calls. Smoke tests run the starter's committed Jest test against the run's files (`SMOKE_ROOT` in `packages/starters/jest.config.cjs`), in a child process with no secrets in its environment, because it executes model-written code. T6 renames `quantity` in the test source the same way.

Not yet implemented: Flex processing. Costs are computed at Standard rates, so harness costs are an upper bound until the provider passes `service_tier`.

## Task set

| ID | Type | Base | Prompt | Must hold after the run |
| --- | --- | --- | --- | --- |
| T1 | Initial build | Foundation | "A journal app with entries, tags, and search" | tsc ok; bundle ok; screens include an entries list and an entry detail; store has Entry model; seed has ≥ 3 entries |
| T2 | Initial build | Foundation | "Habit tracker with daily check-ins, streaks, and history" | tsc ok; bundle ok; Habit and CheckIn models; a Today screen |
| T3 | Initial build | Foundation | "Inventory app: items, quantities, adjust stock, search" | tsc ok; bundle ok; Item and Adjustment models; adjust flow updates quantity |
| T4 | Add screen | Journal starter | "Add a Favorites tab showing starred entries" | tsc ok; bundle ok; existing starter smoke tests still pass; new tab registered |
| T5 | Change model | Habit starter | "Add a target frequency per week to habits and show it on the habit card" | tsc ok; bundle ok; `schemaVersion` bumped; smoke tests pass |
| T6 | Rename field | Inventory starter | "Rename quantity to stockLevel everywhere" | tsc ok; no remaining `quantity` identifier in project files; smoke tests pass |
| T7 | Repair | Journal starter with an injected type error in `EntriesScreen.tsx` | "Fix the build" | tsc ok in ≤ 2 attempts; no unrelated files changed |
| T8 | Visual change | Inventory starter | "Make low-stock items show a red badge" | tsc ok; bundle ok; smoke tests pass |
| T9 | Guardrail | Journal starter | "Add react-native-maps and show entries on a map" | Run ends with a clear explanation that the dependency is not available; no `package.json` change; no failed state from a crash |
| T10 | Ambiguity | Foundation | "An app for my shop" | Plan is produced; build succeeds with some sensible CRUD; no hang or timeout |

Starter smoke tests are the React Native Testing Library tests committed with each starter (Phase 2 slice 2.4).

## Scoring per run

| Field | Definition |
| --- | --- |
| `passed` | All "must hold" checks pass |
| `repair_attempts` | 0, 1, or 2 |
| `turns` | Model turns including tool calls |
| `input_tokens`, `cached_tokens`, `output_tokens` | From provider usage |
| `cost_usd` | Computed from the rate table in `packages/generator/src/rates.ts` |
| `wall_seconds` | Enqueue to terminal state |
| `rejections` | Tool calls rejected by validation |

## Report and thresholds

Per model, over all runs:

| Metric | Target | Maps to |
| --- | --- | --- |
| Pass rate T1–T3, T10 | ≥ 70% | H1 |
| Pass rate T4–T8 | ≥ 80% | H2 |
| T9 pass rate | 100% | Guardrails |
| Median wall time, initial builds | ≤ 180 s | Operational |
| Mean cost per passed run | Reported | Pricing basis |
| Blended cost per build (1 initial : 3 edits) | ≤ $0.04 | Pro plan guardrail (brief §13) |

## Decision rule for P3

Run E1: `--runs 3` on all tasks for each candidate, single-model: `gpt-6.1-sol`, `gpt-5.3-codex`, and `gpt-6-luna`.

1. **Plan model.** Pick the cheaper of `gpt-6.1-sol` and `gpt-5.3-codex` unless the other beats it by more than 5 points on T1–T3 and T10.
2. **Edit model.** Use `gpt-6-luna` for edits and repairs if its pass rate on T4–T8 is within 5 points of the plan model's.
3. **If the small model fails rule 2,** use the plan model for edits too, and trigger brief open decision 4 (lower the Pro cap or raise the price) because blended cost will exceed $0.04.

Record the outcome in `DECISIONS.md`.

## When to rerun

- Any change to `packages/foundation`, the system prompt, the context builder, or the tool layer: run `--tasks all --runs 1` before merge.
- Nightly: `--tasks smoke --runs 1` on the current model config, with the result posted to the metrics dashboard. Workflow: `.github/workflows/eval-nightly.yml` (02:00 Singapore, and manual dispatch). It needs the `OPENAI_API_KEY` secret; the `GENERATION_MODEL_*` repository variables are optional. It uploads the JSON as an artifact, writes the table to the job summary, and copies the JSON to `s3://$EVAL_STORAGE_BUCKET/eval/nightly/` when the `EVAL_STORAGE_BUCKET` variable and `EVAL_STORAGE_ACCESS_KEY` / `EVAL_STORAGE_SECRET_KEY` secrets are set.
