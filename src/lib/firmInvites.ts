import type { FirmRole } from '../types';

/**
 * Step 1 · 1G.4 — pure logic shared by `components/team/PendingInvitationsBanner.tsx`,
 * `components/CreateFirmGate.tsx`, and `pages/InviteAccept.tsx`: mapping the
 * `my_pending_invites()` RPC's rows, deciding whether a just-invited user
 * still needs to set a password, and validating that new password. Kept out
 * of the components so it's unit-testable without mounting React.
 */

export interface PendingInvitation {
  id: string;
  firmId: string;
  firmName: string;
  role: FirmRole;
  inviterName: string;
  expiresAt: string; // ISO
}

/** Raw shape of a row returned by the `my_pending_invites()` RPC. */
export interface PendingInviteRpcRow {
  id: string;
  firm_id: string;
  firm_name: string;
  role: FirmRole;
  inviter_name: string;
  expires_at: string;
}

export function mapPendingInviteRows(rows: PendingInviteRpcRow[]): PendingInvitation[] {
  return rows.map(r => ({
    id: r.id,
    firmId: r.firm_id,
    firmName: r.firm_name,
    role: r.role,
    inviterName: r.inviter_name,
    expiresAt: r.expires_at,
  }));
}

/**
 * A minimal shape of the Supabase Auth user this needs — narrower than the
 * app's own `AuthUser` (contexts/AuthContext.tsx) since `invited_at` isn't
 * part of that type, so pages/InviteAccept.tsx reads it off the raw
 * `supabase.auth.getUser()` response instead of `useAuth()`'s user.
 */
export interface InviteSetupCandidate {
  invited_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * True for a first-time invited user who hasn't chosen a password yet:
 * Supabase's admin invite endpoint (api/_lib/firms.ts's sendAuthInviteEmail)
 * creates the auth user with `invited_at` set and no password, so signing in
 * via the invite link leaves them with no way back in once that session
 * ends (see docs/plans/step-1g-team-experience.md, 1G.4 item 1). Once they
 * set one, `password_set: true` is stamped into user_metadata and this
 * returns false for every later invite they accept.
 */
export function needsAccountSetup(user: InviteSetupCandidate | null | undefined): boolean {
  if (!user) return false;
  if (!user.invited_at) return false;
  return user.user_metadata?.password_set !== true;
}

const MIN_PASSWORD_LENGTH = 6;

/** Mirrors pages/LandingPage.tsx's sign-up validation (length + match) — kept as a small local copy rather than importing a shared helper, since none exists on this base branch yet (see the module doc comment on PR #63 adding one later). */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return 'The two passwords do not match.';
  }
  return null;
}

/**
 * The SQL functions in supabase/migrations/20260927000200_invitations.sql
 * raise exceptions with plain, already-user-facing messages (see the
 * "Use clear exception messages" rule in that migration's header) — Supabase
 * JS surfaces them verbatim as `error.message`. This just guards against an
 * empty/unexpected error shape reaching the UI unstyled.
 */
export function friendlyInviteError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}
