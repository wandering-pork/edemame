-- Work Plans step 3: phases on tasks.
--
-- `tasks.phase` — the phase a task belongs to (Configuration → Phases): a
-- built-in phase's system_key ('consultation', 'prerequisites', ...) or a
-- firm-added phase's id. Nullable: older tasks have none, and the app falls
-- back to the task's plan step phase, then the previous task's (see
-- src/lib/phaseGrouping.ts). Plan steps already store `phase` inside the
-- `workflow_templates.steps` jsonb, so no column is needed there.
--
-- Additive only. Apply BEFORE deploying the frontend that writes `phase`.
-- Depends on 20261114000000_visa_types_phases.sql (for the phase list it
-- refers to, though there's deliberately no FK — a phase ref may be a
-- system_key, and a deleted phase shouldn't break its tasks).

alter table tasks add column if not exists phase text;
