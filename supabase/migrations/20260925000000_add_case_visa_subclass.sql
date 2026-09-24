-- Adds the assessed/selected visa subclass to a case, so it no longer has to
-- be looked up (and can be wrong/missing) via the case's workflow template.
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that introduces
-- it. Like case_number (20260810000000_add_case_number.sql), the cloud case
-- repository always sends `visa_subclass` in its insert/update payload, and
-- PostgREST rejects a payload naming a column that isn't in the schema cache
-- (PGRST204), which would fail every case create/update until the column
-- exists.
--
-- The column is nullable because cases created before it existed have none;
-- the app falls back to the case's workflow template's visaSubclass for those
-- (see src/App.tsx's CaseDetailsRoute).
--
-- Like every other migration in this project, apply manually via the
-- Supabase SQL editor or `supabase db push`.

alter table cases add column if not exists visa_subclass text;
