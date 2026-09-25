-- Step 1 · 1G.7 — "Assigned to you" notifications.
--
-- Today, assigning someone a task or making them a case's owner is silent —
-- they only find out by opening the app and noticing. `notifications` is
-- per-user (RLS-scoped to `auth.uid()`, not firm-scoped — see the firm
-- accounts migration's "Deliberately NOT firm-scoped" comment), so a plain
-- client-side insert can't write a row for a *different* user. This adds a
-- security-definer RPC, `notify_assignment(f, p_kind, p_entity_id)`, that
-- can.
--
-- Deliberately does NOT accept free-text title/message from the client — a
-- Member could otherwise use this to spam colleagues with arbitrary text
-- (see docs/plans/step-1g-team-experience.md, 1G.7). Instead it loads the
-- task or case row itself (scoped to firm `f`, so it can never be used to
-- probe another firm's data) and builds the notification's title/message
-- server-side from that row's own title and the caller's own name.
--
-- Checks, in order:
--   1. Caller is an active member of firm `f`.
--   2. The task/case exists in firm `f` and has an `assigned_to`/
--      `case_owner`.
--   3. That assignee is an active member of firm `f` (never notify someone
--      who isn't a current member).
--   4. Assignee <> caller (assigning something to yourself is a no-op).
--
-- Deduplicated by the deterministic id `assign:{kind}:{entityId}:{recipientId}`
-- with `on conflict do nothing` — re-saving the same assignment (e.g. an
-- unrelated field edit that doesn't change the assignee) never creates a
-- second notification for the same assignment. If the same person is later
-- re-assigned the same task after being unassigned, the id repeats and the
-- second notification is silently dropped too — an accepted, narrow gap
-- documented here rather than solved (a real "you've been re-assigned"
-- would need the id to also carry a timestamp or a running counter).
--
-- IMPORTANT: this migration is NOT applied yet. Dry-run first (rolled-back
-- transaction), then `get_advisors`, the same as every other migration
-- here. Must be applied *before* deploying the frontend that calls
-- notify_assignment() from App.tsx's handleUpdateTask/handleUpdateCase/
-- handleAssignCase/handleTasksConfirmed.

create or replace function notify_assignment(f uuid, p_kind text, p_entity_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  caller_name text;
  recipient_id text;
  recipient_uuid uuid;
  recipient_status text;
  row_title text;
  notif_id text;
  notif_title text;
  notif_message text;
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;
  if p_kind not in ('task', 'case') then
    raise exception 'Unknown assignment kind: %', p_kind;
  end if;

  if not exists (
    select 1 from firm_members where firm_id = f and user_id = caller and status = 'active'
  ) then
    raise exception 'You are not an active member of this firm.';
  end if;

  if p_kind = 'task' then
    select assigned_to, title into recipient_id, row_title
      from tasks
      where id = p_entity_id and firm_id = f;
  else
    select case_owner, title into recipient_id, row_title
      from cases
      where id = p_entity_id and firm_id = f;
  end if;

  if recipient_id is null then
    -- Row not found in this firm, or has no assignee/owner to notify — a
    -- quiet no-op rather than an error, since the caller just made a save
    -- that happened not to change the assignee, or unassigned it.
    return;
  end if;

  begin
    recipient_uuid := recipient_id::uuid;
  exception when others then
    return;
  end;

  if recipient_uuid = caller then
    return;
  end if;

  select status into recipient_status
    from firm_members
    where firm_id = f and user_id = recipient_uuid;
  if recipient_status is distinct from 'active' then
    return;
  end if;

  select coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), email::text, 'A teammate')
    into caller_name
    from auth.users
    where id = caller;

  notif_id := 'assign:' || p_kind || ':' || p_entity_id || ':' || recipient_uuid::text;

  if p_kind = 'task' then
    notif_title := 'Task assigned to you';
    notif_message := caller_name || ' assigned you a task: ' || coalesce(row_title, 'Untitled task');
  else
    notif_title := 'You are now a case owner';
    notif_message := caller_name || ' made you the owner of ' || coalesce(row_title, 'a case');
  end if;

  insert into notifications (id, user_id, title, message, type, read, created_at)
  values (notif_id, recipient_uuid, notif_title, notif_message, 'info', false, now()::text)
  on conflict (id) do nothing;
end $$;

revoke all on function notify_assignment(uuid, text, text) from public, anon;
grant execute on function notify_assignment(uuid, text, text) to authenticated;
