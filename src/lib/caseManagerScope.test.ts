import { describe, it, expect } from 'vitest';
import type { Case } from '../types';
import { filterCasesByOwnerScope, defaultCaseOwnerScope } from './caseManagerScope';

function makeCase(overrides: Partial<Case> = {}): Case {
  return {
    id: 'case-1',
    clientId: 'client-1',
    title: 'Test case',
    description: '',
    templateId: 'tpl-1',
    stage: 'preparing',
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('filterCasesByOwnerScope', () => {
  const cases = [
    makeCase({ id: 'mine', caseOwner: 'user-1' }),
    makeCase({ id: 'theirs', caseOwner: 'user-2' }),
    makeCase({ id: 'unowned' }),
  ];

  it('"mine" keeps only cases owned by currentUserId', () => {
    expect(filterCasesByOwnerScope(cases, 'mine', 'user-1').map(c => c.id)).toEqual(['mine']);
  });

  it('"all" keeps every case', () => {
    expect(filterCasesByOwnerScope(cases, 'all', 'user-1')).toHaveLength(3);
  });

  it('falls back to "all" with no currentUserId', () => {
    expect(filterCasesByOwnerScope(cases, 'mine', undefined)).toHaveLength(3);
  });
});

describe('defaultCaseOwnerScope', () => {
  it('defaults to All for owners', () => {
    expect(defaultCaseOwnerScope('owner')).toBe('all');
  });

  it('defaults to All for admins', () => {
    expect(defaultCaseOwnerScope('admin')).toBe('all');
  });

  it('defaults to Mine for members', () => {
    expect(defaultCaseOwnerScope('member')).toBe('mine');
  });

  it('defaults to All when role is unknown (null)', () => {
    expect(defaultCaseOwnerScope(null)).toBe('all');
  });
});
