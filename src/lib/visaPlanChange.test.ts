import { describe, it, expect } from 'vitest';
import { NOT_CONFIRMED_SUBCLASS, type Case, type Task, type WorkflowTemplate } from '../types';
import { buildPlanChange, needsPlanPrompt, orderPlansForSubclass } from './visaPlanChange';
import { seedDefaultTemplates } from './seedData';

const caseItem = { id: 'c1', clientId: 'cl1', title: 'Case', description: '', templateId: 'old', stage: 'draft', startDate: '2026-01-01', createdAt: '2026-01-01', caseOwner: 'u1', visaSubclass: NOT_CONFIRMED_SUBCLASS } as Case;
const task = (id: string, status: Task['status']): Task =>
  ({ id, caseId: 'c1', title: id, description: '', date: '2026-01-02', status, isCompleted: status === 'done', priorityOrder: 0 } as Task);

describe('needsPlanPrompt — subclass-change options', () => {
  it('prompts going from blank or Not Confirmed to a real subclass', () => {
    expect(needsPlanPrompt(undefined, '189')).toBe(true);
    expect(needsPlanPrompt('', '189')).toBe(true);
    expect(needsPlanPrompt(NOT_CONFIRMED_SUBCLASS, '189')).toBe(true);
  });

  it('also prompts from one real subclass to another', () => {
    expect(needsPlanPrompt('189', '190')).toBe(true);
  });

  it('does not prompt when unchanged, or when going back to blank / Not Confirmed', () => {
    expect(needsPlanPrompt('189', '189')).toBe(false);
    expect(needsPlanPrompt('189', NOT_CONFIRMED_SUBCLASS)).toBe(false);
    expect(needsPlanPrompt('189', '')).toBe(false);
    expect(needsPlanPrompt(undefined, undefined)).toBe(false);
  });
});

describe('orderPlansForSubclass', () => {
  const plans = [
    { id: 'a', title: 'B 189 general', visaSubclass: '189' },
    { id: 'b', title: 'A 189 NZ', visaSubclass: '189', visaSubstream: 'New Zealand' },
    { id: 'c', title: 'Consult only', visaSubclass: NOT_CONFIRMED_SUBCLASS },
    { id: 'd', title: 'Student', visaSubclass: '500' },
  ] as WorkflowTemplate[];

  it('lists matching plans first, the chosen substream at the top, and drops Not Confirmed plans', () => {
    const { matching, others } = orderPlansForSubclass(plans, '189', 'New Zealand');
    expect(matching.map(p => p.id)).toEqual(['b', 'a']);
    expect(others.map(p => p.id)).toEqual(['d']);
  });
});

describe('buildPlanChange', () => {
  const plan = seedDefaultTemplates().find(t => t.id === 'tpl-189')!;
  const tasks = [task('t1', 'done'), task('t2', 'not_started'), task('t3', 'waiting_client')];
  let n = 0;
  const makeId = () => `new-${++n}`;

  it('"Do nothing" keeps tasks and adds one task per plan step with phases', () => {
    const r = buildPlanChange({ caseItem, caseTasks: tasks, plan, subclass: '189', substream: 'Points-tested', existing: 'none', startDate: '2026-11-14', makeId });
    expect(r.deleteIds).toEqual([]);
    expect(r.closedTasks).toEqual([]);
    expect(r.newTasks).toHaveLength(plan.steps!.length);
    expect(r.newTasks.every(t => t.caseId === 'c1' && t.assignedTo === 'u1' && !!t.phase)).toBe(true);
    expect(r.updatedCase).toMatchObject({ visaSubclass: '189', visaSubstream: 'Points-tested', templateId: 'tpl-189' });
  });

  it('"Delete" removes every current task', () => {
    const r = buildPlanChange({ caseItem, caseTasks: tasks, plan, subclass: '189', existing: 'delete', startDate: '2026-11-14', makeId });
    expect(r.deleteIds).toEqual(['t1', 't2', 't3']);
    expect(r.updatedCase.visaSubstream).toBeUndefined();
  });

  it('"Mark all as complete" closes only the open tasks', () => {
    const r = buildPlanChange({ caseItem, caseTasks: tasks, plan, subclass: '189', existing: 'done', startDate: '2026-11-14', makeId });
    expect(r.closedTasks.map(t => t.id)).toEqual(['t2', 't3']);
    expect(r.closedTasks.every(t => t.status === 'done' && t.isCompleted)).toBe(true);
  });

  it('adds no tasks for a plan with no steps', () => {
    const r = buildPlanChange({ caseItem, caseTasks: [], plan: { id: 'x', title: 'x', description: '' }, subclass: '189', existing: 'none', startDate: '2026-11-14' });
    expect(r.newTasks).toEqual([]);
    expect(r.updatedCase.templateId).toBe('x');
  });
});
