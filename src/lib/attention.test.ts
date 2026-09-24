import { describe, it, expect } from 'vitest';
import type { Task, Case, Client } from '../types';
import { overdueTasksFor, dueTodayTasksFor, waitingTasksFor, buildAttentionItems } from './attention';

const today = new Date('2026-06-15T00:00:00');

function makeTask(overrides: Partial<Task>): Task {
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

describe('overdueTasksFor', () => {
  it('includes only open, non-waiting tasks before today', () => {
    const tasks = [
      makeTask({ id: 'a', date: '2026-06-10', status: 'not_started' }),
      makeTask({ id: 'b', date: '2026-06-14', status: 'done' }),
      makeTask({ id: 'c', date: '2026-06-01', status: 'waiting_client' }),
      makeTask({ id: 'd', date: '2026-06-20', status: 'not_started' }),
    ];
    const result = overdueTasksFor(tasks, today);
    expect(result.map(t => t.id)).toEqual(['a']);
  });

  it('sorts oldest due date first', () => {
    const tasks = [
      makeTask({ id: 'a', date: '2026-06-10' }),
      makeTask({ id: 'b', date: '2026-06-01' }),
      makeTask({ id: 'c', date: '2026-06-12' }),
    ];
    const result = overdueTasksFor(tasks, today);
    expect(result.map(t => t.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('dueTodayTasksFor', () => {
  it('includes only open, non-waiting tasks due today', () => {
    const tasks = [
      makeTask({ id: 'a', date: '2026-06-15', status: 'not_started' }),
      makeTask({ id: 'b', date: '2026-06-15', status: 'waiting_third_party' }),
      makeTask({ id: 'c', date: '2026-06-15', status: 'done' }),
      makeTask({ id: 'd', date: '2026-06-16', status: 'not_started' }),
    ];
    expect(dueTodayTasksFor(tasks, today).map(t => t.id)).toEqual(['a']);
  });
});

describe('waitingTasksFor', () => {
  it('includes only open waiting tasks', () => {
    const tasks = [
      makeTask({ id: 'a', status: 'waiting_client' }),
      makeTask({ id: 'b', status: 'waiting_third_party' }),
      makeTask({ id: 'c', status: 'not_started' }),
      makeTask({ id: 'd', status: 'done' }),
    ];
    expect(waitingTasksFor(tasks).map(t => t.id).sort()).toEqual(['a', 'b']);
  });
});

describe('buildAttentionItems', () => {
  const client: Client = { id: 'cl1', name: 'Jane Doe', dob: '', phone: '', email: '', address: '' };
  const kase: Case = {
    id: 'case1', clientId: 'cl1', title: 'Partner Visa', description: '', templateId: '',
    status: 'open', startDate: '2026-01-01', createdAt: '2026-01-01',
  };
  const getCaseAndClient = (caseId?: string) => (caseId === 'case1' ? { case: kase, client } : {});
  const formatDate = (d: string) => d;

  it('lists overdue items before due-today items', () => {
    const overdue = [makeTask({ id: 'o1', caseId: 'case1' })];
    const dueToday = [makeTask({ id: 'd1', caseId: 'case1' })];
    const items = buildAttentionItems(overdue, dueToday, getCaseAndClient, formatDate);
    expect(items.map(i => i.id)).toEqual(['o1', 'd1']);
  });

  it('marks overdue items red and due-today items amber', () => {
    const items = buildAttentionItems(
      [makeTask({ id: 'o1', caseId: 'case1' })],
      [makeTask({ id: 'd1', caseId: 'case1' })],
      getCaseAndClient,
      formatDate,
    );
    expect(items[0].dot).toBe('#EF4444');
    expect(items[1].dot).toBe('#F59E0B');
  });

  it('falls back to "No linked case" when the task has none', () => {
    const items = buildAttentionItems([makeTask({ id: 'o1' })], [], getCaseAndClient, formatDate);
    expect(items[0].sub).toContain('No linked case');
    expect(items[0].caseId).toBeUndefined();
  });
});
