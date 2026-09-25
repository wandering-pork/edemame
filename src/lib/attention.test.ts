import { describe, it, expect } from 'vitest';
import type { Task, Case, Client, Deadline } from '../types';
import {
  overdueTasksFor,
  dueTodayTasksFor,
  waitingTasksFor,
  buildAttentionItems,
  deadlineAttentionItemsFor,
  mergeAttentionItems,
  scopeTasksForAttention,
  scopeDeadlinesForAttention,
} from './attention';

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
    stage: 'preparing', startDate: '2026-01-01', createdAt: '2026-01-01',
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

describe('deadlineAttentionItemsFor', () => {
  const today = new Date('2026-06-15T00:00:00');
  const client: Client = { id: 'cl1', name: 'Jane Doe', dob: '', phone: '', email: '', address: '' };
  const kase: Case = {
    id: 'case1', clientId: 'cl1', title: 'Partner Visa', description: '', templateId: '',
    stage: 'preparing', startDate: '2026-01-01', createdAt: '2026-01-01',
  };
  const getCaseAndClient = (caseId?: string) => (caseId === 'case1' ? { case: kase, client } : {});
  const getClientById = (clientId?: string) => (clientId === 'cl1' ? client : undefined);

  function makeDeadline(overrides: Partial<Deadline>): Deadline {
    return {
      id: 'd1', kind: 'other', title: 'Deadline', dueDate: '2026-06-15',
      status: 'open', createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('excludes deadlines at urgency none', () => {
    const items = deadlineAttentionItemsFor([makeDeadline({ dueDate: '2026-07-01' })], today, getCaseAndClient, getClientById);
    expect(items).toHaveLength(0);
  });

  it('excludes non-open deadlines', () => {
    const items = deadlineAttentionItemsFor([makeDeadline({ dueDate: '2026-06-16', status: 'met' })], today, getCaseAndClient, getClientById);
    expect(items).toHaveLength(0);
  });

  it('sorts by consequenceWeight first, then by days left', () => {
    const deadlines = [
      makeDeadline({ id: 'passport1', kind: 'passport_expiry', dueDate: '2026-06-16' }),
      makeDeadline({ id: 's56-1', kind: 's56_response', dueDate: '2026-06-20' }),
      makeDeadline({ id: 's57-1', kind: 's57_response', dueDate: '2026-06-17' }),
    ];
    const items = deadlineAttentionItemsFor(deadlines, today, getCaseAndClient, getClientById);
    expect(items.map(i => i.id)).toEqual(['deadline:s57-1', 'deadline:s56-1', 'deadline:passport1']);
  });

  it('navigates to the case when the deadline is linked to a case', () => {
    const items = deadlineAttentionItemsFor([makeDeadline({ caseId: 'case1', dueDate: '2026-06-16' })], today, getCaseAndClient, getClientById);
    expect(items[0].caseId).toBe('case1');
    expect(items[0].clientId).toBeUndefined();
    expect(items[0].sub).toContain('Partner Visa');
  });

  it('navigates to the client when the deadline has no case', () => {
    const items = deadlineAttentionItemsFor([makeDeadline({ clientId: 'cl1', dueDate: '2026-06-16' })], today, getCaseAndClient, getClientById);
    expect(items[0].caseId).toBeUndefined();
    expect(items[0].clientId).toBe('cl1');
  });

  it('tags every item kind: deadline', () => {
    const items = deadlineAttentionItemsFor([makeDeadline({ dueDate: '2026-06-16' })], today, getCaseAndClient, getClientById);
    expect(items[0].kind).toBe('deadline');
  });
});

describe('mergeAttentionItems', () => {
  it('places deadline items ahead of task items', () => {
    const deadlineItems = [{ id: 'deadline:1', dot: '#EF4444', title: 'D', sub: '', kind: 'deadline' as const }];
    const taskItems = [{ id: 't1', dot: '#EF4444', title: 'T', sub: '' }];
    const merged = mergeAttentionItems(deadlineItems, taskItems);
    expect(merged.map(i => i.id)).toEqual(['deadline:1', 't1']);
  });
});

describe('scopeTasksForAttention', () => {
  function makeTask(overrides: Partial<Task>): Task {
    return {
      id: 't1', title: 'Task', description: '', date: '2026-06-15',
      status: 'not_started', isCompleted: false, priorityOrder: 0,
      ...overrides,
    };
  }

  const tasks = [
    makeTask({ id: 'mine', assignedTo: 'user-1' }),
    makeTask({ id: 'unassigned' }),
    makeTask({ id: 'theirs', assignedTo: 'user-2' }),
  ];

  it('"mine" keeps tasks assigned to me or unassigned', () => {
    const result = scopeTasksForAttention(tasks, 'mine', 'user-1');
    expect(result.map(t => t.id).sort()).toEqual(['mine', 'unassigned']);
  });

  it('"all" keeps every task', () => {
    expect(scopeTasksForAttention(tasks, 'all', 'user-1')).toHaveLength(3);
  });

  it('falls back to "all" with no currentUserId (local mode)', () => {
    expect(scopeTasksForAttention(tasks, 'mine', undefined)).toHaveLength(3);
  });
});

describe('scopeDeadlinesForAttention', () => {
  function makeDeadline(overrides: Partial<Deadline>): Deadline {
    return {
      id: 'd1', kind: 'other', title: 'Deadline', dueDate: '2026-06-15',
      status: 'open', createdAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  const cases = [
    makeCase({ id: 'owned-by-me', caseOwner: 'user-1' }),
    makeCase({ id: 'owned-by-other', caseOwner: 'user-2' }),
    makeCase({ id: 'unowned' }),
  ];

  const deadlines = [
    makeDeadline({ id: 'on-my-case', caseId: 'owned-by-me' }),
    makeDeadline({ id: 'on-their-case', caseId: 'owned-by-other' }),
    makeDeadline({ id: 'on-unowned-case', caseId: 'unowned' }),
    makeDeadline({ id: 'no-case', clientId: 'client-1' }),
  ];

  it('"mine" keeps deadlines on my cases, unowned cases, and no linked case', () => {
    const result = scopeDeadlinesForAttention(deadlines, cases, 'mine', 'user-1');
    expect(result.map(d => d.id).sort()).toEqual(['no-case', 'on-my-case', 'on-unowned-case']);
  });

  it('"all" keeps every deadline', () => {
    expect(scopeDeadlinesForAttention(deadlines, cases, 'all', 'user-1')).toHaveLength(4);
  });

  it('falls back to "all" with no currentUserId (local mode)', () => {
    expect(scopeDeadlinesForAttention(deadlines, cases, 'mine', undefined)).toHaveLength(4);
  });
});
