-- Adds the task<->template-step integration fields for Step 1 · 1E
-- ("Template task timing" — see docs/plans/step-1-foundations.md):
--   - tasks.step_key: the WorkflowStep.key a task was generated from.
--   - tasks.date_locked: set once a task's date has been edited by hand;
--     `lib/scheduleFromTemplate.ts`'s reschedule() never recalculates it.
--   - tasks.date_pending: true while a task's date is a provisional estimate
--     (the real anchor — a deadline, or another step's completion — isn't
--     known yet).
--   - cases.template_version: the WorkflowTemplate.version used the last
--     time this case's tasks were generated/rescheduled from a template.
--
-- IMPORTANT: apply this BEFORE deploying the frontend change that introduces
-- it. Like case_number, visa_subclass, status/status_reason and stage before
-- it, the cloud task/case repositories always send these columns in their
-- insert/update payload, and PostgREST rejects a payload naming a column
-- that isn't in the schema cache (PGRST204) until the columns exist.
--
-- All four columns are nullable: existing rows predate this field, and a
-- task/case with no timed-template plan (AI-only flow, or no template) never
-- sets them.
--
-- Like every other migration in this project, apply manually via the
-- Supabase SQL editor or `supabase db push` — NOT applied by this change.

alter table tasks add column if not exists step_key text;
alter table tasks add column if not exists date_locked boolean;
alter table tasks add column if not exists date_pending boolean;

alter table cases add column if not exists template_version integer;
