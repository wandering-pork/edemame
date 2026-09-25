import { describe, it, expect } from 'vitest';
import type { FirmMemberRow } from '../types';
import {
  mapFirmMemberToTeamMember,
  mapFirmDirectoryToTeamMembers,
  canDeleteFirmData,
  canManageMembers,
  canManageAdmins,
  canManageMember,
  grantableRoles,
  firmRoleLabel,
  firmJobTitleLabel,
  deriveTeamMemberRole,
  initialsOfName,
} from './firmDirectory';

function makeRow(overrides: Partial<FirmMemberRow> = {}): FirmMemberRow {
  return {
    userId: 'u1',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    role: 'owner',
    status: 'active',
    availability: 'available',
    joinedAt: '2026-01-01T00:00:00.000Z',
    jobTitle: null,
    ...overrides,
  };
}

describe('deriveTeamMemberRole', () => {
  it('maps owner to partner regardless of job title', () => {
    expect(deriveTeamMemberRole('owner', 'paralegal')).toBe('partner');
    expect(deriveTeamMemberRole('owner', null)).toBe('partner');
  });

  it('maps admin to lawyer regardless of job title', () => {
    expect(deriveTeamMemberRole('admin', 'office_staff')).toBe('lawyer');
  });

  it('maps member by job title', () => {
    expect(deriveTeamMemberRole('member', 'registered_migration_agent')).toBe('lawyer');
    expect(deriveTeamMemberRole('member', 'lawyer')).toBe('lawyer');
    expect(deriveTeamMemberRole('member', 'paralegal')).toBe('assistant');
    expect(deriveTeamMemberRole('member', 'case_officer')).toBe('assistant');
    expect(deriveTeamMemberRole('member', 'office_staff')).toBe('assistant');
    expect(deriveTeamMemberRole('member', 'other')).toBe('assistant');
    expect(deriveTeamMemberRole('member', null)).toBe('assistant');
  });
});

describe('mapFirmMemberToTeamMember', () => {
  it('derives role from access role + job title', () => {
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'owner' })).role).toBe('partner');
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'admin' })).role).toBe('lawyer');
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'member', jobTitle: 'paralegal' })).role).toBe('assistant');
  });

  it('carries availability through as the TeamMember status', () => {
    expect(mapFirmMemberToTeamMember(makeRow({ availability: 'busy' })).status).toBe('busy');
  });

  it('uses userId as the TeamMember id', () => {
    expect(mapFirmMemberToTeamMember(makeRow({ userId: 'abc' })).id).toBe('abc');
  });

  it('falls back to email when fullName is blank', () => {
    const tm = mapFirmMemberToTeamMember(makeRow({ fullName: '  ', email: 'a@b.com' }));
    expect(tm.name).toBe('a@b.com');
  });
});

describe('mapFirmDirectoryToTeamMembers', () => {
  it('drops disabled members', () => {
    const rows = [makeRow({ userId: 'u1', status: 'active' }), makeRow({ userId: 'u2', status: 'disabled' })];
    const result = mapFirmDirectoryToTeamMembers(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
  });
});

describe('canDeleteFirmData', () => {
  it('allows local mode (null role)', () => {
    expect(canDeleteFirmData(null)).toBe(true);
  });
  it('allows owner and admin', () => {
    expect(canDeleteFirmData('owner')).toBe(true);
    expect(canDeleteFirmData('admin')).toBe(true);
  });
  it('blocks member', () => {
    expect(canDeleteFirmData('member')).toBe(false);
  });
});

describe('canManageMembers', () => {
  it('allows owner and admin', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
    expect(canManageMembers(null)).toBe(false);
  });
});

describe('canManageAdmins', () => {
  it('only allows owner', () => {
    expect(canManageAdmins('owner')).toBe(true);
    expect(canManageAdmins('admin')).toBe(false);
    expect(canManageAdmins('member')).toBe(false);
    expect(canManageAdmins(null)).toBe(false);
  });
});

describe('canManageMember', () => {
  it('owner can manage anyone', () => {
    expect(canManageMember('owner', 'owner')).toBe(true);
    expect(canManageMember('owner', 'admin')).toBe(true);
    expect(canManageMember('owner', 'member')).toBe(true);
  });
  it('admin can only manage members', () => {
    expect(canManageMember('admin', 'member')).toBe(true);
    expect(canManageMember('admin', 'admin')).toBe(false);
    expect(canManageMember('admin', 'owner')).toBe(false);
  });
  it('member and null can manage nobody', () => {
    expect(canManageMember('member', 'member')).toBe(false);
    expect(canManageMember(null, 'member')).toBe(false);
  });
});

describe('grantableRoles', () => {
  it('owner can grant any role', () => {
    expect(grantableRoles('owner')).toEqual(['owner', 'admin', 'member']);
  });
  it('admin can only grant member', () => {
    expect(grantableRoles('admin')).toEqual(['member']);
  });
  it('member and null can grant nothing', () => {
    expect(grantableRoles('member')).toEqual([]);
    expect(grantableRoles(null)).toEqual([]);
  });
});

describe('firmRoleLabel', () => {
  it('labels every role', () => {
    expect(firmRoleLabel('owner')).toBe('Owner');
    expect(firmRoleLabel('admin')).toBe('Admin');
    expect(firmRoleLabel('member')).toBe('Member');
  });
});

describe('firmJobTitleLabel', () => {
  it('labels a known job title', () => {
    expect(firmJobTitleLabel('registered_migration_agent')).toBe('Registered migration agent');
    expect(firmJobTitleLabel('case_officer')).toBe('Case officer');
  });
  it('returns null for no job title', () => {
    expect(firmJobTitleLabel(null)).toBeNull();
  });
});

describe('initialsOfName', () => {
  it('takes up to two initials', () => {
    expect(initialsOfName('Jane Doe')).toBe('JD');
    expect(initialsOfName('Cher')).toBe('C');
  });
  it('falls back for empty input', () => {
    expect(initialsOfName('')).toBe('?');
  });
});
