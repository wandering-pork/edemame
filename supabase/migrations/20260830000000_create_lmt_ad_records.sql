-- LMT Evidence Packager + Expiry Alert (GitHub issue #31).
--
-- `lmt_ad_records` — the structured Labour Market Testing advertisements for an
-- employer-sponsored case (subclass 482 / 494 / 186 TRT). A case normally has
-- 2+ rows: DoHA requires a minimum of two ads, each run for at least 28 days,
-- and the nomination must be lodged within 4 months of the campaign's closing
-- date. src/lib/lmt.ts derives that expiry window from the latest end_date.
--
-- Case-scoped and user-scoped, the same shape as `case_notes` in
-- 20260802000000_create_cloud_data_tables.sql: a `user_id` column with RLS
-- "own rows" policies, plus a `case_id` the application filters on.

create table if not exists lmt_ad_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null,
  platform text not null,
  -- Dates are stored as the same YYYY-MM-DD text the rest of the app uses
  -- (Task.date, Client.dob, ...) so a round-trip through the repositories
  -- can't shift a compliance-critical date across a timezone boundary.
  start_date text not null,
  end_date text not null,
  -- No FK to documents(id): the ad record is the compliance artefact and must
  -- outlive a mistakenly deleted Case File. The UI renders an unresolved id as
  -- "evidence file missing" rather than dropping the dates.
  document_id text,
  notes text,
  extracted_by_ai boolean,
  created_at text not null
);
create index if not exists lmt_ad_records_user_case_idx on lmt_ad_records(user_id, case_id);

-- RLS: same "own rows" pattern as every other table — `(select auth.uid())` so
-- the predicate is evaluated once per query, and `to authenticated` so anon
-- requests skip policy evaluation entirely.
alter table lmt_ad_records enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lmt_ad_records' and policyname = 'own rows select') then
    create policy "own rows select" on lmt_ad_records for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lmt_ad_records' and policyname = 'own rows insert') then
    create policy "own rows insert" on lmt_ad_records for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lmt_ad_records' and policyname = 'own rows update') then
    create policy "own rows update" on lmt_ad_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lmt_ad_records' and policyname = 'own rows delete') then
    create policy "own rows delete" on lmt_ad_records for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
