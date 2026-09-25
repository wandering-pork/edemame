import type { FirmFormerMember, FirmMemberRow } from '../types';

/**
 * Step 1 · 1G.6 — resolving a userId to a display name for *past* work
 * (task assignee, case owner, activity-feed actor) once a member may be
 * disabled, removed, or have left. `mapFirmDirectoryToTeamMembers`
 * (`lib/firmDirectory.ts`) only ever returns *active* members for
 * pickers — this is the read-only fallback path so old items don't just
 * show blank once someone's no longer active.
 *
 * Resolution order: active member -> disabled member (suffixed) -> former
 * member (suffixed) -> unknown (null, caller decides the fallback text).
 */

export interface MemberDisplayName {
  name: string;
  /** True for a disabled or former member — callers can style this differently (e.g. muted). */
  isPast: boolean;
}

export function resolveMemberDisplayName(
  userId: string | undefined | null,
  allMembers: FirmMemberRow[],
  formerMembers: FirmFormerMember[],
): MemberDisplayName | null {
  if (!userId) return null;

  const active = allMembers.find(m => m.userId === userId && m.status === 'active');
  if (active) {
    return { name: active.fullName?.trim() || active.email, isPast: false };
  }

  const disabled = allMembers.find(m => m.userId === userId && m.status === 'disabled');
  if (disabled) {
    return { name: `${disabled.fullName?.trim() || disabled.email} (disabled)`, isPast: true };
  }

  const former = formerMembers.find(m => m.userId === userId);
  if (former) {
    return { name: `${former.fullName} (former member)`, isPast: true };
  }

  return null;
}

/** Convenience for a plain string, with a caller-supplied fallback for a truly unknown/unset id. */
export function memberDisplayNameOr(
  userId: string | undefined | null,
  allMembers: FirmMemberRow[],
  formerMembers: FirmFormerMember[],
  fallback: string,
): string {
  return resolveMemberDisplayName(userId, allMembers, formerMembers)?.name ?? fallback;
}
