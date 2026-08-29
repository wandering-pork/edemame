-- Points Calculator + Evidence Mapper (GitHub issue #36).
--
-- `points_claims` — one row per case holding the GSM points test claim: the
-- subclass being scored, and the per-criterion entries (which band is claimed,
-- which Case Files are linked as evidence, and any working note).
--
-- The entries are a jsonb array rather than a child table because they are
-- only ever read and written as a complete set for one case — the same access
-- pattern as `focus_conversations.messages` — and a single-row write keeps the
-- claim atomic, so a partial save can't produce a total that never existed.
--
-- Claimed / Proven / Outstanding totals are deliberately NOT stored: they are
-- derived in src/lib/pointsTest.ts from the entries plus the documents that
-- actually exist in Case Files, so deleting a linked file immediately makes
-- the criterion outstanding again instead of leaving a stale "proven" number.
--
-- Document ids inside `entries` intentionally have no FK to `documents`: the
-- link is advisory evidence mapping, and a deleted file should surface as an
-- outstanding claim (the app resolves unknown ids that way), not cascade into
-- silently rewriting a lawyer's points claim.

create table if not exists points_claims (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null,
  subclass text not null,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, case_id)
);
create index if not exists points_claims_user_case_idx on points_claims(user_id, case_id);

-- RLS: same "own rows" pattern as every other table in
-- 20260802000000_create_cloud_data_tables.sql — `(select auth.uid())` so the
-- predicate is evaluated once per query, and `to authenticated` so anon
-- requests skip policy evaluation entirely.
alter table points_claims enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'points_claims' and policyname = 'own rows select') then
    create policy "own rows select" on points_claims for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'points_claims' and policyname = 'own rows insert') then
    create policy "own rows insert" on points_claims for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'points_claims' and policyname = 'own rows update') then
    create policy "own rows update" on points_claims for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'points_claims' and policyname = 'own rows delete') then
    create policy "own rows delete" on points_claims for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
