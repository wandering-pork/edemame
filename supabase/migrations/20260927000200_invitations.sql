-- Step 1 · 1G.4 — Joining a firm.
--
-- Adds the transactional accept/decline path both the emailed-link route
-- (api/accept-invite.ts) and the in-app route (a new
-- PendingInvitationsBanner + CreateFirmGate) share, plus a lookup so a
-- signed-in existing user can see their own pending invitations without a
-- link at all.
--
--   1. `_accept_invite_for_user(invite_id, user_id)` — a PRIVATE helper
--      (EXECUTE revoked from everyone; only the two public wrappers below
--      call it) that does the whole acceptance in one transaction: locks
--      the invite row `for update`, validates it, checks the invite's email
--      against the target user's own *confirmed* email in `auth.users`,
--      inserts (or no-ops on) the `firm_members` row, upserts `profiles`,
--      and stamps `accepted_at`. This replaces the multi-request,
--      not-atomic sequence `api/accept-invite.ts` used to run itself over
--      plain PostgREST calls with the service role (see that file's old
--      "KNOWN GAP" comment, removed in this change).
--   2. `accept_invite(invite_id)` / `accept_invite_by_token(token_hash)` —
--      SECURITY DEFINER wrappers that call the helper for `auth.uid()`.
--      `accept_invite_by_token` is what `api/accept-invite.ts` now calls
--      (as the signed-in user, over their own access token — the service
--      role is no longer needed for acceptance itself), and `accept_invite`
--      is what the in-app PendingInvitationsBanner / CreateFirmGate call
--      directly via `supabase.rpc()`.
--   3. `decline_invite(invite_id)` — sets `declined_at` if the invite's
--      email matches the caller's own confirmed email. Idempotent: declining
--      an already-declined invite is a no-op rather than an error, so a
--      double-click (or the banner re-rendering mid-request) doesn't surface
--      a scary message.
--   4. `my_pending_invites()` — the in-app banner's data source: every open,
--      unexpired invite addressed to the caller's own confirmed email, with
--      the firm name and inviter's display name resolved server-side (the
--      client can't read `auth.users` directly). Never returns `token_hash`.
--
-- Cross-cutting rule (docs/plans/step-1g-team-experience.md): matching an
-- invite to a person by email requires `auth.users.email_confirmed_at is
-- not null` — otherwise someone could sign up with a colleague's address and
-- pick up their invitation before the real owner of that address ever
-- confirms it.
--
-- The `firm_members_guard` trigger (20260926000300_create_firms.sql,
-- rewritten by 20260927000000_firm_roles.sql) only fires BEFORE UPDATE on
-- firm_members — the plain INSERT below is untouched by it, so joining a
-- firm for the first time never has to satisfy the "only an owner changes
-- roles" check that guards role changes on an *existing* membership row.
--
-- IMPORTANT: this migration is NOT applied yet. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration here.
-- Must be applied *before* deploying the frontend that calls these RPCs
-- (api/accept-invite.ts, PendingInvitationsBanner, CreateFirmGate).

-- ---------------------------------------------------------------------------
-- 1. Private helper.
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

-- ---------------------------------------------------------------------------
-- 2. Public wrappers.
-- ---------------------------------------------------------------------------

create or replace function accept_invite(invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  return _accept_invite_for_user(invite_id, uid);
end $$;

revoke all on function accept_invite(uuid) from public, anon;
grant execute on function accept_invite(uuid) to authenticated;

-- Token-based path (api/accept-invite.ts): the raw token never reaches
-- Postgres, only its sha256 hash, matching how firm_invites.token_hash is
-- stored (see api/_lib/firms.ts's hashInviteToken()).
create or replace function accept_invite_by_token(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  inv_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select id into inv_id from firm_invites where token_hash = p_token_hash;
  if inv_id is null then
    raise exception 'This invite link is invalid.';
  end if;
  return _accept_invite_for_user(inv_id, uid);
end $$;

revoke all on function accept_invite_by_token(text) from public, anon;
grant execute on function accept_invite_by_token(text) to authenticated;

create or replace function decline_invite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  inv record;
  target_email text;
  target_confirmed boolean;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select id, email, accepted_at, revoked_at, declined_at
    into inv
    from firm_invites
    where id = invite_id
    for update;

  if inv.id is null then
    raise exception 'This invite no longer exists.';
  end if;
  if inv.accepted_at is not null then
    raise exception 'This invite has already been accepted.';
  end if;
  if inv.revoked_at is not null then
    raise exception 'This invite has been revoked.';
  end if;
  if inv.declined_at is not null then
    -- Idempotent: a double-click or a stale banner re-declining shouldn't
    -- surface an error.
    return;
  end if;

  select email, (email_confirmed_at is not null) into target_email, target_confirmed
    from auth.users
    where id = uid;

  if target_email is null or not target_confirmed or lower(target_email) <> lower(inv.email) then
    raise exception 'This invite was sent to a different email address than the one you are signed in with.';
  end if;

  update firm_invites set declined_at = now() where id = inv.id;
end $$;

revoke all on function decline_invite(uuid) from public, anon;
grant execute on function decline_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. my_pending_invites(): the in-app banner's data source. Matched by the
--    caller's own confirmed email only — never returns token_hash.
-- ---------------------------------------------------------------------------

create or replace function my_pending_invites()
returns table (
  id uuid,
  firm_id uuid,
  firm_name text,
  role text,
  inviter_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fi.id,
    fi.firm_id,
    f.name,
    fi.role,
    coalesce(nullif(trim(iu.raw_user_meta_data->>'full_name'), ''), iu.email::text, 'A firm owner') as inviter_name,
    fi.expires_at
  from firm_invites fi
  join firms f on f.id = fi.firm_id
  join auth.users me on me.id = (select auth.uid())
  left join auth.users iu on iu.id = fi.invited_by
  where fi.accepted_at is null
    and fi.revoked_at is null
    and fi.declined_at is null
    and fi.expires_at > now()
    and me.email_confirmed_at is not null
    and lower(fi.email) = lower(me.email)
  order by fi.created_at desc;
$$;

revoke all on function my_pending_invites() from public, anon;
grant execute on function my_pending_invites() to authenticated;
