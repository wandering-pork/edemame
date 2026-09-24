import { describe, it, expect } from 'vitest';
import type { Client, Deadline } from '../types';
import { daysLeft, urgency, consequenceWeight, passportDeadlineFor, allDeadlines } from './deadlines';

const today = new Date('2026-06-15T00:00:00');

function makeDeadline(overrides: Partial<Deadline>): Deadline {
  return {
    id: 'd1',
    kind: 'other',
    title: 'Deadline',
    dueDate: '2026-06-15',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('daysLeft', () => {
  it('is 0 for a deadline due today', () => {
    expect(daysLeft(makeDeadline({ dueDate: '2026-06-15' }), today)).toBe(0);
  });

  it('is positive for a future deadline', () => {
    expect(daysLeft(makeDeadline({ dueDate: '2026-06-20' }), today)).toBe(5);
  });

  it('is negative for a past deadline', () => {
    expect(daysLeft(makeDeadline({ dueDate: '2026-06-10' }), today)).toBe(-5);
  });
});

describe('urgency', () => {
  it('is none when more than 14 days away', () => {
    expect(urgency(makeDeadline({ dueDate: '2026-06-30' }), today)).toBe('none');
  });

  it('is soon at exactly 14 days', () => {
    expect(urgency(makeDeadline({ dueDate: '2026-06-29' }), today)).toBe('soon');
  });

  it('is urgent at exactly 7 days', () => {
    expect(urgency(makeDeadline({ dueDate: '2026-06-22' }), today)).toBe('urgent');
  });

  it('is critical at exactly 2 days', () => {
    expect(urgency(makeDeadline({ dueDate: '2026-06-17' }), today)).toBe('critical');
  });

  it('is critical when past due', () => {
    expect(urgency(makeDeadline({ dueDate: '2026-06-01' }), today)).toBe('critical');
  });
});

describe('consequenceWeight', () => {
  it('ranks s56/s57 above invitation_window, above nomination_validity, above visa/passport expiry', () => {
    const w = consequenceWeight;
    expect(w('s56_response')).toBeLessThan(w('invitation_window'));
    expect(w('s57_response')).toBeLessThan(w('invitation_window'));
    expect(w('invitation_window')).toBeLessThan(w('nomination_validity'));
    expect(w('nomination_validity')).toBeLessThan(w('visa_expiry'));
    expect(w('visa_expiry')).toBeLessThan(w('passport_expiry'));
    expect(w('passport_expiry')).toBeLessThan(w('other'));
  });

  it('ranks s56 and s57 equally', () => {
    expect(consequenceWeight('s56_response')).toBe(consequenceWeight('s57_response'));
  });
});

describe('passportDeadlineFor', () => {
  it('returns null when the client has no passport expiry', () => {
    expect(passportDeadlineFor({ id: 'c1' })).toBeNull();
  });

  it('builds a stable virtual deadline id from the client id', () => {
    const d = passportDeadlineFor({ id: 'c1', passportExpiry: '2026-08-01' });
    expect(d).toMatchObject({
      id: 'passport:c1',
      kind: 'passport_expiry',
      dueDate: '2026-08-01',
      clientId: 'c1',
      status: 'open',
    });
  });
});

describe('allDeadlines', () => {
  const client: Client = { id: 'c1', name: 'Jane', dob: '', phone: '', email: '', address: '', passportExpiry: '2026-08-01' };

  it('merges stored deadlines with a derived passport-expiry deadline', () => {
    const result = allDeadlines([], [client]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('passport:c1');
  });

  it('omits the virtual deadline when the client has no passport expiry', () => {
    const result = allDeadlines([], [{ id: 'c2' }]);
    expect(result).toHaveLength(0);
  });

  it('does not duplicate when a stored open passport_expiry deadline already exists for the client', () => {
    const stored = [makeDeadline({ id: 'stored1', kind: 'passport_expiry', clientId: 'c1', status: 'open' })];
    const result = allDeadlines(stored, [client]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('stored1');
  });

  it('re-derives the virtual deadline when the stored one is resolved (met/missed/dismissed)', () => {
    const stored = [makeDeadline({ id: 'stored1', kind: 'passport_expiry', clientId: 'c1', status: 'met' })];
    const result = allDeadlines(stored, [client]);
    expect(result.map(d => d.id).sort()).toEqual(['passport:c1', 'stored1']);
  });

  it('keeps unrelated stored deadlines untouched', () => {
    const stored = [makeDeadline({ id: 's56-1', kind: 's56_response', caseId: 'case1' })];
    const result = allDeadlines(stored, []);
    expect(result).toEqual(stored);
  });
});
