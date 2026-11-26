import { describe, it, expect } from 'vitest';
import { NOT_CONFIRMED_SUBCLASS, type CasePhase, type Task } from '../types';
import { ensureSystemCasePhases } from './casePhases';
import { buildCasePhaseView } from './phaseGrouping';
import { applyStageCompletion, pathStages, stageCompletionPlan, stagePosition } from './progressPath';

const phases = async (): Promise<CasePhase[]> => {
  let rows: CasePhase[] = [];
  return ensureSystemCasePhases({ getAll: async () => rows, createMany: async i => { rows = i; return i; } });
};

let n = 0;
const task = (over: Partial<Task>): Task => ({
  id: `t${++n}`,
  title: `Task ${n}`,
  description: '',
  date: '2026-11-01',
  status: 'not_started',
  isCompleted: false,
  priorityOrder: n,
  caseId: 'c1',
  ...over,
} as Task);

describe('pathStages', () => {
  it('lists every visible stage in order, keeping stages with no tasks as empty', async () => {
    const ps = await phases();
    const tasks = [
      task({ phase: 'consultation', status: 'done', isCompleted: true, date: '2026-10-01' }),
      task({ phase: 'prerequisites', date: '2026-11-02' }),
      task({ phase: 'prerequisites', date: '2026-11-20', datePending: true }),
      task({ phase: 'lodged', date: '2027-01-10' }),
    ];
    const stages = pathStages(buildCasePhaseView(tasks, ps), ps)!;
    expect(stages.map(s => s.ref)).toEqual([
      'consultation', 'prerequisites', 'preparing', 'ready_to_lodge', 'lodged', 'decision', 'post_decision',
    ]);
    expect(stages.map(s => s.state)).toEqual(['done', 'current', 'empty', 'empty', 'upcoming', 'empty', 'empty']);
    const prereq = stages[1];
    expect(prereq).toMatchObject({ done: 0, total: 2, startDate: '2026-11-02', endDate: '2026-11-20', estimated: true });
    expect(stages[2]).toMatchObject({ total: 0, startDate: null, estimated: false });
    expect(prereq.allEstimated).toBe(false);
  });

  it('counts stage position among stages with tasks only, like the header chip', async () => {
    const ps = await phases();
    const tasks = [
      task({ phase: 'consultation', status: 'done', isCompleted: true, date: '2026-10-01' }),
      task({ phase: 'ready_to_lodge', date: '2026-11-02', datePending: true }),
      task({ phase: 'lodged', date: '2027-01-10' }),
    ];
    const stages = pathStages(buildCasePhaseView(tasks, ps), ps)!;
    const current = stages.find(s => s.state === 'current')!;
    expect(current.ref).toBe('ready_to_lodge');
    expect(stagePosition(stages, current)).toEqual({ n: 2, of: 3 });
    expect(current.allEstimated).toBe(true);
    expect(stagePosition(stages, stages.find(s => s.state === 'empty')!)).toBeNull();
  });

  it('leaves out hidden stages unless the case has tasks in them', async () => {
    const ps = (await phases()).map(p => (p.systemKey === 'decision' || p.systemKey === 'post_decision' ? { ...p, hidden: true } : p));
    const tasks = [task({ phase: 'consultation' }), task({ phase: 'post_decision' })];
    const refs = pathStages(buildCasePhaseView(tasks, ps), ps)!.map(s => s.ref);
    expect(refs).not.toContain('decision');
    expect(refs[refs.length - 1]).toBe('post_decision');
  });

  it('shows every stage with tasks as done on a closed case', async () => {
    const ps = await phases();
    const tasks = [task({ phase: 'consultation' }), task({ phase: 'lodged', status: 'done', isCompleted: true })];
    const states = pathStages(buildCasePhaseView(tasks, ps), ps, { closed: true })!
      .filter(s => s.total > 0)
      .map(s => s.state);
    expect(states).toEqual(['done', 'done']);
  });

  it('marks every stage done once all tasks are closed', async () => {
    const ps = await phases();
    const tasks = [task({ phase: 'consultation', status: 'done', isCompleted: true }), task({ phase: 'lodged', status: 'not_applicable', isCompleted: true, statusReason: 'x' })];
    const withTasks = pathStages(buildCasePhaseView(tasks, ps), ps)!.filter(s => s.total > 0);
    expect(withTasks.every(s => s.state === 'done')).toBe(true);
  });

  it('shows only stages with tasks for a Not Confirmed case', async () => {
    const ps = await phases();
    const tasks = [task({}), task({})];
    const view = buildCasePhaseView(tasks, ps, [], NOT_CONFIRMED_SUBCLASS);
    expect(pathStages(view, ps, { visaSubclass: NOT_CONFIRMED_SUBCLASS })!.map(s => s.ref)).toEqual(['consultation']);
  });

  it('returns null for an older case with no stage information', async () => {
    const ps = await phases();
    expect(pathStages(buildCasePhaseView([task({}), task({})], ps), ps)).toBeNull();
  });
});

describe('stageCompletionPlan', () => {
  const open = task({ title: 'Open' });
  const started = task({ title: 'Started', status: 'in_progress' });
  const waitingClient = task({ title: 'Waiting', status: 'waiting_client' });
  const waitingThird = task({ title: 'Waiting 3rd', status: 'waiting_third_party' });
  const done = task({ title: 'Done', status: 'done', isCompleted: true });
  const na = task({ title: 'N/A', status: 'not_applicable', statusReason: 'Not needed', isCompleted: true });

  it('splits tasks into to-close, waiting and untouched', () => {
    const plan = stageCompletionPlan([open, started, waitingClient, waitingThird, done, na]);
    expect(plan.toClose.map(t => t.title)).toEqual(['Open', 'Started']);
    expect(plan.waiting.map(t => t.title)).toEqual(['Waiting', 'Waiting 3rd']);
    expect(plan.untouched.map(t => t.title)).toEqual(['Done', 'N/A']);
  });

  it('marks only the open tasks done unless waiting tasks are included', () => {
    const plan = stageCompletionPlan([open, waitingClient, done]);
    const without = applyStageCompletion(plan, false);
    expect(without.map(t => t.id)).toEqual([open.id]);
    expect(without[0]).toMatchObject({ status: 'done', isCompleted: true });
    expect(applyStageCompletion(plan, true).map(t => t.id)).toEqual([open.id, waitingClient.id]);
  });
});
