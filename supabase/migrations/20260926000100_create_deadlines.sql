-- Deadline entity (Step 1 · 1D, see docs/plans/step-1-foundations.md). An
-- external, consequential date the agent doesn't control (visa/passport
-- expiry, s56/s57 response windows, nomination validity, invitation
-- windows), as opposed to a Task whose date the agent sets. See
-- src/repositories/cloud/index.ts's CloudDeadlineRepository and CLAUDE.md's
-- "Local-First Storage" section.
--
-- firm_id is added now, nullable and with no foreign key, so 1F's firm
-- migration only needs to add the constraint + backfill rather than a second
-- schema change -- same reasoning as the plan's "Sequencing" note.

create table if not exists deadlines (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_id uuid null,
  kind text not null,
  title text not null,
  due_date text not null,
  case_id text null references cases(id) on delete cascade,
  client_id text null references clients(id) on delete cascade,
  triggered_on text null,
  status text not null default 'open' check (status in ('open', 'met', 'missed', 'dismissed')),
  resolved_at text null,
  notes text null,
  created_at text not null
);

create index if not exists deadlines_user_id_idx on deadlines(user_id);
create index if not exists deadlines_case_id_idx on deadlines(case_id);
create index if not exists deadlines_client_id_idx on deadlines(client_id);

alter table deadlines enable row level security;

-- Same "own rows" pattern as profiles / eligibility_assessments;
-- `(select auth.uid())` so the predicate is evaluated once per query, not
-- once per row (Supabase auth_rls_initplan lint), and `to authenticated` so
-- anon requests skip policy evaluation entirely.
create policy "own rows select" on deadlines for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on deadlines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on deadlines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on deadlines for delete to authenticated using ((select auth.uid()) = user_id);
