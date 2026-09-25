import { describe, it, expect } from 'vitest';
import {
  mapPendingInviteRows,
  needsAccountSetup,
  friendlyInviteError,
  type PendingInviteRpcRow,
} from './firmInvites';

describe('mapPendingInviteRows', () => {
  it('maps snake_case RPC rows to camelCase', () => {
    const rows: PendingInviteRpcRow[] = [
      {
        id: 'inv-1',
        firm_id: 'firm-1',
        firm_name: 'Smith Migration',
        role: 'member',
        inviter_name: 'Jane Smith',
        expires_at: '2026-10-01T00:00:00.000Z',
      },
    ];
    expect(mapPendingInviteRows(rows)).toEqual([
      {
        id: 'inv-1',
        firmId: 'firm-1',
        firmName: 'Smith Migration',
        role: 'member',
        inviterName: 'Jane Smith',
        expiresAt: '2026-10-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(mapPendingInviteRows([])).toEqual([]);
  });
});

describe('needsAccountSetup', () => {
  it('is false for null/undefined user', () => {
    expect(needsAccountSetup(null)).toBe(false);
    expect(needsAccountSetup(undefined)).toBe(false);
  });

  it('is false when invited_at is not set (a normal sign-up, not an invite)', () => {
    expect(needsAccountSetup({ invited_at: null, user_metadata: {} })).toBe(false);
  });

  it('is true for a first-time invitee with no password_set flag', () => {
    expect(needsAccountSetup({ invited_at: '2026-09-01T00:00:00.000Z', user_metadata: {} })).toBe(true);
  });

  it('is true when password_set is explicitly false', () => {
    expect(
      needsAccountSetup({ invited_at: '2026-09-01T00:00:00.000Z', user_metadata: { password_set: false } })
    ).toBe(true);
  });

  it('is false once password_set is true', () => {
    expect(
      needsAccountSetup({ invited_at: '2026-09-01T00:00:00.000Z', user_metadata: { password_set: true } })
    ).toBe(false);
  });
});

describe('friendlyInviteError', () => {
  it('extracts message from an Error-like object', () => {
    expect(friendlyInviteError(new Error('This invite has expired.'))).toBe('This invite has expired.');
  });

  it('extracts message from a plain object with a message field', () => {
    expect(friendlyInviteError({ message: 'This invite has been revoked.' })).toBe('This invite has been revoked.');
  });

  it('passes through a plain string error', () => {
    expect(friendlyInviteError('Not signed in')).toBe('Not signed in');
  });

  it('falls back for an empty/unexpected shape', () => {
    expect(friendlyInviteError({})).toBe('Something went wrong. Please try again.');
    expect(friendlyInviteError(null)).toBe('Something went wrong. Please try again.');
    expect(friendlyInviteError(undefined, 'custom fallback')).toBe('custom fallback');
  });
});
