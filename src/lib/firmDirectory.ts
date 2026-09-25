import type { FirmJobTitle, FirmMemberRow, FirmRole, TeamMember } from '../types';

/**
 * Step 1 · 1F: in cloud mode, `TeamMember` (the existing partner/lawyer/
 * assistant + available/busy/offline shape the rest of the app already reads
 * — case owner pickers, task assignees, the Team Dashboard) becomes a read
 * model derived from the firm's real member directory, rather than a
 * separately-edited table. This keeps every existing call site working
 * without a rewrite: only App.tsx's data-loading changes (directory instead
 * of `repos.teamMembers` in cloud mode — see FirmContext.tsx).
 *
 * Step 1 · 1G.2 split the firm role into two fields: an access role
 * (owner | admin | member — what you can do) and a job title (display only,
 * never used for permissions — who you are). `deriveTeamMemberRole` below
 * replaces the old direct FirmRole -> TeamMember['role'] mapping, since
 * TeamMember's cosmetic role vocabulary (partner/lawyer/assistant) is still
 * read elsewhere in the UI and isn't worth widening for this.
 */
export const FIRM_JOB_TITLES: { value: FirmJobTitle; label: string }[] = [
  { value: 'registered_migration_agent', label: 'Registered migration agent' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'paralegal', label: 'Paralegal' },
  { value: 'case_officer', label: 'Case officer' },
  { value: 'office_staff', label: 'Office staff' },
  { value: 'other', label: 'Other' },
];

export function firmJobTitleLabel(jobTitle: FirmJobTitle | null): string | null {
  if (!jobTitle) return null;
  return FIRM_JOB_TITLES.find(t => t.value === jobTitle)?.label ?? null;
}

export function firmRoleLabel(role: FirmRole): string {
  switch (role) {
    case 'owner': return 'Owner';
    case 'admin': return 'Admin';
    case 'member': return 'Member';
  }
}

/**
 * TeamMember.role is a cosmetic display label (partner/lawyer/assistant)
 * used across pickers and the Team Dashboard — never authorization. Derived
 * from access role first (an owner reads as "partner", regardless of job
 * title), then job title for everyone else, with a sensible fallback.
 */
export function deriveTeamMemberRole(role: FirmRole, jobTitle: FirmJobTitle | null): TeamMember['role'] {
  if (role === 'owner') return 'partner';
  if (role === 'admin') return 'lawyer';
  switch (jobTitle) {
    case 'registered_migration_agent':
    case 'lawyer':
      return 'lawyer';
    case 'paralegal':
    case 'case_officer':
    case 'office_staff':
    case 'other':
    default:
      return 'assistant';
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
    role: deriveTeamMemberRole(row.role, row.jobTitle),
    caseCount: 0,
    activeTaskCount: 0,
    status: row.availability,
    joinedAt: row.joinedAt,
  };
}

export function mapFirmDirectoryToTeamMembers(rows: FirmMemberRow[]): TeamMember[] {
  return rows.filter(r => r.status === 'active').map(mapFirmMemberToTeamMember);
}

/** Members can't delete clients, cases or documents (RLS is the real enforcement — see the firm roles migration's delete policies; this only hides the UI). `role === null` means local mode (single user, always allowed) or firm context not yet loaded. */
export function canDeleteFirmData(role: FirmRole | null): boolean {
  if (role === null) return true;
  return role === 'owner' || role === 'admin';
}

/** Owners and admins manage Members (invite, disable/re-enable/remove, resend/revoke invites). Admins additionally can't touch other Admins or Owners — see `canManageMember`. */
export function canManageMembers(role: FirmRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Only owners promote/demote/remove Admins or Owners, and rename the firm. */
export function canManageAdmins(role: FirmRole | null): boolean {
  return role === 'owner';
}

/**
 * Whether `caller` may change `target`'s role/status/removal. Mirrors the
 * `firm_members_guard()` trigger (the real enforcement) so the UI can hide
 * controls that would just fail server-side:
 *   - Owners can manage anyone (including other owners).
 *   - Admins can only manage plain Members.
 *   - Members can't manage anyone (including themselves — see FirmTeamMembers
 *     for the separate self-service availability/job-title path).
 */
export function canManageMember(callerRole: FirmRole | null, targetRole: FirmRole): boolean {
  if (callerRole === 'owner') return true;
  if (callerRole === 'admin') return targetRole === 'member';
  return false;
}

/** Roles `callerRole` may grant when inviting or changing someone's role. Owners grant any role; admins may only invite/set Member; members grant nothing. */
export function grantableRoles(callerRole: FirmRole | null): FirmRole[] {
  if (callerRole === 'owner') return ['owner', 'admin', 'member'];
  if (callerRole === 'admin') return ['member'];
  return [];
}
