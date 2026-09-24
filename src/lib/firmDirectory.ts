import type { FirmMemberRow, FirmRole, TeamMember } from '../types';

/**
 * Step 1 · 1F: in cloud mode, `TeamMember` (the existing partner/lawyer/
 * assistant + available/busy/offline shape the rest of the app already reads
 * — case owner pickers, task assignees, the Team Dashboard) becomes a read
 * model derived from the firm's real member directory, rather than a
 * separately-edited table. This keeps every existing call site working
 * without a rewrite: only App.tsx's data-loading changes (directory instead
 * of `repos.teamMembers` in cloud mode — see FirmContext.tsx).
 *
 * Firm roles and TeamMember roles are different vocabularies (the former is
 * the real permission role; the latter is a cosmetic label used across the
 * UI today). The mapping below is display-only and never used for
 * authorization — see `canDeleteFirmData`/`canManageMembers` for that.
 */
const FIRM_ROLE_TO_TEAM_MEMBER_ROLE: Record<FirmRole, TeamMember['role']> = {
  owner: 'partner',
  agent: 'lawyer',
  paralegal: 'assistant',
};

export function firmRoleLabel(role: FirmRole): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'agent': return 'Agent';
    case 'paralegal': return 'Paralegal';
  }
}

export function initialsOfName(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
  return initials || '?';
}

/** Only active members render as assignable TeamMembers — disabled members drop out of pickers but keep their history. */
export function mapFirmMemberToTeamMember(row: FirmMemberRow): TeamMember {
  const displayName = row.fullName?.trim() || row.email;
  return {
    id: row.userId,
    name: displayName,
    email: row.email,
    avatar: initialsOfName(displayName),
    role: FIRM_ROLE_TO_TEAM_MEMBER_ROLE[row.role],
    caseCount: 0,
    activeTaskCount: 0,
    status: row.availability,
    joinedAt: row.joinedAt,
  };
}

export function mapFirmDirectoryToTeamMembers(rows: FirmMemberRow[]): TeamMember[] {
  return rows.filter(r => r.status === 'active').map(mapFirmMemberToTeamMember);
}

/** Paralegals can't delete clients, cases or documents (RLS is the real enforcement — see the firms migration's delete policies; this only hides the UI). `role === null` means local mode (single user, always allowed) or firm context not yet loaded. */
export function canDeleteFirmData(role: FirmRole | null): boolean {
  if (role === null) return true;
  return role === 'owner' || role === 'agent';
}

/** Only owners manage members (invite, change role, disable, revoke invites). */
export function canManageMembers(role: FirmRole | null): boolean {
  return role === 'owner';
}
