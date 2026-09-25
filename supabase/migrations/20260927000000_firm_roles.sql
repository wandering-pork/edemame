-- Step 1 · 1G.2 — Roles: Owner / Admin / Member + job title.
--
-- Today's three roles (owner, agent, paralegal) conflate two different
-- things: "owner" is a permission, "agent"/"paralegal" are job titles that
-- also happen to carry permissions. This splits them into two fields:
--   1. Access role: owner | admin | member (what you can do).
--   2. job_title: a display-only pick list (who you are — never used for
--      permissions), replacing the cosmetic FIRM_ROLE_TO_TEAM_MEMBER_ROLE
--      mapping in lib/firmDirectory.ts.
--
-- Permission table (see docs/plans/step-1g-team-experience.md, 1G.2):
--   - Everyone: all case work.
--   - Delete clients/cases/documents: owner + admin only.
--   - Invite / resend / revoke invites, disable / re-enable / remove
--     Members: owner + admin. Admins may only invite as Member.
--   - Promote to admin/owner, demote/remove admins or owners, rename firm:
--     owner only.
--   - Delete activity/usage history: owner only (unchanged).
--   - Last active owner can never be demoted/disabled (existing rule, kept).
--   - Everyone can edit their own availability and job_title, never their
--     own role or status.
--
-- IMPORTANT: this migration is NOT applied yet. It must be applied together
-- with the 1G.2 frontend deploy — the old app code sends `agent`/`paralegal`,
-- which the new check constraint rejects. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration here.

-- ---------------------------------------------------------------------------
-- 1. firm_members: job_title column, then migrate role data (job_title is
--    derived from the OLD role value, so it must be backfilled before role
--    is rewritten), then swap the role check constraint.
-- ---------------------------------------------------------------------------

alter table firm_members add column if not exists job_title text;

update firm_members set job_title = 'registered_migration_agent' where role = 'agent' and job_title is null;
update firm_members set job_title = 'paralegal' where role = 'paralegal' and job_title is null;

alter table firm_members drop constraint if exists firm_members_role_check;
update firm_members set role = 'member' where role in ('agent', 'paralegal');
alter table firm_members add constraint firm_members_role_check check (role in ('owner', 'admin', 'member'));

alter table firm_members add constraint firm_members_job_title_check check (job_title in (
  'registered_migration_agent', 'lawyer', 'paralegal', 'case_officer', 'office_staff', 'other'
));

-- ---------------------------------------------------------------------------
-- 2. firm_invites: same role migration, no job_title (a pending invite has
--    no member row yet — job title is chosen after accepting).
-- ---------------------------------------------------------------------------

alter table firm_invites drop constraint if exists firm_invites_role_check;
update firm_invites set role = 'member' where role in ('agent', 'paralegal');
alter table firm_invites add constraint firm_invites_role_check check (role in ('owner', 'admin', 'member'));

-- ---------------------------------------------------------------------------
-- 3. firm_members_guard(): owner changes anything; admin changes status /
--    job_title / availability only on rows that are (and stay) 'member';
--    everyone else may only change their own availability and job_title.
--    firm_id/user_id stay immutable for every caller. Server-role callers
--    (no auth.uid(), e.g. this migration's own UPDATE statements above, or
--    api/ functions using the service role) skip every role check below —
--    note the backfill UPDATEs above ran before this trigger was replaced,
--    so they were already exempt under the OLD function's same auth.uid()
--    is null check; re-affirmed here for any future service-role writes.
--
--    Last-owner check: unaffected by this migration's own data backfill,
--    since every existing owner row keeps role = 'owner' throughout (only
--    agent/paralegal rows are rewritten to 'member') — so old.role = 'owner'
--    and new.role <> 'owner' never fires here.
-- ---------------------------------------------------------------------------

create or replace function firm_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
begin
  if new.firm_id is distinct from old.firm_id or new.user_id is distinct from old.user_id then
    raise exception 'firm_id and user_id cannot be changed; remove and re-add the member instead';
  end if;

  -- Service-role / migration callers (no auth.uid()) bypass every role check
  -- below — RLS/the trigger only constrains authenticated end-user sessions.
  if caller is not null then
    if caller = old.user_id then
      -- Caller editing their own row: always allowed to change availability
      -- and job_title. Role/status changes to your own row are allowed only
      -- when you're an owner (an owner demoting themselves, say) — never for
      -- an admin or member, who could otherwise self-promote.
      select role into caller_role from firm_members
        where firm_id = old.firm_id and user_id = caller and status = 'active';
      if caller_role is distinct from 'owner'
         and (new.role is distinct from old.role or new.status is distinct from old.status) then
        raise exception 'Only a firm owner can change roles or member status';
      end if;
    else
      select role into caller_role from firm_members
        where firm_id = old.firm_id and user_id = caller and status = 'active';

      if caller_role = 'owner' then
        -- owners may change anything on anyone
        null;
      elsif caller_role = 'admin' then
        -- admins may only touch rows that are, and remain, plain Members —
        -- never another admin's or owner's row, and never promote a member
        -- to admin/owner through this path.
        if old.role <> 'member' or new.role <> 'member' then
          raise exception 'Only a firm owner can manage admins or owners';
        end if;
      else
        raise exception 'Only a firm owner can change roles or member status';
      end if;
    end if;
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

