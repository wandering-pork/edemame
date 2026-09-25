/**
 * Step 1 · 1G.1 — which firm a Local → Cloud storage switch may copy into.
 *
 * The switch wipes the destination firm (`repositories/migrate.ts`'s
 * `clearAll()`) before copying the local folder in, so the destination must
 * belong to this person alone. `profiles.current_firm_id` is NOT enough on its
 * own: a local-mode user can have it pointing at a shared firm (e.g. they
 * accepted an invite while in local mode), and wiping that would delete
 * everyone else's work.
 */

/** One active member of a firm, as visible to the signed-in user under RLS. */
export interface ActiveFirmMember {
  userId: string;
  role: string;
}

/**
 * True when `userId` is the only active member of the firm. `members` is the
 * firm's active members as the signed-in user can see them — an empty list
 * means they aren't an active member themselves (RLS hides the rows).
 */
export function isSoleActiveMember(members: ActiveFirmMember[], userId: string): boolean {
  return members.length === 1 && members[0]!.userId === userId;
}

export type CloudSwitchTarget =
  | { kind: 'reuse'; firmId: string }
  | { kind: 'create' };

/**
 * Reuse the current firm only if this user is its sole active member and its
 * owner; otherwise create a fresh personal firm. Never picks a shared firm.
 */
export function pickCloudSwitchTarget(
  currentFirmId: string | null | undefined,
  currentFirmActiveMembers: ActiveFirmMember[],
  userId: string,
): CloudSwitchTarget {
  if (!currentFirmId) return { kind: 'create' };
  if (!isSoleActiveMember(currentFirmActiveMembers, userId)) return { kind: 'create' };
  if (currentFirmActiveMembers[0]!.role !== 'owner') return { kind: 'create' };
  return { kind: 'reuse', firmId: currentFirmId };
}
