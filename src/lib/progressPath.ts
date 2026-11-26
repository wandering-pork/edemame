import { NOT_CONFIRMED_SUBCLASS, type CasePhase, type Task } from '../types';
import { visibleCasePhases } from './casePhases';
import { phaseName, phaseRank, phaseRef, type CasePhaseView } from './phaseGrouping';
import { isTaskClosed, isWaiting, withStatus } from './taskStatus';

/**
 * The Overview's progress path (docs/plans/case-overview-progress-path.md,
 * OV.1/OV.2): every stage of the case's journey in order, so the path shows
 * the whole route even before later stages have tasks, plus the plan for
 * "Mark stage complete".
 */

export type PathStageState = 'done' | 'current' | 'upcoming' | 'empty';

export interface PathStage {
  ref: string;
  name: string;
  state: PathStageState;
  tasks: Task[];
  done: number;
  total: number;
  /** First and last task date in the stage (YYYY-MM-DD), or null with no tasks. */
  startDate: string | null;
  endDate: string | null;
  /** True when any open task in the stage has an estimated (`datePending`) date. */
  estimated: boolean;
  /** True when every task in the stage has an estimated date (so "(estimated)", not "(some estimated)"). */
  allEstimated: boolean;
}

/**
 * "Stage 3 of 5": the position among stages that have tasks, the same count as
 * the header's Stage chip (lib/caseStageSync.ts's phaseStagePositionLabel), so
 * the two never disagree. Null for a stage with no tasks.
 */
export function stagePosition(stages: PathStage[], stage: PathStage): { n: number; of: number } | null {
  const withTasks = stages.filter(s => s.total > 0);
  const i = withTasks.indexOf(stage);
  return i === -1 ? null : { n: i + 1, of: withTasks.length };
}

/**
 * Every visible stage (phase) in the firm's order, with the case's tasks in
 * each. Stages with no tasks are kept, as `empty`, so the path shows the whole
 * journey. A hidden or deleted phase still appears if the case has tasks in
 * it. Not Confirmed cases only ever use Consultation, so they show just the
 * stages that have tasks.
 *
 * Returns null for an older case with no stage information at all; the
 * Overview then shows the lifecycle stages instead.
 */
export function pathStages(
  view: CasePhaseView,
  phases: CasePhase[],
  opts: { visaSubclass?: string; closed?: boolean } = {},
): PathStage[] | null {
  if (!view.hasPhases) return null;

  const groupRefs = view.groups.map(g => g.ref);
  const refs = opts.visaSubclass === NOT_CONFIRMED_SUBCLASS
    ? groupRefs
    : [...new Set([...visibleCasePhases(phases).map(phaseRef), ...groupRefs])]
        .sort((a, b) => phaseRank(phases, a) - phaseRank(phases, b));

  return refs.map(ref => {
    const group = view.groups.find(g => g.ref === ref);
    const tasks = group?.tasks ?? [];
    const dates = tasks.map(t => t.date).filter(Boolean).sort();
    let state: PathStageState = 'empty';
    if (group) state = opts.closed ? 'done' : group.state;
    return {
      ref,
      name: group?.name ?? phaseName(phases, ref),
      state,
      tasks,
      done: group?.doneCount ?? 0,
      total: tasks.length,
      startDate: dates[0] ?? null,
      endDate: dates[dates.length - 1] ?? null,
      estimated: tasks.some(t => !isTaskClosed(t) && !!t.datePending),
      allEstimated: tasks.length > 0 && tasks.every(t => !!t.datePending),
    };
  });
}

export interface StageCompletionPlan {
  /** Open tasks that "Mark stage complete" marks done. */
  toClose: Task[];
  /** Tasks waiting on the client or a third party: left open unless the user opts in. */
  waiting: Task[];
  /** Already done or not applicable: never touched. */
  untouched: Task[];
}

export function stageCompletionPlan(tasks: Task[]): StageCompletionPlan {
  const plan: StageCompletionPlan = { toClose: [], waiting: [], untouched: [] };
  for (const t of tasks) {
    if (isTaskClosed(t)) plan.untouched.push(t);
    else if (isWaiting(t)) plan.waiting.push(t);
    else plan.toClose.push(t);
  }
  return plan;
}

/** The tasks to save when completing a stage, each marked done. */
export function applyStageCompletion(plan: StageCompletionPlan, includeWaiting: boolean): Task[] {
  const targets = includeWaiting ? [...plan.toClose, ...plan.waiting] : plan.toClose;
  return targets.map(t => withStatus(t, 'done'));
}

export function taskCountLabel(n: number): string {
  return `${n} task${n === 1 ? '' : 's'}`;
}
