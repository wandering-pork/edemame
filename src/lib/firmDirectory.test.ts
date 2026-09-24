import { describe, it, expect } from 'vitest';
import type { FirmMemberRow } from '../types';
import {
  mapFirmMemberToTeamMember,
  mapFirmDirectoryToTeamMembers,
  canDeleteFirmData,
  canManageMembers,
  firmRoleLabel,
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
    ...overrides,
  };
}

describe('mapFirmMemberToTeamMember', () => {
  it('maps owner/agent/paralegal to partner/lawyer/assistant', () => {
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'owner' })).role).toBe('partner');
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'agent' })).role).toBe('lawyer');
    expect(mapFirmMemberToTeamMember(makeRow({ role: 'paralegal' })).role).toBe('assistant');
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
  it('allows owner and agent', () => {
    expect(canDeleteFirmData('owner')).toBe(true);
    expect(canDeleteFirmData('agent')).toBe(true);
  });
  it('blocks paralegal', () => {
    expect(canDeleteFirmData('paralegal')).toBe(false);
  });
});

describe('canManageMembers', () => {
  it('only allows owner', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('agent')).toBe(false);
    expect(canManageMembers('paralegal')).toBe(false);
    expect(canManageMembers(null)).toBe(false);
  });
});

describe('firmRoleLabel', () => {
  it('labels every role', () => {
    expect(firmRoleLabel('owner')).toBe('Owner');
    expect(firmRoleLabel('agent')).toBe('Agent');
    expect(firmRoleLabel('paralegal')).toBe('Paralegal');
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
