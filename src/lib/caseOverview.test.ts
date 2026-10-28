import { describe, it, expect } from 'vitest';
import { currentFocusTask, taskTimeline, checklistBreakdown, suggestQuickActions } from './caseOverview';
import type { DocumentChecklistItem, Task, TaskStatus } from '../types';

function makeTask(id: string, date: string, status: TaskStatus = 'not_started', priorityOrder = 0): Task {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    date,
    status,
    isCompleted: status === 'done' || status === 'not_applicable',
    priorityOrder,
    caseId: 'c1',
  };
}

function makeItem(id: string, status: DocumentChecklistItem['status'], category?: string): DocumentChecklistItem {
  return { id, caseId: 'c1', label: `Item ${id}`, status, category };
}

describe('currentFocusTask', () => {
  it('returns the earliest open task, ignoring closed ones', () => {
    const tasks = [makeTask('a', '2026-10-01', 'done'), makeTask('b', '2026-10-20'), makeTask('c', '2026-10-05', 'waiting_client')];
    expect(currentFocusTask(tasks)?.id).toBe('c');
  });

  it('breaks date ties by priorityOrder', () => {
    const tasks = [makeTask('a', '2026-10-01', 'not_started', 2), makeTask('b', '2026-10-01', 'not_started', 1)];
    expect(currentFocusTask(tasks)?.id).toBe('b');
  });

  it('returns null when everything is closed', () => {
    expect(currentFocusTask([makeTask('a', '2026-10-01', 'done'), makeTask('b', '2026-10-02', 'not_applicable')])).toBeNull();
    expect(currentFocusTask([])).toBeNull();
  });
});

describe('taskTimeline', () => {
  it('windows done / current / upcoming and counts what was hidden', () => {
    const tasks = [
      makeTask('d1', '2026-10-01', 'done'),
      makeTask('d2', '2026-10-02', 'done'),
      makeTask('d3', '2026-10-03', 'done'),
      makeTask('cur', '2026-10-04'),
      makeTask('u1', '2026-10-05'),
      makeTask('u2', '2026-10-06'),
    ];
    const { entries, hiddenCount } = taskTimeline(tasks, { doneBefore: 2, upcomingAfter: 1 });
    expect(entries.map(e => [e.task.id, e.state])).toEqual([
      ['d2', 'done'],
      ['d3', 'done'],
      ['cur', 'current'],
      ['u1', 'upcoming'],
    ]);
    expect(hiddenCount).toBe(2);
  });
});

describe('checklistBreakdown', () => {
  it('counts statuses per category in first-seen order, with a fallback for uncategorised items', () => {
    const rows = checklistBreakdown([
      makeItem('1', 'verified', 'Identity'),
      makeItem('2', 'pending', 'English'),
      makeItem('3', 'linked', 'Identity'),
      makeItem('4', 'waived'),
    ], 'Other');
    expect(rows).toEqual([
      { category: 'Identity', total: 2, pending: 0, linked: 1, verified: 1, waived: 0 },
      { category: 'English', total: 1, pending: 1, linked: 0, verified: 0, waived: 0 },
      { category: 'Other', total: 1, pending: 0, linked: 0, verified: 0, waived: 1 },
    ]);
  });
});

describe('suggestQuickActions', () => {
  const base = { caseTasks: [makeTask('a', '2026-10-01')], checklist: [] as DocumentChecklistItem[], clientName: 'Mei Lin' };

  it('suggests chasing the client when the current task is waiting on them', () => {
    const current = makeTask('w', '2026-10-01', 'waiting_client');
    const actions = suggestQuickActions({ ...base, currentTask: current });
    expect(actions[0]).toMatchObject({ id: 'chase', kind: 'agent' });
    expect((actions[0] as { prompt: string }).prompt).toContain('Mei Lin');
  });

  it('suggests requesting pending docs and verifying linked ones, capped at the limit', () => {
    const checklist = [makeItem('1', 'pending'), makeItem('2', 'pending'), makeItem('3', 'linked')];
    const actions = suggestQuickActions({ ...base, currentTask: base.caseTasks[0], checklist });
    expect(actions.map(a => a.id)).toEqual(['request-docs', 'verify-docs', 'open-current']);
    expect(actions[0].label).toBe('Request 2 missing documents');
    expect(actions[1].label).toBe('Verify 1 document');
  });

  it('suggests a task plan and checklist for an empty case', () => {
    const actions = suggestQuickActions({ caseTasks: [], checklist: [], clientName: 'X', currentTask: null });
    expect(actions.map(a => a.id)).toEqual(['plan', 'gen-checklist', 'summarise']);
  });
});
