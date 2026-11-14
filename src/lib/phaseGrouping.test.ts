import { describe, it, expect } from 'vitest';
import { NOT_CONFIRMED_SUBCLASS, type CasePhase, type Task, type WorkflowStep } from '../types';
import { ensureSystemCasePhases } from './casePhases';
import {
  buildCasePhaseView,
  orderStepsByPhase,
  phaseChoicesForCase,
  resolveStepPhases,
  resolveTaskPhases,
  stepsOutOfPhaseOrder,
} from './phaseGrouping';

const phases = async (): Promise<CasePhase[]> => {
  let rows: CasePhase[] = [];
  return ensureSystemCasePhases({ getAll: async () => rows, createMany: async i => { rows = i; return i; } });
};

let n = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`,
  title: 'Task',
  description: '',
  date: '2026-11-01',
  status: 'not_started',
  isCompleted: false,
  priorityOrder: n,
  caseId: 'c1',
  ...over,
} as Task);

const step = (key: string, phase?: string, over: Partial<WorkflowStep> = {}): WorkflowStep => ({ key, title: key, description: '', phase, ...over });

describe('resolveStepPhases', () => {
  it('inherits by position, defaulting to Consultation', () => {
    expect(resolveStepPhases([step('a'), step('b', 'prerequisites'), step('c'), step('d', 'lodged')])).toEqual([
      'consultation', 'prerequisites', 'prerequisites', 'lodged',
    ]);
  });

  it('puts everything in Consultation for a Not Confirmed plan', () => {
    expect(resolveStepPhases([step('a', 'lodged'), step('b', 'decision')], NOT_CONFIRMED_SUBCLASS)).toEqual([
      'consultation', 'consultation',
    ]);
  });
});

describe('orderStepsByPhase', () => {
  it('groups steps by phase order, keeping order within a phase', async () => {
    const p = await phases();
    const out = orderStepsByPhase([step('a', 'lodged'), step('b', 'consultation'), step('c', 'lodged'), step('d', 'prerequisites')], p);
    expect(out.map(s => s.key)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('rewrites previous_step anchors so a moved step still counts from the same step', async () => {
    const p = await phases();
    const steps = [
      step('a', 'lodged'),
      step('b', 'consultation', { timing: { anchor: { type: 'previous_step' }, offsetDays: 2, fixed: false } }),
    ];
    const out = orderStepsByPhase(steps, p);
    expect(out.map(s => s.key)).toEqual(['b', 'a']);
    expect(out[0].timing?.anchor).toEqual({ type: 'step', stepKey: 'a', edge: 'done' });
  });

  it('reports whether ordering would move anything', async () => {
    const p = await phases();
    expect(stepsOutOfPhaseOrder([step('a', 'consultation'), step('b', 'lodged')], p)).toBe(false);
    expect(stepsOutOfPhaseOrder([step('a', 'lodged'), step('b', 'consultation')], p)).toBe(true);
  });
});

describe('buildCasePhaseView — phase of the current task', () => {
  it('finds the first open task in phase order and marks phase states', async () => {
    const p = await phases();
    const tasks = [
      task({ title: 'Consult', phase: 'consultation', status: 'done', date: '2026-01-01' }),
      task({ title: 'Skills', phase: 'prerequisites', status: 'done', date: '2026-01-05' }),
      task({ title: 'Police', phase: 'prerequisites', date: '2026-01-10' }),
      task({ title: 'Lodge', phase: 'lodged', date: '2025-12-01' }), // earlier date but later phase
    ];
    const view = buildCasePhaseView(tasks, p);
    expect(view.hasPhases).toBe(true);
    expect(view.currentTask?.title).toBe('Police');
    expect(view.currentPhaseName).toBe('Prerequisites');
    expect(view.groups.map(g => [g.name, g.state])).toEqual([
      ['Consultation', 'done'],
      ['Prerequisites', 'current'],
      ['Lodged', 'upcoming'],
    ]);
  });

  it('hides empty phases and uses the last phase once everything is done', async () => {
    const p = await phases();
    const view = buildCasePhaseView(
      [task({ phase: 'consultation', status: 'done' }), task({ phase: 'decision', status: 'done' })],
      p,
    );
    expect(view.groups.map(g => g.name)).toEqual(['Consultation', 'Decision']);
    expect(view.currentTask).toBeNull();
    expect(view.currentPhaseName).toBe('Decision');
  });

  it('is Consultation with no tasks, and flags a case with no phase info', async () => {
    const p = await phases();
    expect(buildCasePhaseView([], p).currentPhaseName).toBe('Consultation');
    expect(buildCasePhaseView([task({})], p).hasPhases).toBe(false);
  });

  it('falls back to the plan step phase, then the previous task', async () => {
    const steps = [step('s1', 'prerequisites')];
    const a = task({ stepKey: 's1', date: '2026-01-01' });
    const b = task({ date: '2026-01-02' });
    const refs = resolveTaskPhases([a, b], steps);
    expect(refs.get(a.id)).toBe('prerequisites');
    expect(refs.get(b.id)).toBe('prerequisites');
  });

  it('counts closed not-applicable tasks as done', async () => {
    const p = await phases();
    const view = buildCasePhaseView(
      [task({ phase: 'consultation', status: 'not_applicable', statusReason: 'n/a' } as Partial<Task>), task({ phase: 'lodged' })],
      p,
    );
    expect(view.groups[0].state).toBe('done');
    expect(view.currentPhaseName).toBe('Lodged');
  });
});

describe('phaseChoicesForCase', () => {
  it('offers the phases the case uses, defaulting to the current phase', async () => {
    const p = await phases();
    const tasks = [task({ phase: 'consultation', status: 'done' }), task({ phase: 'lodged' })];
    const c = phaseChoicesForCase(tasks, p);
    expect(c.options.map(o => o.name)).toEqual(['Consultation', 'Lodged']);
    expect(c.defaultRef).toBe('lodged');
    expect(c.locked).toBe(false);
  });

  it('offers every visible phase when the case has none, and only Consultation when Not Confirmed', async () => {
    const p = await phases();
    expect(phaseChoicesForCase([], p).options).toHaveLength(7);
    const nc = phaseChoicesForCase([task({ phase: 'lodged' })], p, [], NOT_CONFIRMED_SUBCLASS);
    expect(nc.options.map(o => o.ref)).toEqual(['consultation']);
    expect(nc.locked).toBe(true);
  });
});
