-- Step 1 · 1G.3 — Invite: check the firm first.
--
-- Today api/invite-member.ts creates a new invite for any email address,
-- even one that's already an active member, a disabled member, or already
-- has a pending invite. This adds:
--   1. firm_invites.declined_at (an invite a signed-in existing user
--      explicitly declined — see 1G.4's in-app invitations; unused by this
--      PR, but the partial unique index below needs to account for it now
--      rather than widen the index again later).
--   2. A partial unique index: at most one OPEN invite per (firm, email).
--      "Open" means accepted_at, revoked_at and declined_at are all null.
--      Existing duplicates are revoked (keeping only the newest) before the
--      index is created, since a partial unique index can't be added over
--      data that already violates it.
--   3. firm_email_status(f, email) — a security-definer lookup
--      api/invite-member.ts calls (as the caller, via a normal RPC POST, not
--      the service role) to decide whether an invite is really new, a
--      resend, or should be refused. It looks ONLY inside firm `f` — see
--      "Never look outside your own firm" in docs/plans/step-1g-team-experience.md.
--
-- Companion lookup for the Re-enable button (1G.6) on a `disabled` result:
-- chose the SIMPLER of the two options in the 1G.3 spec — the UI already has
-- every member's user_id + email loaded via FirmContext's member directory
-- (firm_member_directory() returns disabled members too, only
-- mapFirmDirectoryToTeamMembers() filters them out for pickers), so
-- components/team/FirmTeamMembers.tsx resolves a disabled email's user_id by
-- matching against that already-loaded list instead of this function
-- returning a composite/jsonb result or a second RPC existing just for this.
--
-- IMPORTANT: this migration is NOT applied yet. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration here.

-- ---------------------------------------------------------------------------
-- 1. declined_at
-- ---------------------------------------------------------------------------

alter table firm_invites add column if not exists declined_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Revoke all but the newest open invite per (firm_id, lower(email)),
--    then the partial unique index. "Open" = accepted_at, revoked_at and
--    declined_at all null.
-- ---------------------------------------------------------------------------

with ranked as (
  select id,
         row_number() over (
           partition by firm_id, lower(email)
           order by created_at desc
         ) as rn
  from firm_invites
  where accepted_at is null and revoked_at is null and declined_at is null
)
update firm_invites fi
set revoked_at = now()
from ranked r
where fi.id = r.id and r.rn > 1;

create unique index if not exists firm_invites_open_email_idx
  on firm_invites (firm_id, lower(email))
  where accepted_at is null and revoked_at is null and declined_at is null;

-- ---------------------------------------------------------------------------
-- 3. firm_email_status(): looks only inside firm f. Raises unless the caller
--    is an active owner or admin of f (the same bar api/invite-member.ts
--    already enforces before calling this, re-checked here since this is
--    callable directly as an RPC by any authenticated user).
-- ---------------------------------------------------------------------------

create or replace function firm_email_status(f uuid, p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  norm_email text := lower(trim(p_email));
  hit boolean;
begin
  if not has_firm_role(f, array['owner', 'admin']) then
    raise exception 'Only a firm owner or admin can look up a firm email status';
  end if;

  select exists (
    select 1 from firm_members m
    join auth.users u on u.id = m.user_id
    where m.firm_id = f and m.status = 'active' and lower(u.email) = norm_email
  ) into hit;
  if hit then
    return 'active';
  end if;

  select exists (
    select 1 from firm_members m
    join auth.users u on u.id = m.user_id
    where m.firm_id = f and m.status = 'disabled' and lower(u.email) = norm_email
  ) into hit;
  if hit then
    return 'disabled';
  end if;

  select exists (
    select 1 from firm_invites
    where firm_id = f and lower(email) = norm_email
      and accepted_at is null and revoked_at is null and declined_at is null
  ) into hit;
  if hit then
    return 'pending';
  end if;

  return 'none';
end $$;

revoke all on function firm_email_status(uuid, text) from public, anon;
grant execute on function firm_email_status(uuid, text) to authenticated;
