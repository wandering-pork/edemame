/**
 * Step 1 · 1G.6 — maps the raw Postgres error messages thrown by the
 * `firm_members_guard()` trigger and the `remove_member()`/`leave_firm()`
 * RPCs (see `supabase/migrations/20260927000000_firm_roles.sql` and
 * `…20260927000400_member_lifecycle.sql`) to plain inline copy for
 * `components/team/FirmTeamMembers.tsx`, instead of surfacing a raw
 * `postgrest` error string. Matched by substring since Supabase wraps the
 * `RAISE EXCEPTION` message with a PostgREST error envelope (a periods and
 * quoting can vary slightly across drivers) — falls back to the original
 * message (or a generic one) for anything unrecognized.
 */

interface KnownError {
  match: string;
  message: string;
}

const KNOWN_ERRORS: KnownError[] = [
  {
    match: 'must keep at least one active owner',
    message: 'This firm needs at least one active owner — make someone else an owner first.',
  },
  {
    match: 'last owner',
    message: "You're the last owner of this firm. Make someone else an owner first.",
  },
  {
    match: 'Only a firm owner can manage admins or owners',
    message: "Only a firm owner can manage another admin's or owner's access.",
  },
  {
    match: 'Only a firm owner can change roles or member status',
    message: 'Only a firm owner or admin can do that.',
  },
  {
    match: 'Only a firm owner or admin can remove a member',
    message: 'Only a firm owner or admin can remove a member.',
  },
  {
    match: 'Use "Leave firm" to remove yourself',
    message: "Use \"Leave firm\" in Settings to remove your own access.",
  },
  {
    match: 'not an active member of this firm',
    message: "You're not currently an active member of this firm.",
  },
  {
    match: 'not a member of this firm',
    message: 'That person is not a member of this firm.',
  },
];

export function friendlyMemberLifecycleError(err: unknown): string {
  const raw = errorMessageOf(err);
  if (!raw) return 'Something went wrong — please try again.';
  const found = KNOWN_ERRORS.find(k => raw.includes(k.match));
  return found ? found.message : raw;
}

function errorMessageOf(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
    return (err as any).message;
  }
  return '';
}
