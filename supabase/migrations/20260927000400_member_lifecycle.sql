-- Step 1 · 1G.6 — Member lifecycle: disable, remove, reassign, former
-- members.
--
-- Today, disabling a member (1G.2's firm_members.status) is a reversible
-- pause, but there's no "remove" — only disable. Decision 4
-- (docs/plans/step-1g-team-experience.md) confirms remove should actually
-- delete the firm_members row, so the person disappears from the Team page
-- entirely (re-inviting them brings them back, and since their user id
-- doesn't change, their old work reconnects automatically).
--
-- Deleting the row loses the name behind their past work, though — names
-- live in auth.users, which the client can't read directly, and once the
-- membership row is gone there's no firm-scoped way to look them up at all.
-- So removal (and leaving) first snapshots the name into a small new table,
-- firm_former_members, purely for *display* ("Jane Smith (former member)"
-- on old assignments/case owners/activity — see FirmContext.tsx and
-- lib/memberDirectory.ts). It is never used for permissions or pickers.
--
-- This migration:
--   1. Creates firm_former_members (RLS: firm members can read; no direct
--      writes — only the security-definer functions below write it).
--   2. Adds remove_member(f, user_id): security definer, enforces the same
--      "owner, or admin removing a plain Member" rule as the existing
--      "owners or admins remove members" DELETE policy
--      (20260927000000_firm_roles.sql), snapshots the removed member's name
--      into firm_former_members, then deletes their firm_members row, all
--      in one transaction. Nobody removes themselves through this path —
--      that's leave_firm() (20260927000300_leave_firm.sql).
--   3. Updates leave_firm() to snapshot the leaver the same way before
--      deleting their row (copied verbatim from its own migration, plus the
--      snapshot — same grants).
--   4. Updates _accept_invite_for_user() so accepting a fresh invite clears
--      any stale former-member row for that firm+user (re-inviting someone
--      un-retires them) — copied verbatim from its own migration, plus the
--      delete.
--
-- IMPORTANT: this migration is NOT applied yet. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration
-- here. Must be applied *before* deploying the frontend that calls
-- remove_member() (components/team/FirmTeamMembers.tsx) or reads
-- firm_former_members (contexts/FirmContext.tsx).

-- ---------------------------------------------------------------------------
-- 1. firm_former_members
-- ---------------------------------------------------------------------------

create table if not exists firm_former_members (
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null,
  full_name text not null,
  email text,
  removed_at timestamptz not null default now(),
  removed_by uuid,
  primary key (firm_id, user_id)
);

alter table firm_former_members enable row level security;

-- Any active member of the firm can read the (small, display-only) former
-- member list — same visibility as the live member directory. No insert,
-- update or delete policy for any role: every write goes through
-- remove_member()/leave_firm() (security definer) or
-- _accept_invite_for_user()'s cleanup delete below.
drop policy if exists "firm members read former members" on firm_former_members;
create policy "firm members read former members" on firm_former_members
  for select to authenticated using (is_firm_member(firm_id));

revoke all on firm_former_members from public, anon;
grant select on firm_former_members to authenticated;

-- ---------------------------------------------------------------------------
-- 2. remove_member(f, p_user_id): the Team page's "Remove" action.
-- ---------------------------------------------------------------------------

create or replace function remove_member(f uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
  target_role text;
  target_status text;
  target_name text;
  target_email text;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  if caller = p_user_id then
    raise exception 'Use "Leave firm" to remove yourself.';
  end if;

  select role into caller_role from firm_members
    where firm_id = f and user_id = caller and status = 'active';
  if caller_role is null then
    raise exception 'You are not an active member of this firm.';
  end if;

  select role, status into target_role, target_status
    from firm_members
    where firm_id = f and user_id = p_user_id
    for update;
  if target_role is null then
    raise exception 'That person is not a member of this firm.';
  end if;

  -- Same rule as the "owners or admins remove members" RLS delete policy:
  -- owners may remove anyone, admins only a plain Member.
  if caller_role = 'owner' then
    null;
  elsif caller_role = 'admin' then
    if target_role <> 'member' then
      raise exception 'Only a firm owner can manage admins or owners';
    end if;
  else
    raise exception 'Only a firm owner or admin can remove a member';
  end if;

  -- Never leave a firm without an active owner.
  if target_role = 'owner' and target_status = 'active' and not exists (
    select 1 from firm_members
    where firm_id = f and user_id <> p_user_id and role = 'owner' and status = 'active'
  ) then
    raise exception 'A firm must keep at least one active owner';
  end if;

  select coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), email::text, 'Former member'),
         email::text
    into target_name, target_email
    from auth.users
    where id = p_user_id;

  insert into firm_former_members (firm_id, user_id, full_name, email, removed_at, removed_by)
  values (f, p_user_id, target_name, target_email, now(), caller)
  on conflict (firm_id, user_id) do update
    set full_name = excluded.full_name, email = excluded.email,
        removed_at = excluded.removed_at, removed_by = excluded.removed_by;

  delete from firm_members where firm_id = f and user_id = p_user_id;
end $$;

revoke all on function remove_member(uuid, uuid) from public, anon;
grant execute on function remove_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. leave_firm(): re-create with the same snapshot, verbatim body from
--    20260927000300_leave_firm.sql plus the firm_former_members insert.
-- ---------------------------------------------------------------------------

create or replace function leave_firm(f uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  caller_role text;
  caller_status text;
  replacement_firm_id uuid;
  leaver_name text;
  leaver_email text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select role, status into caller_role, caller_status
    from firm_members
    where firm_id = f and user_id = uid;

  if caller_role is null then
    raise exception 'You are not a member of this firm.';
  end if;

  -- Mirror firm_members_guard()'s last-owner rule: only an *active* owner
  -- counts, so a disabled member (who never has real access) can always
  -- leave, and this never blocks removing a membership that was already
  -- disabled.
  if caller_role = 'owner' and caller_status = 'active' and not exists (
    select 1 from firm_members
    where firm_id = f and user_id <> uid and role = 'owner' and status = 'active'
  ) then
    raise exception 'You are the last owner of this firm. Make someone else an owner first.';
  end if;

  select coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), email::text, 'Former member'),
         email::text
    into leaver_name, leaver_email
    from auth.users
    where id = uid;

  insert into firm_former_members (firm_id, user_id, full_name, email, removed_at, removed_by)
  values (f, uid, leaver_name, leaver_email, now(), uid)
  on conflict (firm_id, user_id) do update
    set full_name = excluded.full_name, email = excluded.email,
        removed_at = excluded.removed_at, removed_by = excluded.removed_by;

  delete from firm_members where firm_id = f and user_id = uid;

  -- If this was the caller's current firm, point them at another active
  -- membership (most recently joined) or null — the same fallback
  -- FirmContext.tsx's resolveCurrentFirm() applies on load, done here too so
  -- a stale current_firm_id never briefly points at a firm they just left.
  if exists (select 1 from profiles where user_id = uid and current_firm_id = f) then
    select firm_id into replacement_firm_id
      from firm_members
      where user_id = uid and status = 'active'
      order by joined_at desc
      limit 1;
    update profiles set current_firm_id = replacement_firm_id where user_id = uid;
  end if;
