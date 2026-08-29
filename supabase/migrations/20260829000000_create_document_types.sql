-- Document Checklist Generator v2 (GitHub issue #4).
--
-- 1. `document_types` — the firm/account-level Document Type reference list.
--    Scoped per account like `profiles`, NOT global across tenants: the seeded
--    system-default rows are written per user by
--    src/lib/documentTypes.ts's ensureSystemDocumentTypes() on first load, so
--    each firm gets its own copy and can flip `auto_link` without affecting
--    anyone else. `is_system_default` is advisory here — the rename/recode/
--    delete lock is enforced at the application layer.
-- 2. New `document_type_code` columns on `documents` and `checklist_items`,
--    the shared vocabulary auto-link matches on.
-- 3. Backfill of `category` / `manually_added` on `checklist_items`: both
--    already existed on the DocumentChecklistItem type and were written in
--    local mode, but had no column here, so cloud-mode checklists silently
--    lost their category grouping. Added now because auto-link's UI groups by
--    category and would have been broken in cloud mode without it.

create table if not exists document_types (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{1,6}$'),
  description text not null check (char_length(description) <= 100),
  category text not null,
  is_system_default boolean not null default false,
  auto_link boolean not null default false,
  unique (user_id, code)
);
create index if not exists document_types_user_id_idx on document_types(user_id);

-- Deliberately no FK from these columns to document_types(code): a code may be
-- recorded on a file or checklist item whose Document Type row a firm later
-- deletes, and losing the file's classification (or cascading a delete into
-- case evidence) is worse than holding a code that no longer resolves. The UI
-- renders an unresolved code as-is.
alter table documents add column if not exists document_type_code text;
alter table checklist_items add column if not exists document_type_code text;
alter table checklist_items add column if not exists category text;
alter table checklist_items add column if not exists manually_added boolean;

-- RLS: same "own rows" pattern as every other table in
-- 20260802000000_create_cloud_data_tables.sql — `(select auth.uid())` so the
-- predicate is evaluated once per query, and `to authenticated` so anon
-- requests skip policy evaluation entirely.
alter table document_types enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'document_types' and policyname = 'own rows select') then
    create policy "own rows select" on document_types for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'document_types' and policyname = 'own rows insert') then
    create policy "own rows insert" on document_types for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'document_types' and policyname = 'own rows update') then
    create policy "own rows update" on document_types for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'document_types' and policyname = 'own rows delete') then
    create policy "own rows delete" on document_types for delete to authenticated using ((select auth.uid()) = user_id);
  end if;
end $$;
