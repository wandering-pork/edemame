import type { FirmMemberRow, FirmRole } from '../types';

/**
 * Step 1 · 1G.3 — as the user types an email into the invite form,
 * `components/team/FirmTeamMembers.tsx` checks it against the already-loaded
 * `members` and `pendingInvites` and shows one of these hints immediately,
 * without waiting on a round trip. The server's `firm_email_status` RPC
 * (called by `api/invite-member.ts`) stays the authority — this is a UX
 * head start only, matched case-insensitively and trimmed the same way the
 * server normalizes it.
 */
export type InviteHintKind = 'already_member' | 'disabled_member' | 'pending_invite';

export interface InviteHint {
  kind: InviteHintKind;
  message: string;
  /** Only set for 'disabled_member' — resolved from the already-loaded member list (see the 1G.3 migration's own comment on why there's no second RPC for this). */
  userId?: string;
}

export interface PendingInviteLike {
  email: string;
  role: FirmRole;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function inviteHintFor(
  email: string,
  members: FirmMemberRow[],
  pendingInvites: PendingInviteLike[]
): InviteHint | null {
  const norm = normalize(email);
  if (!norm) return null;

  const activeMember = members.find(m => m.status === 'active' && normalize(m.email) === norm);
  if (activeMember) {
    return { kind: 'already_member', message: 'Already in your firm' };
  }

  const disabledMember = members.find(m => m.status === 'disabled' && normalize(m.email) === norm);
  if (disabledMember) {
    return {
      kind: 'disabled_member',
      message: 'This person is disabled — re-enable them instead of sending an invite.',
      userId: disabledMember.userId,
    };
  }

  const pending = pendingInvites.find(inv => normalize(inv.email) === norm);
  if (pending) {
    return {
      kind: 'pending_invite',
      message: 'An invite is already pending — sending again replaces the old link.',
    };
  }

  return null;
}
