-- Adds the human-readable case reference (e.g. "EDM-2026-0001") surfaced in the
-- global search bar and case headers.
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that introduces it.
-- The read path tolerates a missing column, but the write path does not: the
-- cloud case repository always sends `case_number` in its insert/update payload,
-- and PostgREST rejects a payload naming a column that isn't in the schema cache
-- (PGRST204), which would fail every case create/update until the column exists.
--
-- The column is nullable because cases created before it existed have no number;
-- the app renders a UUID-derived fallback for those (see src/lib/caseNumber.ts)
-- rather than backfilling.
--
-- Like every other migration in this project, apply manually via the Supabase
-- SQL editor or `supabase db push`.

alter table cases add column if not exists case_number text;

create index if not exists cases_case_number_idx on cases (user_id, case_number);
