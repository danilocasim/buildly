# Metrics and instrumentation

All events go into `analytics_events` (see ARCHITECTURE.md). Names are stable strings from `packages/shared/src/events.ts`. No third-party analytics in the MVP; a SQL dashboard is enough for ten beta users.

## Events

| Event | Emitted by | Props |
| --- | --- | --- |
| `user.signed_in` | web | `method: magic_link` |
| `project.created` | web | `source: prompt \| starter`, `starter_slug?` |
| `project.opened` | web | |
| `build.started` | worker | `generation_id`, `kind: initial \| edit`, `model` |
| `build.step` | worker | `generation_id`, `step`, `status`, `duration_ms` |
| `build.repair` | worker | `generation_id`, `attempt`, `source: typecheck \| bundle` |
| `build.finished` | worker | `generation_id`, `kind: initial \| edit`, `status`, `repair_attempts`, `wall_ms`, `input_tokens`, `cached_tokens`, `output_tokens`, `cost_usd` |
| `build.cancelled` | web | `generation_id` |
| `preview.web_loaded` | web | `project_id`, `load_ms` |
| `preview.phone_opened` | web | `project_id` (QR modal opened) |
| `preview.reset_demo_data` | web | `project_id` |
| `snapshot.restored` | web | `project_id`, `snapshot_id` |
| `export.created` | web | `project_id`, `zip_bytes` |
| `cap.hit` | web | `cap: monthly_builds \| hourly_builds \| concurrent_builds \| projects` |

## Formulas

Computed over a date range by `packages/db/src/metrics.ts` (`metrics.compute`), shown on `/admin/metrics`, and stored as a weekly report in `.plan/mvp/reports/` by `pnpm report:weekly`.

| Metric | Formula | Target |
| --- | --- | --- |
| H1 pass rate | `build.finished` with `kind = initial` and `status = succeeded` and `repair_attempts ≤ 2` ÷ all `build.finished` with `kind = initial` | ≥ 70% |
| H2 pass rate | Same with `kind = edit` | ≥ 80% |
| H3 code intent | Projects with at least one `export.created` or `preview.phone_opened` ÷ projects with at least one succeeded build | ≥ 30% |
| Time to preview | Median of `preview.web_loaded.load_ms` measured from the triggering `build.started` for initial builds | ≤ 180 s |
| Cost per successful build | Mean `cost_usd` where `status = succeeded` | Reported |
| Repair rate | Builds with `repair_attempts ≥ 1` ÷ all finished builds | Reported |
| Cap pressure | Count of `cap.hit` by cap | Reported |

## Dashboard

A single page at `/admin/metrics` (admin users only) rendering the table above for the last 7 and 30 days, plus the last nightly eval smoke result. Built in Phase 7.

## Privacy

Prompts and generated code are not sent to any third party other than OpenAI and Snack, which the product already depends on. Analytics rows store ids and numbers, never prompt text.
