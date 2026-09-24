import { describe, it, expect } from 'vitest';
import {
  buildTemplateTaskDrafts,
  knownAnchorsFromDeadlines,
  rescheduleCaseTasks,
  templateHasTiming,
} from './tasksFromTemplate';
import type { Deadline, Task, WorkflowStep } from '../types';
import { addDaysISO } from './dates';

const START = '2026-01-01';

function step(partial: Partial<WorkflowStep> & { key: string; title: string }): WorkflowStep {
  return { description: '', ...partial };
}

function task(partial: Partial<Task> & { id: string; stepKey?: string; date: string }): Task {
  return {
    title: 'Task',
    description: '',
    status: 'not_started',
    isCompleted: false,
    priorityOrder: 0,
    ...partial,
  };
}

describe('templateHasTiming', () => {
  it('is false with no steps, or steps with no timing', () => {
    expect(templateHasTiming(undefined)).toBe(false);
    expect(templateHasTiming({ steps: [] })).toBe(false);
    expect(templateHasTiming({ steps: [step({ key: 'a', title: 'A' })] })).toBe(false);
  });

  it('is true when at least one step has timing', () => {
    expect(templateHasTiming({
      steps: [
        step({ key: 'a', title: 'A' }),
        step({ key: 'b', title: 'B', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } }),
      ],
    })).toBe(true);
  });
});

describe('buildTemplateTaskDrafts', () => {
  it('builds one not_started draft per step, carrying stepKey and datePending', () => {
    const steps: WorkflowStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 2, fixed: false } }),
      step({ key: 'b', title: 'B', description: 'desc b', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'done' }, offsetDays: 1, fixed: false } }),
    ];
    const { drafts, errors } = buildTemplateTaskDrafts(steps, START);
    expect(errors).toEqual([]);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      title: 'A', stepKey: 'a', date: addDaysISO(START, 2), status: 'not_started', isCompleted: false, generatedByAi: false,
    });
    expect(drafts[1]).toMatchObject({ title: 'B', description: 'desc b', stepKey: 'b', datePending: true });
  });
});

describe('knownAnchorsFromDeadlines', () => {
  it('maps each deadline kind to its dueDate', () => {
    const deadlines: Deadline[] = [
      { id: 'd1', kind: 'invitation_window', title: 'Invitation', dueDate: '2026-02-01', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    expect(knownAnchorsFromDeadlines(deadlines)).toEqual({ deadlineDates: { invitation_window: '2026-02-01' } });
  });

  it('the most recently created deadline wins when kinds collide', () => {
    const deadlines: Deadline[] = [
      { id: 'd1', kind: 'invitation_window', title: 'Old', dueDate: '2026-02-01', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'd2', kind: 'invitation_window', title: 'New', dueDate: '2026-03-01', status: 'open', createdAt: '2026-01-05T00:00:00.000Z' },
    ];
    expect(knownAnchorsFromDeadlines(deadlines).deadlineDates?.invitation_window).toBe('2026-03-01');
  });
});

describe('rescheduleCaseTasks', () => {
  const steps: WorkflowStep[] = [
    step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 2, fixed: false, durationDays: { min: 5, max: 10 } } }),
    step({
      key: 'b',
      title: 'B',
      timing: { anchor: { type: 'step', stepKey: 'a', edge: 'done' }, offsetDays: 3, fixed: false },
    }),
  ];

  it('returns nothing when there are no step-linked tasks', () => {
    const tasks: Task[] = [task({ id: 't1', date: START })];
    expect(rescheduleCaseTasks(steps, START, {}, tasks)).toEqual([]);
  });

  it('recomputes an open step task whose provisional anchor becomes known', () => {
    const provisionalBDate = addDaysISO(addDaysISO(addDaysISO(START, 2), 10), 3); // step a's date + max duration + b's own offset
    const tasks: Task[] = [
      task({ id: 't-a', stepKey: 'a', date: addDaysISO(START, 2), status: 'not_started' }),
      task({ id: 't-b', stepKey: 'b', date: provisionalBDate, datePending: true }),
    ];
    // Step 'a' is marked done on a real date earlier than its provisional chain estimate.
    const doneTasks = tasks.map(t => t.id === 't-a' ? { ...t, status: 'done' as const, isCompleted: true, date: addDaysISO(START, 1) } : t);

    const changed = rescheduleCaseTasks(steps, START, {}, doneTasks);
    expect(changed).toHaveLength(1);
    expect(changed[0].id).toBe('t-b');
    expect(changed[0].date).toBe(addDaysISO(addDaysISO(START, 1), 3));
    expect(changed[0].datePending).toBe(false);
  });

  it('never changes a dateLocked task even when its anchor moves', () => {
    const tasks: Task[] = [
      task({ id: 't-a', stepKey: 'a', date: addDaysISO(START, 1), status: 'done', isCompleted: true }),
      task({ id: 't-b', stepKey: 'b', date: '2099-01-01', dateLocked: true, datePending: false }),
    ];
    expect(rescheduleCaseTasks(steps, START, {}, tasks)).toEqual([]);
  });

  it('ignores tasks with no stepKey', () => {
    const tasks: Task[] = [
      task({ id: 't-a', stepKey: 'a', date: addDaysISO(START, 2) }),
      task({ id: 't-manual', date: '2026-06-01' }),
    ];
    const changed = rescheduleCaseTasks(steps, START, {}, tasks);
    expect(changed.every(t => t.id !== 't-manual')).toBe(true);
  });
});