-- CREATE OR REPLACE keeps existing grants, but re-revoke to be safe (a
-- trigger function needs no direct EXECUTE grant — see 20260926000500's
-- comment for why).
revoke execute on function firm_members_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. firm_member_directory(): also return job_title. Changing a function's
--    return type needs drop + create (CREATE OR REPLACE can't do this).
-- ---------------------------------------------------------------------------

drop function if exists firm_member_directory(uuid);

create function firm_member_directory(f uuid)
returns table (
  user_id uuid, email text, full_name text, role text, status text,
  availability text, joined_at timestamptz, job_title text
)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, u.email::text, coalesce(u.raw_user_meta_data->>'full_name', u.email)::text,
         m.role, m.status, m.availability, m.joined_at, m.job_title
  from firm_members m
  join auth.users u on u.id = m.user_id
  where m.firm_id = f and is_firm_member(f)
  order by m.joined_at;
$$;

revoke all on function firm_member_directory(uuid) from public, anon;
grant execute on function firm_member_directory(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Policies that name roles by value: drop by name, recreate with the new
--    vocabulary. ['owner','agent'] -> ['owner','admin'] everywhere; the
--    owner-only member-management policies become owner-or-admin, with the
--    admin-can't-touch-admins/owners rule enforced by the trigger above (a
--    row-level UPDATE policy can only gate on the row being touched, not
--    compare it against other rows/roles the way the trigger can).
-- ---------------------------------------------------------------------------

-- clients / cases / documents: delete stays owner+admin (renamed from
-- owner+agent).
drop policy if exists "firm rows delete" on clients;
create policy "firm rows delete" on clients
  for delete to authenticated using (has_firm_role(firm_id, array['owner', 'admin']));

drop policy if exists "firm rows delete" on cases;
create policy "firm rows delete" on cases
  for delete to authenticated using (has_firm_role(firm_id, array['owner', 'admin']));

drop policy if exists "firm rows delete" on documents;
create policy "firm rows delete" on documents
  for delete to authenticated using (has_firm_role(firm_id, array['owner', 'admin']));

-- storage: firm document objects delete, same owner+admin change.
drop policy if exists "firm document objects delete" on storage.objects;
create policy "firm document objects delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or ((storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and has_firm_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin']))
  ));

-- firm_members: "owners manage members" (update) / "owners remove members"
-- (delete) become owner-or-admin at the RLS layer; the trigger above is what
-- actually stops an admin from touching another admin/owner row, since RLS
-- policies here can't see the target row's *current* role vs the caller's
-- without recursing into firm_members (has_firm_role only checks the
-- caller's own role). The delete policy additionally restricts an admin
-- caller to deleting only rows whose role is 'member' — that comparison IS
-- expressible in an RLS USING clause (it only reads the target row, not the
-- caller's).
drop policy if exists "owners manage members" on firm_members;
create policy "owners or admins manage members" on firm_members
  for update to authenticated
  using (has_firm_role(firm_id, array['owner', 'admin']))
  with check (has_firm_role(firm_id, array['owner', 'admin']));

drop policy if exists "owners remove members" on firm_members;
create policy "owners or admins remove members" on firm_members
  for delete to authenticated
  using (
    has_firm_role(firm_id, array['owner'])
    or (has_firm_role(firm_id, array['admin']) and role = 'member')
  );

-- firm_invites: "owners read invites" / "owners revoke invites" become
-- owner-or-admin (an admin may only invite as Member — enforced in
-- api/invite-member.ts, not here, since invite rows are written by the
-- service role and have no insert policy for `authenticated`).
drop policy if exists "owners read invites" on firm_invites;
create policy "owners or admins read invites" on firm_invites
  for select to authenticated using (has_firm_role(firm_id, array['owner', 'admin']));

drop policy if exists "owners revoke invites" on firm_invites;
create policy "owners or admins revoke invites" on firm_invites
  for update to authenticated
  using (has_firm_role(firm_id, array['owner', 'admin']))
  with check (has_firm_role(firm_id, array['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- 6. Signed-in users may only change an invite's revoked_at. The update
--    policy above admits owners and admins to the whole row, so without
--    this an admin could rewrite a pending invite's role to 'owner', send it
--    to an address they control and accept it — escalating past the
--    "admins only invite Members" rule. Every other invite write (create,
--    resend, accept) goes through api/ with the service role, which isn't
--    affected by these grants.
-- ---------------------------------------------------------------------------

revoke update on firm_invites from public, anon, authenticated;
grant update (revoked_at) on firm_invites to authenticated;
