-- Work Plans step 2: Visa Types, Phases, and substreams on cases/plans.
--
-- 1. `visa_types` — the firm's subclass + substream list (Configuration →
--    Work Plans → Visa Types). One row per subclass + substream; a subclass
--    with no substreams has one row with substream ''.
-- 2. `case_phases` — the firm's ordered phase list (Configuration → Work
--    Plans → Phases): Consultation → Post-decision. Separate from
--    `cases.stage` (the draft→closed lifecycle), which is unchanged.
-- 3. `visa_substream` on `cases` and `workflow_templates`.
--
-- Defaults are NOT inserted here: like document_types, they're seeded per
-- firm by the app on first load (src/lib/visaTypes.ts's
-- ensureSystemVisaTypes(), src/lib/casePhases.ts's ensureSystemCasePhases()),
-- matched by `system_key` so a hidden or edited default is never re-added.
-- The (firm_id, system_key) unique constraint makes concurrent seeding safe
-- (the app upserts with ignoreDuplicates on it); firm-added rows have a null
-- system_key, which never conflicts.
--
-- Depends on the firm accounts migration (is_firm_member). Apply BEFORE
-- deploying the frontend that reads/writes these tables and columns.
-- Additive only: nothing existing is changed or backfilled.

create table if not exists visa_types (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  subclass text not null check (char_length(subclass) between 1 and 20),
  name text not null check (char_length(name) between 1 and 120),
  substream text not null default '' check (char_length(substream) <= 120),
  note text not null default '' check (char_length(note) <= 500),
  is_system_default boolean not null default false,
  system_key text,
  hidden boolean not null default false,
  constraint visa_types_firm_id_system_key_key unique (firm_id, system_key)
);
create index if not exists visa_types_firm_id_idx on visa_types(firm_id);

create table if not exists case_phases (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  is_system_default boolean not null default false,
  system_key text,
  required boolean not null default false,
  hidden boolean not null default false,
  constraint case_phases_firm_id_system_key_key unique (firm_id, system_key)
);
create index if not exists case_phases_firm_id_idx on case_phases(firm_id);

alter table cases add column if not exists visa_substream text;
alter table workflow_templates add column if not exists visa_substream text;

-- RLS: same "firm rows" pattern as document_types (20260926000300_create_firms.sql):
-- any active firm member can read and maintain the firm's reference lists;
-- user_id is "created by" and must be the caller on insert.
alter table visa_types enable row level security;
alter table case_phases enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['visa_types', 'case_phases']
  loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'firm rows select') then
      execute format('create policy "firm rows select" on %I for select to authenticated using (is_firm_member(firm_id))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'firm rows insert') then
      execute format('create policy "firm rows insert" on %I for insert to authenticated with check (is_firm_member(firm_id) and user_id = (select auth.uid()))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'firm rows update') then
      execute format('create policy "firm rows update" on %I for update to authenticated using (is_firm_member(firm_id)) with check (is_firm_member(firm_id))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'firm rows delete') then
      execute format('create policy "firm rows delete" on %I for delete to authenticated using (is_firm_member(firm_id))', t);
    end if;
  end loop;
end $$;
