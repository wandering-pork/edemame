-- Adds `version`/`timing_verified` to workflow_templates so custom templates
-- can carry the same step-timing schema revision and "reviewed by a
-- registered agent" flag as the hardcoded system templates in
-- src/lib/seedData.ts (see WorkflowTemplate.version/timingVerified in
-- src/types.ts, and Step 1 · 1E of docs/plans/step-1-foundations.md).
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that introduces
-- it. Like case_number (20260810000000_add_case_number.sql) and visa_subclass
-- (20260925000000_add_case_visa_subclass.sql), the cloud template repository
-- always sends `version`/`timing_verified` in its insert/update payload, and
-- PostgREST rejects a payload naming a column that isn't in the schema cache
-- (PGRST204), which would fail every custom-template create/update until the
-- columns exist.
--
-- Both columns are nullable: existing rows and system templates predate this
-- field. `src/lib/templateTiming.ts`'s `normalizeTemplate()` assigns stable
-- step keys on read regardless, independent of whether version/timingVerified
-- are set.
--
-- Like every other migration in this project, apply manually via the
-- Supabase SQL editor or `supabase db push` — NOT applied by this change.

alter table workflow_templates add column if not exists version integer;
alter table workflow_templates add column if not exists timing_verified boolean;
