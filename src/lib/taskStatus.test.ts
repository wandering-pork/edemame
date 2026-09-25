import { describe, it, expect } from 'vitest';
import type { Task, TaskStatus } from '../types';
import { normalizeTask, isTaskClosed, isWaiting, withStatus, statusChipFor, TASK_STATUS_LABELS } from './taskStatus';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    date: '2026-01-01',
    status: 'not_started',
    isCompleted: false,
    priorityOrder: 0,
    ...overrides,
  };
}

describe('normalizeTask', () => {
  it('leaves a task with a status untouched (besides syncing isCompleted)', () => {
    const t = makeTask({ status: 'in_progress', isCompleted: false });
    expect(normalizeTask(t)).toEqual(t);
  });

  it('derives status "done" from isCompleted: true when status is missing', () => {
    const raw = { ...makeTask(), isCompleted: true } as Task;
    delete (raw as any).status;
    const normalized = normalizeTask(raw);
    expect(normalized.status).toBe('done');
    expect(normalized.isCompleted).toBe(true);
  });

  it('derives status "not_started" from isCompleted: false when status is missing', () => {
    const raw = { ...makeTask(), isCompleted: false } as Task;
    delete (raw as any).status;
    const normalized = normalizeTask(raw);
    expect(normalized.status).toBe('not_started');
    expect(normalized.isCompleted).toBe(false);
  });

  it('corrects a stale isCompleted mirror to match an existing status', () => {
    const t = makeTask({ status: 'done', isCompleted: false });
    const normalized = normalizeTask(t);
    expect(normalized.isCompleted).toBe(true);
  });
});

describe('isTaskClosed', () => {
  it('is true for done and not_applicable', () => {
    expect(isTaskClosed({ status: 'done' })).toBe(true);
    expect(isTaskClosed({ status: 'not_applicable' })).toBe(true);
  });

  it('is false for other statuses', () => {
    expect(isTaskClosed({ status: 'not_started' })).toBe(false);
    expect(isTaskClosed({ status: 'in_progress' })).toBe(false);
    expect(isTaskClosed({ status: 'waiting_client' })).toBe(false);
    expect(isTaskClosed({ status: 'waiting_third_party' })).toBe(false);
  });
});

describe('isWaiting', () => {
  it('is true for waiting_client and waiting_third_party', () => {
    expect(isWaiting({ status: 'waiting_client' })).toBe(true);
    expect(isWaiting({ status: 'waiting_third_party' })).toBe(true);
  });

  it('is false for other statuses', () => {
    expect(isWaiting({ status: 'not_started' })).toBe(false);
    expect(isWaiting({ status: 'done' })).toBe(false);
  });
});

describe('withStatus', () => {
  it('sets the new status and keeps isCompleted in sync', () => {
    const t = makeTask({ status: 'not_started', isCompleted: false });
    const done = withStatus(t, 'done');
    expect(done.status).toBe('done');
    expect(done.isCompleted).toBe(true);
  });

  it('clears isCompleted when moving off a closed status', () => {
    const t = makeTask({ status: 'done', isCompleted: true });
    const reopened = withStatus(t, 'in_progress');
    expect(reopened.status).toBe('in_progress');
    expect(reopened.isCompleted).toBe(false);
  });

  it('sets isCompleted true for not_applicable with a reason', () => {
    const t = makeTask();
    const na = withStatus(t, 'not_applicable', 'Client withdrew this requirement');
    expect(na.status).toBe('not_applicable');
    expect(na.isCompleted).toBe(true);
    expect(na.statusReason).toBe('Client withdrew this requirement');
  });

  it('trims the reason', () => {
    const t = makeTask();
    const na = withStatus(t, 'not_applicable', '  spaced out  ');
    expect(na.statusReason).toBe('spaced out');
  });

  it('throws when marking not_applicable without a reason', () => {
    const t = makeTask();
    expect(() => withStatus(t, 'not_applicable')).toThrow();
    expect(() => withStatus(t, 'not_applicable', '   ')).toThrow();
  });

  it('clears any previous statusReason when moving to a non-N/A status', () => {
    const t = makeTask({ status: 'not_applicable', statusReason: 'old reason', isCompleted: true });
    const reopened = withStatus(t, 'not_started');
    expect(reopened.statusReason).toBeUndefined();
  });

  it('does not mutate the original task', () => {
    const t = makeTask();
    withStatus(t, 'done');
    expect(t.status).toBe('not_started');
    expect(t.isCompleted).toBe(false);
  });
});

describe('statusChipFor', () => {
  it('returns null for not_started — the quiet default with no chip', () => {
    expect(statusChipFor('not_started')).toBeNull();
  });

  it('returns null for done — the tick + strikethrough treatment covers it', () => {
    expect(statusChipFor('done')).toBeNull();
  });

  it('returns a chip with the right label for every other status', () => {
    const chipStatuses: TaskStatus[] = ['in_progress', 'waiting_client', 'waiting_third_party', 'not_applicable'];
    for (const status of chipStatuses) {
      const chip = statusChipFor(status);
      expect(chip).not.toBeNull();
      expect(chip!.label).toBe(TASK_STATUS_LABELS[status]);
      expect(chip!.className).toEqual(expect.any(String));
    }
  });

  it('gives each of the four chip statuses a distinct colour class', () => {
    const chipStatuses: TaskStatus[] = ['in_progress', 'waiting_client', 'waiting_third_party', 'not_applicable'];
    const classNames = chipStatuses.map(s => statusChipFor(s)!.className);
    expect(new Set(classNames).size).toBe(classNames.length);
  });
});