end $$;

revoke all on function leave_firm(uuid) from public, anon;
grant execute on function leave_firm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. _accept_invite_for_user(): re-create with the same body from
--    20260927000200_invitations.sql plus one cleanup delete — accepting a
--    fresh invite un-retires a former member (their old firm_former_members
--    row, if any, would otherwise keep showing a stale "(former member)" tag
--    on their now-current work).
-- ---------------------------------------------------------------------------

create or replace function _accept_invite_for_user(p_invite_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  target_email text;
  target_confirmed boolean;
  result_firm_name text;
begin
  select id, firm_id, email, role, accepted_at, revoked_at, declined_at, expires_at
    into inv
    from firm_invites
    where id = p_invite_id
    for update;

  if inv.id is null then
    raise exception 'This invite no longer exists.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'This invite has been revoked.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been accepted.';
  end if;
  if inv.declined_at is not null then
    raise exception 'This invite has already been declined.';
  end if;
  if inv.expires_at < now() then
    raise exception 'This invite has expired. Ask the firm owner to send a new one.';
  end if;

  select email, (email_confirmed_at is not null) into target_email, target_confirmed
    from auth.users
    where id = p_user_id;

  if target_email is null then
    raise exception 'Could not verify your account.';
  end if;
  if not target_confirmed then
    raise exception 'Confirm your email address before accepting this invite.';
  end if;
  if lower(target_email) <> lower(inv.email) then
    raise exception 'This invite was sent to a different email address than the one you are signed in with.';
  end if;

  -- Already a member (e.g. re-clicking a link, or accepting an in-app
  -- invite for a firm they somehow already joined another way): don't
  -- touch their existing role/status, just proceed to stamp the invite.
  insert into firm_members (firm_id, user_id, role)
  values (inv.firm_id, p_user_id, inv.role)
  on conflict (firm_id, user_id) do nothing;

  -- Step 1 · 1G.6: re-joining clears any stale "former member" snapshot for
  -- this firm — they're active again, not former.
  delete from firm_former_members where firm_id = inv.firm_id and user_id = p_user_id;

  if exists (select 1 from profiles where user_id = p_user_id) then
    update profiles set current_firm_id = inv.firm_id, storage_mode = 'cloud'
      where user_id = p_user_id;
  else
    insert into profiles (user_id, storage_mode, current_firm_id)
      values (p_user_id, 'cloud', inv.firm_id);
  end if;

  update firm_invites set accepted_at = now() where id = inv.id;

  select name into result_firm_name from firms where id = inv.firm_id;

  return jsonb_build_object('firm_id', inv.firm_id, 'firm_name', result_firm_name);
end $$;

revoke all on function _accept_invite_for_user(uuid, uuid) from public, anon, authenticated;
