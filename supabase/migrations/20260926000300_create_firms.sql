-- Firm accounts (Step 1 · Foundations 1F). Cloud mode only: a linked local
-- folder belongs to one person by construction, so local mode stays
-- single-user (see docs/plans/step-1-foundations.md, Decisions #1).
--
-- What this does:
--   1. firms / firm_members / firm_invites tables.
--   2. is_firm_member() / has_firm_role() helpers (security definer, so the
--      RLS policies that call them don't recurse into firm_members' own RLS,
--      and `(select auth.uid())` is evaluated once per query).
--   3. Every data table gets firm_id. Existing rows are backfilled into one
--      personal firm per existing user_id, owned by that user — nobody's data
--      moves or becomes visible to anyone new.
--   4. "own rows" RLS is replaced with "firm rows". user_id stays on every
--      row as "created by", for audit.
--   5. Document storage accepts both the legacy {userId}/... prefix and the
--      new {firmId}/... prefix, so no objects need copying.
--
-- Deliberately NOT firm-scoped:
--   - profiles            (per person)
--   - notifications       (per person — each member gets their own alerts)
--   - agent_issue_filings (per person — it's a per-user rate limit)
--   - usage_events keeps user_id for attribution but gains firm_id for seats
--
-- No platform-level access: there is no role that lets the app operator read
-- a firm's rows (Decisions #4). Only the service role (server-side api/
-- functions) bypasses RLS, and it's used only for invites.
--
-- IMPORTANT: apply BEFORE deploying the frontend that sends firm_id. Test on a
-- Supabase branch first — RLS changes take effect immediately.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists firm_members (
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'agent', 'paralegal')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  -- replaces TeamMember.status ('available' | 'busy' | 'offline')
  availability text not null default 'available' check (availability in ('available', 'busy', 'offline')),
  joined_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);
create index if not exists firm_members_user_id_idx on firm_members(user_id);

create table if not exists firm_invites (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'agent', 'paralegal')),
  -- sha256 of the invite token; the raw token only ever exists in the email link
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists firm_invites_firm_id_idx on firm_invites(firm_id);
create index if not exists firm_invites_email_idx on firm_invites(lower(email));

