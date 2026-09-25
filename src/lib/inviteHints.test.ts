import { describe, it, expect } from 'vitest';
import { inviteHintFor } from './inviteHints';
import type { FirmMemberRow } from '../types';

function makeMember(overrides: Partial<FirmMemberRow> = {}): FirmMemberRow {
  return {
    userId: 'user-1',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    role: 'member',
    status: 'active',
    availability: 'available',
    joinedAt: '2026-01-01T00:00:00.000Z',
    jobTitle: null,
    ...overrides,
  };
}

describe('inviteHintFor', () => {
  it('returns null for an empty or blank email', () => {
    expect(inviteHintFor('', [], [])).toBeNull();
    expect(inviteHintFor('   ', [], [])).toBeNull();
  });

  it('returns null when the email matches nothing', () => {
    expect(inviteHintFor('new@example.com', [makeMember()], [])).toBeNull();
  });

  it('flags an active member, case-insensitively and trimmed', () => {
    const hint = inviteHintFor('  JANE@EXAMPLE.COM  ', [makeMember({ status: 'active' })], []);
    expect(hint).toEqual({ kind: 'already_member', message: 'Already in your firm' });
  });

  it('flags a disabled member and surfaces their userId', () => {
    const hint = inviteHintFor('jane@example.com', [makeMember({ status: 'disabled', userId: 'user-42' })], []);
    expect(hint?.kind).toBe('disabled_member');
    expect(hint?.userId).toBe('user-42');
  });

  it('prefers an active-member match over a disabled one for the same email', () => {
    const members = [
      makeMember({ userId: 'user-1', status: 'disabled' }),
      makeMember({ userId: 'user-2', status: 'active' }),
    ];
    const hint = inviteHintFor('jane@example.com', members, []);
    expect(hint?.kind).toBe('already_member');
  });

  it('flags a pending invite', () => {
    const hint = inviteHintFor('pending@example.com', [], [{ email: 'Pending@Example.com', role: 'member' }]);
    expect(hint).toEqual({
      kind: 'pending_invite',
      message: 'An invite is already pending — sending again replaces the old link.',
    });
  });

  it('ignores members whose status is neither active nor disabled match for a different email', () => {
    expect(inviteHintFor('someone-else@example.com', [makeMember()], [{ email: 'other@example.com', role: 'member' }])).toBeNull();
  });
});
