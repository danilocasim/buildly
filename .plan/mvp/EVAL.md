# Evaluation harness

`packages/eval` runs a fixed task set through the real generation loop against a chosen model and reports the metrics the brief asks for. It is the gate for model choice (P3) and for any change to the foundation, system prompt, or tool layer.

## Command

```bash
pnpm eval --plan-model gpt-6.1-sol --edit-model gpt-6-luna --tasks all --runs 3 --out .eval/<date>-<config>.json
pnpm eval:report .eval/<date>-<config>.json   # prints a markdown table
```

`--plan-model` serves T1–T3 and T10; `--edit-model` serves T4–T9. Passing only `--model` uses one model for everything.

Runs are real API calls and cost money. `--tasks smoke` is the CI subset (T1, T4, T7), run nightly. Harness runs use OpenAI's Flex processing where the model supports it, which costs half; interactive builds in the product always use Standard.

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
- Nightly: `--tasks smoke --runs 1` on the current model config, with the result posted to the metrics dashboard.
