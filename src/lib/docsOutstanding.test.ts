import { describe, it, expect } from 'vitest';
import { countOutstandingChecklistItems, totalOutstandingDocs } from './docsOutstanding';
import type { DocumentChecklistItem } from '../types';

function item(caseId: string, status: DocumentChecklistItem['status'], id = `${caseId}-${status}-${Math.random()}`): DocumentChecklistItem {
  return { id, caseId, label: 'Some document', status };
}

describe('countOutstandingChecklistItems', () => {
  it('returns 0 for an empty checklist', () => {
    expect(countOutstandingChecklistItems([])).toBe(0);
  });

  it('counts pending items as outstanding', () => {
    const items = [item('c1', 'pending'), item('c1', 'pending')];
    expect(countOutstandingChecklistItems(items)).toBe(2);
  });

  it('does not count linked or verified items as outstanding', () => {
    const items = [item('c1', 'linked'), item('c1', 'verified')];
    expect(countOutstandingChecklistItems(items)).toBe(0);
  });

  it('counts waived items as outstanding, matching CaseDetails\' sidebar definition', () => {
    const items = [item('c1', 'waived')];
    expect(countOutstandingChecklistItems(items)).toBe(1);
  });

  it('mixes statuses correctly', () => {
    const items = [item('c1', 'pending'), item('c1', 'linked'), item('c1', 'verified'), item('c1', 'waived')];
    expect(countOutstandingChecklistItems(items)).toBe(2);
  });
});

describe('totalOutstandingDocs', () => {
  it('sums outstanding items only for the given case ids', () => {
    const items = [
      item('c1', 'pending'),
      item('c1', 'linked'),
      item('c2', 'pending'),
      item('c3', 'pending'), // closed case — excluded via caseIds
    ];
    expect(totalOutstandingDocs(items, new Set(['c1', 'c2']))).toBe(2);
  });

  it('returns 0 when no case ids match', () => {
    const items = [item('c1', 'pending')];
    expect(totalOutstandingDocs(items, new Set(['c2']))).toBe(0);
  });

  it('returns 0 for an empty items list', () => {
    expect(totalOutstandingDocs([], new Set(['c1']))).toBe(0);
  });
});
