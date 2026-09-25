import { describe, it, expect } from 'vitest';
import { resolveMemberDisplayName, memberDisplayNameOr } from './memberDirectory';
import type { FirmFormerMember, FirmMemberRow } from '../types';

const activeMember: FirmMemberRow = {
  userId: 'u-active', email: 'active@example.com', fullName: 'Jane Smith',
  role: 'member', status: 'active', availability: 'available', joinedAt: '2026-01-01T00:00:00Z', jobTitle: null,
};

const disabledMember: FirmMemberRow = {
  userId: 'u-disabled', email: 'disabled@example.com', fullName: 'Sam Lee',
  role: 'member', status: 'disabled', availability: 'offline', joinedAt: '2026-01-01T00:00:00Z', jobTitle: null,
};

const formerMember: FirmFormerMember = {
  userId: 'u-former', fullName: 'Alex Kim', email: 'alex@example.com', removedAt: '2026-02-01T00:00:00Z',
};

describe('resolveMemberDisplayName', () => {
  it('resolves an active member to their plain name', () => {
    expect(resolveMemberDisplayName('u-active', [activeMember], [])).toEqual({ name: 'Jane Smith', isPast: false });
  });

  it('falls back to email when the active member has no full name', () => {
    const noName: FirmMemberRow = { ...activeMember, fullName: '' };
    expect(resolveMemberDisplayName('u-active', [noName], [])).toEqual({ name: 'active@example.com', isPast: false });
  });

  it('resolves a disabled member with a "(disabled)" suffix', () => {
    expect(resolveMemberDisplayName('u-disabled', [disabledMember], [])).toEqual({ name: 'Sam Lee (disabled)', isPast: true });
  });

  it('resolves a former member with a "(former member)" suffix', () => {
    expect(resolveMemberDisplayName('u-former', [], [formerMember])).toEqual({ name: 'Alex Kim (former member)', isPast: true });
  });

  it('prefers an active row over a stale former-member row for the same id', () => {
    expect(resolveMemberDisplayName('u-active', [activeMember], [{ ...formerMember, userId: 'u-active' }]))
      .toEqual({ name: 'Jane Smith', isPast: false });
  });

  it('returns null for an unknown id', () => {
    expect(resolveMemberDisplayName('u-unknown', [activeMember], [formerMember])).toBeNull();
  });

  it('returns null for an undefined/null/empty id', () => {
    expect(resolveMemberDisplayName(undefined, [activeMember], [])).toBeNull();
    expect(resolveMemberDisplayName(null, [activeMember], [])).toBeNull();
    expect(resolveMemberDisplayName('', [activeMember], [])).toBeNull();
  });
});

describe('memberDisplayNameOr', () => {
  it('returns the resolved name when found', () => {
    expect(memberDisplayNameOr('u-active', [activeMember], [], 'Unassigned')).toBe('Jane Smith');
  });

  it('returns the fallback when not found', () => {
    expect(memberDisplayNameOr('u-unknown', [activeMember], [], 'Unassigned')).toBe('Unassigned');
  });
});
