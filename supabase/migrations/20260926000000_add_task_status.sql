-- Adds the new `status` lifecycle field to tasks (Step 1 · Foundations 1B),
-- replacing the old boolean `is_completed` as the source of truth. See
-- src/types.ts's TaskStatus and src/lib/taskStatus.ts.
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that writes
-- `status`/`status_reason`. Like case_number and visa_subclass before it, the
-- cloud task repository always sends these columns in its insert/update
-- payload, and PostgREST rejects a payload naming a column that isn't in the
-- schema cache (PGRST204), which would fail every task create/update until
-- the columns exist.
--
-- `is_completed` is kept (for one release) as a derived mirror of `status`
-- (`status in ('done', 'not_applicable')`) so any code/tab still reading it
-- keeps working — see the @deprecated note on Task.isCompleted.
--
-- Apply manually via the Supabase SQL editor or `supabase db push`, like
-- every other migration in this project.

alter table tasks add column if not exists status text;
alter table tasks add column if not exists status_reason text;

-- Backfill existing rows from is_completed.
update tasks
set status = case when is_completed then 'done' else 'not_started' end
where status is null;

alter table tasks alter column status set not null;

-- Default so the previously deployed frontend (which doesn't send status)
-- can still insert tasks between this migration and the new deploy.
alter table tasks alter column status set default 'not_started';

alter table tasks add constraint tasks_status_check
  check (status in ('not_started', 'in_progress', 'waiting_client', 'waiting_third_party', 'not_applicable', 'done'));
