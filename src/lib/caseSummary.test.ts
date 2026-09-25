import { describe, it, expect } from 'vitest';
import { nextDeadlineFor, stagePositionLabel } from './caseSummary';
import type { Deadline } from '../types';

const TODAY = new Date('2026-09-25T00:00:00');

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: 'd1',
    kind: 'other',
    title: 'Deadline',
    dueDate: '2026-10-01',
    status: 'open',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('nextDeadlineFor', () => {
  it('returns null when there are no deadlines', () => {
    expect(nextDeadlineFor([], TODAY)).toBeNull();
  });

  it('returns null when every deadline is resolved', () => {
    const deadlines = [makeDeadline({ status: 'met' }), makeDeadline({ id: 'd2', status: 'dismissed' })];
    expect(nextDeadlineFor(deadlines, TODAY)).toBeNull();
  });

  it('picks the soonest open deadline, ignoring resolved ones', () => {
    const soon = makeDeadline({ id: 'soon', dueDate: '2026-09-27' });
    const later = makeDeadline({ id: 'later', dueDate: '2026-11-01' });
    const resolvedSoonest = makeDeadline({ id: 'resolved', dueDate: '2026-09-26', status: 'missed' });
    const result = nextDeadlineFor([later, resolvedSoonest, soon], TODAY);
    expect(result?.id).toBe('soon');
  });

  it('treats a past-due open deadline as soonest (negative days left)', () => {
    const overdue = makeDeadline({ id: 'overdue', dueDate: '2026-09-01' });
    const upcoming = makeDeadline({ id: 'upcoming', dueDate: '2026-10-01' });
    const result = nextDeadlineFor([upcoming, overdue], TODAY);
    expect(result?.id).toBe('overdue');
  });
});

describe('stagePositionLabel', () => {
  it('labels an early stage', () => {
    expect(stagePositionLabel('draft')).toBe('Stage 1 of 8 · Draft');
  });

  it('labels a mid-line stage', () => {
    expect(stagePositionLabel('preparing')).toBe('Stage 4 of 8 · Preparing');
  });

  it('shows info_requested at the same position as lodged', () => {
    expect(stagePositionLabel('lodged')).toBe('Stage 6 of 8 · Lodged');
    expect(stagePositionLabel('info_requested')).toBe('Stage 6 of 8 · Info requested');
  });

  it('labels the final stage', () => {
    expect(stagePositionLabel('closed')).toBe('Stage 8 of 8 · Closed');
  });
});
