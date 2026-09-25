-- Step 1 · 1G.5 — Several firms: leave_firm() RPC.
--
-- Backs Settings -> Firm's "Leave firm" action and FirmContext.tsx's
-- leaveFirm(firmId). Deletes the caller's own firm_members row for the given
-- firm. The existing "owners or admins remove members" RLS delete policy
-- (20260927000000_firm_roles.sql) would already let an owner delete their
-- own row via a plain PostgREST DELETE, but that policy has no last-owner
-- check (it only gates *who* may delete *which* rows, not what that leaves
-- behind) — a straight DELETE could leave a firm with zero owners, unlike
-- firm_members_guard(), which only fires BEFORE UPDATE. This RPC adds that
-- check, then also repoints the caller's own profiles.current_firm_id when
-- it pointed at the firm they just left, so FirmContext doesn't immediately
-- rediscover "lost access" to a firm they left on purpose.
--
-- IMPORTANT: this migration is NOT applied yet. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration here.
-- Must be applied *before* deploying the frontend that calls leave_firm().

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
