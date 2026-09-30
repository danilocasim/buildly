-- Reverts 0000_init.sql. Run by `pnpm db:migrate:down` (scripts/migrate.ts).
DROP TABLE IF EXISTS "analytics_events", "usage_events", "jobs", "generation_steps", "messages", "generations", "snapshots", "projects", "sessions", "magic_links", "invites", "users" CASCADE;
DROP TYPE IF EXISTS "generation_step_status", "generation_step", "generation_kind", "generation_status", "job_status", "message_role", "plan";
