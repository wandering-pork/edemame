import { describe, it, expect } from 'vitest';
import { computeCaseRisk } from './risk';
import type { Case, Deadline, DocumentChecklistItem, Task } from '../types';

const TODAY = new Date('2026-09-24T00:00:00');

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    date: '2026-09-01',
    isCompleted: false,
    status: 'not_started',
    priorityOrder: 1,
    caseId: 'case-1',
    ...overrides,
  };
}

function makeDeadline(overrides: Partial<Deadline> = {}): Deadline {
  return {
    id: 'd1',
    kind: 'other',
    title: 'Deadline',
    dueDate: '2026-10-01',
    caseId: 'case-1',
    status: 'open',
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeCaseRisk', () => {
  it('is not at risk with no tasks/deadlines', () => {
    const risk = computeCaseRisk(makeCase(), [], [], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
    expect(risk.reasons).toEqual([]);
  });

  it('rule 1: flags an open deadline due within 14 days', () => {
    const risk = computeCaseRisk(makeCase(), [], [makeDeadline({ dueDate: '2026-10-02' })], undefined, TODAY);
    expect(risk.atRisk).toBe(true);
    expect(risk.reasons.some(r => r.includes('deadline'))).toBe(true);
  });

  it('rule 1: ignores a deadline more than 14 days out', () => {
    const risk = computeCaseRisk(makeCase(), [], [makeDeadline({ dueDate: '2026-11-01' })], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
  });

  it('rule 1: ignores a resolved deadline', () => {
    const risk = computeCaseRisk(makeCase(), [], [makeDeadline({ dueDate: '2026-09-25', status: 'met' })], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
  });

  it('rule 2: flags an overdue, non-waiting task', () => {
    const risk = computeCaseRisk(makeCase(), [makeTask({ date: '2026-09-01' })], [], undefined, TODAY);
    expect(risk.atRisk).toBe(true);
    expect(risk.reasons.some(r => r.includes('overdue'))).toBe(true);
  });

  it('rule 2: does not flag a waiting overdue task', () => {
    const risk = computeCaseRisk(makeCase(), [makeTask({ date: '2026-09-01', status: 'waiting_client' })], [], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
  });

  it('rule 2: does not flag a closed overdue task', () => {
    const risk = computeCaseRisk(makeCase(), [makeTask({ date: '2026-09-01', status: 'done' })], [], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
  });

  it('rule 3: flags a pending checklist item only at ready_to_lodge', () => {
    const checklist: DocumentChecklistItem[] = [
      { id: 'c1', caseId: 'case-1', label: 'Passport', status: 'pending', category: 'Identity' },
    ];
    const notReady = computeCaseRisk(makeCase({ stage: 'preparing' }), [], [], checklist, TODAY);
    expect(notReady.atRisk).toBe(false);

    const ready = computeCaseRisk(makeCase({ stage: 'ready_to_lodge' }), [], [], checklist, TODAY);
    expect(ready.atRisk).toBe(true);
    expect(ready.reasons.some(r => r.includes('document'))).toBe(true);
  });

  it('rule 3: does not fetch/consider checklist when undefined', () => {
    const risk = computeCaseRisk(makeCase({ stage: 'ready_to_lodge' }), [], [], undefined, TODAY);
    expect(risk.atRisk).toBe(false);
  });

  it('rule 4: flags an s56 deadline due within 7 days even beyond the 14-day rule-1 window (n/a here) and inside it', () => {
    const risk = computeCaseRisk(
      makeCase(),
      [],
      [makeDeadline({ kind: 's56_response', dueDate: '2026-09-30' })],
      undefined,
      TODAY,
    );
    expect(risk.atRisk).toBe(true);
    expect(risk.reasons.some(r => r.includes('statutory'))).toBe(true);
  });

  it('rule 4: does not flag an s57 deadline more than 7 days out', () => {
    const risk = computeCaseRisk(
      makeCase(),
      [],
      [makeDeadline({ kind: 's57_response', dueDate: '2026-10-10' })],
      undefined,
      TODAY,
    );
    expect(risk.reasons.some(r => r.includes('statutory'))).toBe(false);
  });

  it('combines multiple reasons', () => {
    const risk = computeCaseRisk(
      makeCase({ stage: 'ready_to_lodge' }),
      [makeTask({ date: '2026-09-01' })],
      [makeDeadline({ dueDate: '2026-09-30' })],
      [{ id: 'c1', caseId: 'case-1', label: 'Passport', status: 'pending', category: 'Identity' }],
      TODAY,
    );
    expect(risk.atRisk).toBe(true);
    expect(risk.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