alter table profiles add column if not exists current_firm_id uuid references firms(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

create or replace function is_firm_member(f uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from firm_members
    where firm_id = f and user_id = (select auth.uid()) and status = 'active'
  );
$$;

create or replace function has_firm_role(f uuid, roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from firm_members
    where firm_id = f and user_id = (select auth.uid()) and status = 'active' and role = any(roles)
  );
$$;

-- Directory of a firm's members (name/email live in auth.users, which the
-- client can't read). A function rather than a view so it can check
-- membership itself instead of being a security-definer view.
create or replace function firm_member_directory(f uuid)
returns table (
  user_id uuid, email text, full_name text, role text, status text,
  availability text, joined_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, u.email::text, coalesce(u.raw_user_meta_data->>'full_name', u.email)::text,
         m.role, m.status, m.availability, m.joined_at
  from firm_members m
  join auth.users u on u.id = m.user_id
  where m.firm_id = f and is_firm_member(f)
  order by m.joined_at;
$$;

revoke all on function is_firm_member(uuid) from public;
revoke all on function has_firm_role(uuid, text[]) from public;
revoke all on function firm_member_directory(uuid) from public;
grant execute on function is_firm_member(uuid) to authenticated;
grant execute on function has_firm_role(uuid, text[]) to authenticated;
grant execute on function firm_member_directory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS on the firm tables themselves
-- ---------------------------------------------------------------------------

alter table firms enable row level security;
alter table firm_members enable row level security;
alter table firm_invites enable row level security;

create policy "members read firm" on firms
  for select to authenticated using (is_firm_member(id));
-- Firms are created only through create_firm() below (no insert policy): the
-- creator isn't a member until the owner row exists, so a plain insert could
-- neither return the new row nor pass a membership check.
create policy "owners update firm" on firms
  for update to authenticated using (has_firm_role(id, array['owner'])) with check (has_firm_role(id, array['owner']));

create policy "members read members" on firm_members
  for select to authenticated using (is_firm_member(firm_id));
-- No insert policy: the founding owner row is written by create_firm(), and
-- every other membership server-side when an invite is accepted.
create policy "owners manage members" on firm_members
  for update to authenticated using (has_firm_role(firm_id, array['owner'])) with check (has_firm_role(firm_id, array['owner']));
-- members can update their own availability (enforced column-wise in the app;
-- role/status changes by non-owners are blocked by the trigger below)
create policy "members update self" on firm_members
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners remove members" on firm_members
  for delete to authenticated using (has_firm_role(firm_id, array['owner']));

create or replace function firm_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The "members update self" policy below only checks that the row being
  -- updated (and the new row) belongs to the caller's own user_id — it does
  -- NOT stop the caller from changing firm_id (part of the primary key) to a
  -- firm they were never invited to, which would self-grant membership of an
  -- arbitrary firm. firm_id/user_id are immutable for every caller, including
  -- owners; accept-invite always inserts a new row rather than moving one.
  if new.firm_id is distinct from old.firm_id or new.user_id is distinct from old.user_id then
    raise exception 'firm_id and user_id cannot be changed; remove and re-add the member instead';
  end if;
  -- non-owners may only change their own availability (server-side service
  -- role calls have no auth.uid() and skip this check)
  if (select auth.uid()) is not null and not has_firm_role(new.firm_id, array['owner'])
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Only a firm owner can change roles or member status';
  end if;
  -- never leave a firm without an active owner
  if old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active')
     and not exists (
       select 1 from firm_members
       where firm_id = old.firm_id and user_id <> old.user_id and role = 'owner' and status = 'active'
     ) then
    raise exception 'A firm must keep at least one active owner';
  end if;
  return new;
end $$;
drop trigger if exists firm_members_guard on firm_members;
create trigger firm_members_guard before update on firm_members
  for each row execute function firm_members_guard();

create policy "owners read invites" on firm_invites
  for select to authenticated using (has_firm_role(firm_id, array['owner']));
create policy "owners revoke invites" on firm_invites
  for update to authenticated using (has_firm_role(firm_id, array['owner'])) with check (has_firm_role(firm_id, array['owner']));
-- inserts and acceptance happen in api/invite-member.ts / api/accept-invite.ts
-- with the service role, which bypasses RLS.

-- Creates a firm, makes the caller its owner and their current firm, in one
-- transaction. Used by onboarding ("Create a firm").
create or replace function create_firm(firm_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  new_firm uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  insert into firms (name, created_by) values (trim(firm_name), uid) returning id into new_firm;
  insert into firm_members (firm_id, user_id, role) values (new_firm, uid, 'owner');
  update profiles set current_firm_id = new_firm where user_id = uid;
  return new_firm;
end $$;
revoke all on function create_firm(text) from public;
grant execute on function create_firm(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. firm_id on every data table + backfill
-- ---------------------------------------------------------------------------

-- One personal firm per user who owns any cloud data (or has a profile).
do $$
declare
  u record;
  new_firm uuid;
begin
  for u in
    select distinct x.user_id from (
      select user_id from profiles
      union select user_id from clients
      union select user_id from cases
      union select user_id from tasks
      union select user_id from workflow_templates
      union select user_id from document_types
      union select user_id from eligibility_assessments
      union select user_id from deadlines
    ) x
    where not exists (select 1 from firm_members m where m.user_id = x.user_id)
  loop
    insert into firms (name, created_by)
    values (
      coalesce(
        (select nullif(trim(raw_user_meta_data->>'full_name'), '') from auth.users where id = u.user_id),
        'My firm'
      ),
      u.user_id
    )
    returning id into new_firm;
    insert into firm_members (firm_id, user_id, role) values (new_firm, u.user_id, 'owner');
    update profiles set current_firm_id = new_firm where user_id = u.user_id and current_firm_id is null;
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'cases', 'tasks', 'workflow_templates', 'case_notes', 'documents',
    'team_members', 'activity_events', 'checklist_items', 'focus_conversations',
    'document_types', 'usage_events', 'eligibility_assessments', 'deadlines'
  ]
  loop
    execute format('alter table %I add column if not exists firm_id uuid', t);
    -- every existing row belongs to its creator's personal firm
    execute format(
      'update %I r set firm_id = m.firm_id from firm_members m where r.firm_id is null and m.user_id = r.user_id and m.role = ''owner''',
      t
    );
    execute format('alter table %I alter column firm_id set not null', t);
    -- deadlines already has a nullable firm_id (no FK) from its own migration
    execute format('alter table %I drop constraint if exists %I', t, t || '_firm_id_fkey');
    execute format('alter table %I add constraint %I foreign key (firm_id) references firms(id) on delete cascade', t, t || '_firm_id_fkey');
    execute format('create index if not exists %I on %I(firm_id)', t || '_firm_id_idx', t);
  end loop;
end $$;

-- Per-firm uniqueness replaces per-user uniqueness.
alter table document_types drop constraint if exists document_types_user_id_code_key;
alter table document_types add constraint document_types_firm_id_code_key unique (firm_id, code);
drop index if exists cases_case_number_idx;
create index if not exists cases_case_number_idx on cases (firm_id, case_number);

-- ---------------------------------------------------------------------------
-- 5. Replace "own rows" policies with "firm rows"
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'clients', 'cases', 'tasks', 'workflow_templates', 'case_notes', 'documents',
    'team_members', 'activity_events', 'checklist_items', 'focus_conversations',
    'document_types', 'usage_events', 'eligibility_assessments', 'deadlines'
  ]
  loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t and policyname like 'own rows %'
    loop
      execute format('drop policy %I on %I', p.policyname, t);
    end loop;

    execute format('create policy "firm rows select" on %I for select to authenticated using (is_firm_member(firm_id))', t);
    -- user_id is "created by" and must be the caller
    execute format('create policy "firm rows insert" on %I for insert to authenticated with check (is_firm_member(firm_id) and user_id = (select auth.uid()))', t);
    execute format('create policy "firm rows update" on %I for update to authenticated using (is_firm_member(firm_id)) with check (is_firm_member(firm_id))', t);
  end loop;

  -- Deletes: paralegals can't delete clients, cases or documents; everything
  -- else any member may delete. usage_events and activity_events are
  -- append-only audit trails: no delete policy except for owners (clearAll /
  -- storage-mode switch).
  foreach t in array array['clients', 'cases', 'documents']
  loop
    execute format('create policy "firm rows delete" on %I for delete to authenticated using (has_firm_role(firm_id, array[''owner'', ''agent'']))', t);
  end loop;
  foreach t in array array['tasks', 'workflow_templates', 'case_notes', 'team_members', 'checklist_items', 'focus_conversations', 'document_types', 'eligibility_assessments', 'deadlines']
  loop
    execute format('create policy "firm rows delete" on %I for delete to authenticated using (is_firm_member(firm_id))', t);
  end loop;
  foreach t in array array['usage_events', 'activity_events']
  loop
    execute format('create policy "firm rows delete" on %I for delete to authenticated using (has_firm_role(firm_id, array[''owner'']))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Document storage: {firmId}/... for new uploads, {userId}/... still
--    readable by its owner (legacy objects are not moved).
-- ---------------------------------------------------------------------------

drop policy if exists "own document objects select" on storage.objects;
drop policy if exists "own document objects insert" on storage.objects;
drop policy if exists "own document objects update" on storage.objects;
drop policy if exists "own document objects delete" on storage.objects;

create policy "firm document objects select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and is_firm_member(((storage.foldername(name))[1])::uuid))
  ));

create policy "firm document objects insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and is_firm_member(((storage.foldername(name))[1])::uuid));

create policy "firm document objects update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and is_firm_member(((storage.foldername(name))[1])::uuid))
  ));

create policy "firm document objects delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and has_firm_role(((storage.foldername(name))[1])::uuid, array['owner', 'agent']))
  ));
