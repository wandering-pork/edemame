import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import { overdueLabel } from './overdueLabel';

const today = new Date('2026-06-15T00:00:00');

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    date: '2026-06-15',
    status: 'not_started',
    isCompleted: false,
    priorityOrder: 0,
    ...overrides,
  };
}

describe('overdueLabel', () => {
  it('reports how many days overdue a past-due task is', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-05' }), today)).toBe('Overdue by 10 days');
  });

  it('singularizes one day overdue', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-14' }), today)).toBe('Overdue by 1 day');
  });

  it('reports "Due today" for a task due today', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-15' }), today)).toBe('Due today');
  });

  it('reports days until a future due date', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-20' }), today)).toBe('Due in 5 days');
  });

  it('returns null for a closed task', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-01', status: 'done' }), today)).toBeNull();
    expect(overdueLabel(makeTask({ date: '2026-06-01', status: 'not_applicable' }), today)).toBeNull();
  });

  it('returns null for a waiting task even if past due', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-01', status: 'waiting_client' }), today)).toBeNull();
    expect(overdueLabel(makeTask({ date: '2026-06-01', status: 'waiting_third_party' }), today)).toBeNull();
  });

  it('returns null for a datePending (estimated) task', () => {
    expect(overdueLabel(makeTask({ date: '2026-06-01', datePending: true }), today)).toBeNull();
  });
});
