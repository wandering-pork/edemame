-- Adds case lifecycle stage fields (Step 1 · Foundations 1C), replacing the
-- old `status` (open/in_progress/on_hold/closed) as the source of truth. See
-- src/types.ts's CaseStage/CaseOutcome and src/lib/caseStage.ts.
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that writes
-- `stage`/`outcome`/`on_hold`. Like case_number/visa_subclass/task status
-- before it, the cloud case repository always sends these columns in its
-- insert/update payload, and PostgREST rejects a payload naming a column
-- that isn't in the schema cache (PGRST204), which would fail every case
-- create/update until the columns exist.
--
-- `status` is kept (for one release) as a derived mirror of stage/on_hold
-- (closed -> closed; on_hold -> on_hold; draft/assessment -> open; everything
-- else -> in_progress) so any code/tab still reading it keeps working — see
-- the @deprecated note on Case.status and lib/caseStage.ts's
-- deriveLegacyStatus().
--
-- Timestamp deliberately sits before the deadlines migration
-- (20260926000100) and the firms migration (20260926000300) it must precede.
--
-- Apply manually via the Supabase SQL editor or `supabase db push`, like
-- every other migration in this project.

alter table cases add column if not exists stage text;
alter table cases add column if not exists outcome text;
alter table cases add column if not exists on_hold boolean not null default false;

-- Backfill existing rows from the legacy status column.
update cases
set stage = case
  when status = 'closed' then 'closed'
  when status = 'on_hold' then 'preparing'
  else 'preparing'
end
where stage is null;

update cases
set on_hold = true
where status = 'on_hold' and on_hold = false;

alter table cases alter column stage set not null;

-- Default so the previously deployed frontend (which doesn't send stage)
-- can still insert cases between this migration and the new deploy.
alter table cases alter column stage set default 'draft';

alter table cases add constraint cases_stage_check
  check (stage in (
    'draft', 'assessment', 'engaged', 'preparing', 'ready_to_lodge',
    'lodged', 'info_requested', 'decision', 'closed'
  ));

alter table cases add constraint cases_outcome_check
  check (outcome is null or outcome in ('granted', 'refused', 'withdrawn', 'lapsed'));
