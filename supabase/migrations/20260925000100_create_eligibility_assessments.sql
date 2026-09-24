-- Persisted Visa Eligibility Advisor reports (see CLAUDE.md's "Local-First
-- Storage" section, repos.eligibility). Every report from /api/check-eligibility
-- is saved here, whether or not a case is ever opened from it; client_id/case_id
-- are filled in as they become known.

create table if not exists eligibility_assessments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text null,
  case_id text null,
  created_at text not null,
  inputs jsonb not null,
  options jsonb not null,
  selected_subclass text null
);

create index if not exists eligibility_assessments_user_id_idx on eligibility_assessments(user_id);
create index if not exists eligibility_assessments_case_id_idx on eligibility_assessments(case_id);
create index if not exists eligibility_assessments_client_id_idx on eligibility_assessments(client_id);

alter table eligibility_assessments enable row level security;

create policy "own rows select" on eligibility_assessments for select to authenticated using ((select auth.uid()) = user_id);
create policy "own rows insert" on eligibility_assessments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own rows update" on eligibility_assessments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows delete" on eligibility_assessments for delete to authenticated using ((select auth.uid()) = user_id);
