import { describe, expect, it } from 'vitest';
import { duplicateCase } from './duplicateCase';
import type { Case, Task } from '../types';

const source: Case = {
  id: 'c1',
  clientId: 'cl1',
  applicantId: 'cl2',
  title: 'Skilled Independent (Subclass 189) - Mei Lin',
  description: 'Onshore, 485 expires March.',
  templateId: 'tpl-189',
  templateVersion: 3,
  visaSubclass: '189',
  visaSubstream: 'points_tested',
  caseOwner: 'u1',
  stage: 'lodged',
  outcome: undefined,
  onHold: true,
  startDate: '2026-10-01',
  createdAt: '2026-10-01T00:00:00.000Z',
  caseNumber: 'EDM-2026-0007',
  assignmentHistory: [{ id: 'a1', caseId: 'c1', toOwnerId: 'u1', changedAt: '2026-10-01T00:00:00.000Z' }],
};

const task = (id: string, date: string, order: number, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: '', date, status: 'done', isCompleted: true, priorityOrder: order, caseId: 'c1', ...extra,
});

let n = 0;
const opts = { today: '2026-11-14', now: '2026-11-14T09:00:00.000Z', newId: () => `id${++n}` };

describe('duplicateCase', () => {
  it('copies the case as a new Draft for the same client, without its history', () => {
    n = 0;
    const { newCase } = duplicateCase(source, [], opts);
    expect(newCase).toMatchObject({
      id: 'id1',
      clientId: 'cl1',
      applicantId: 'cl2',
      title: 'Skilled Independent (Subclass 189) - Mei Lin (copy)',
      templateId: 'tpl-189',
      templateVersion: 3,
      visaSubclass: '189',
      visaSubstream: 'points_tested',
      caseOwner: 'u1',
      stage: 'draft',
      startDate: '2026-11-14',
      createdAt: '2026-11-14T09:00:00.000Z',
    });
    expect(newCase.caseNumber).toBeUndefined();
    expect(newCase.assignmentHistory).toBeUndefined();
    expect(newCase.onHold).toBeUndefined();
  });

  it('copies tasks as not started, in order, shifted so the plan starts today', () => {
    n = 0;
    const tasks = [
      task('t2', '2026-10-15', 1, { phase: 'consultation', stepKey: 's2', assignedTo: 'u2', dateLocked: true, statusReason: 'x' }),
      task('t1', '2026-10-01', 0),
      task('other', '2026-10-01', 0, { caseId: 'c2' }),
    ];
    const { newCase, newTasks } = duplicateCase(source, tasks, opts);
    expect(newTasks.map(t => t.title)).toEqual(['Task t1', 'Task t2']);
    expect(newTasks.map(t => t.date)).toEqual(['2026-11-14', '2026-11-28']);
    expect(newTasks.every(t => t.caseId === newCase.id && t.status === 'not_started' && !t.isCompleted)).toBe(true);
    expect(newTasks[1]).toMatchObject({ phase: 'consultation', stepKey: 's2', assignedTo: 'u2' });
    expect(newTasks[1].dateLocked).toBeUndefined();
    expect(newTasks[1].statusReason).toBeUndefined();
    expect(new Set(newTasks.map(t => t.id)).size).toBe(2);
  });
});
