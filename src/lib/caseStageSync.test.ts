import { describe, it, expect } from 'vitest';
import type { CasePhase, Task } from '../types';
import { ensureSystemCasePhases } from './casePhases';
import { buildCasePhaseView } from './phaseGrouping';
import { builtInPhaseFor, phaseStagePositionLabel, reopenStage, stageForPhase, syncedCaseStage } from './caseStageSync';

const systemPhases = async (): Promise<CasePhase[]> => {
  let rows: CasePhase[] = [];
  return ensureSystemCasePhases({ getAll: async () => rows, createMany: async i => { rows = i; return i; } });
};

let n = 0;
const task = (phase: string, done = false, date = '2026-11-01'): Task => ({
  id: `t${++n}`,
  title: 'Task',
  description: '',
  date,
  status: done ? 'done' : 'not_started',
  isCompleted: done,
  priorityOrder: n,
  caseId: 'c1',
  phase,
} as Task);

describe('stageForPhase', () => {
  it('maps every built-in phase to a stage', async () => {
    const p = await systemPhases();
    expect(stageForPhase('consultation', p)).toBe('assessment');
    expect(stageForPhase('prerequisites', p)).toBe('preparing');
    expect(stageForPhase('preparing', p)).toBe('preparing');
    expect(stageForPhase('ready_to_lodge', p)).toBe('ready_to_lodge');
    expect(stageForPhase('lodged', p)).toBe('lodged');
    expect(stageForPhase('decision', p)).toBe('decision');
    expect(stageForPhase('post_decision', p)).toBe('decision');
  });

  it('treats a firm-added phase as the built-in phase before it', async () => {
    const p = await systemPhases();
    const lodgedPos = p.find(x => x.systemKey === 'lodged')!.position;
    const custom: CasePhase = { id: 'custom-1', name: 'Health checks', position: lodgedPos + 0.5, isSystemDefault: false, required: false, hidden: false };
    expect(builtInPhaseFor('custom-1', [...p, custom])).toBe('lodged');
    expect(stageForPhase('custom-1', [...p, custom])).toBe('lodged');
    expect(stageForPhase('unknown-ref', p)).toBe('assessment');
  });
});

describe('syncedCaseStage', () => {
  it('follows the current task', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('consultation', true), task('lodged')], p);
    expect(syncedCaseStage('preparing', view, p)).toBe('lodged');
    expect(syncedCaseStage('lodged', view, p)).toBeNull();
  });

  it('moves back when an earlier task is reopened', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('prerequisites'), task('lodged')], p);
    expect(syncedCaseStage('lodged', view, p)).toBe('preparing');
  });

  it('leaves early stages alone while in Consultation', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('consultation')], p);
    expect(syncedCaseStage('draft', view, p)).toBeNull();
    expect(syncedCaseStage('engaged', view, p)).toBeNull();
    expect(syncedCaseStage('preparing', view, p)).toBe('assessment');
  });

  it('keeps Information requested while the tasks are in Lodged', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('lodged')], p);
    expect(syncedCaseStage('info_requested', view, p)).toBeNull();
  });

  it('never touches a closed case or one with no phase information', async () => {
    const p = await systemPhases();
    expect(syncedCaseStage('closed', buildCasePhaseView([task('lodged')], p), p)).toBeNull();
    const noPhases = buildCasePhaseView([{ ...task('x'), phase: undefined } as Task], p);
    expect(noPhases.hasPhases).toBe(false);
    expect(syncedCaseStage('preparing', noPhases, p)).toBeNull();
  });
});

describe('reopenStage', () => {
  it('reopens where the tasks are, else Preparing', async () => {
    const p = await systemPhases();
    expect(reopenStage(buildCasePhaseView([task('decision')], p), p)).toBe('decision');
    expect(reopenStage(buildCasePhaseView([], p), p)).toBe('preparing');
  });
});

describe('phaseStagePositionLabel', () => {
  it('counts only the phases the case has tasks in', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('consultation', true), task('prerequisites'), task('lodged')], p);
    expect(phaseStagePositionLabel(view)).toBe('Stage 2 of 3 · Prerequisites');
  });

  it('shows the last stage once every task is done', async () => {
    const p = await systemPhases();
    const view = buildCasePhaseView([task('consultation', true), task('decision', true)], p);
    expect(phaseStagePositionLabel(view)).toBe('Stage 2 of 2 · Decision');
  });
});
