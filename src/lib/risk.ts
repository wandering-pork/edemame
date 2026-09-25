import type { Case, Deadline, DocumentChecklistItem, Task, WorkflowStep } from '../types';
import { isTaskClosed, isWaiting } from './taskStatus';
import { daysLeft, urgency } from './deadlines';
import { toLocalISODate } from './dates';

export interface CaseRisk {
  atRisk: boolean;
  reasons: string[];
}

/**
 * Derived, never stored — recomputed at display time from the case's own
 * tasks/deadlines/checklist. At Risk is true when any of these hold:
 *
 * 1. an open deadline on the case is ≤14 days away
 * 2. a gate task is overdue. Once tasks carry a `stepKey` (Step 1 · 1E — a
 *    task generated from a template's timed step), this is restricted to
 *    steps whose `WorkflowStep.isGate` is true; tasks with no `stepKey`
 *    (manual tasks, or plans from a template with no timing data) fall back
 *    to the pre-1E rule — "any overdue task that isn't closed or waiting" —
 *    since there's no gate information to check for them.
 * 3. the case is at `ready_to_lodge` and a checklist item is still `pending`
 *    — `checklist` is optional and should only be fetched by the caller for
 *    cases at that stage (few of them), per the plan's "load per case" note.
 * 4. an s56/s57 deadline on the case has ≤7 days left
 */
export function computeCaseRisk(
  caseItem: Pick<Case, 'id' | 'stage'>,
  tasks: Task[],
  deadlines: Deadline[],
  checklist?: DocumentChecklistItem[],
  today: Date = new Date(),
  /** The case's workflow template steps, if any — used to resolve `isGate` for rule 2. Omitted (or a step not found) falls back to the pre-1E "any overdue task" behaviour for that task. */
  templateSteps?: WorkflowStep[],
): CaseRisk {
  const reasons: string[] = [];
  const todayIso = toLocalISODate(today);

  const caseDeadlines = deadlines.filter(d => d.caseId === caseItem.id && d.status === 'open');
  const caseTasks = tasks.filter(t => t.caseId === caseItem.id);
  const stepByKey = new Map((templateSteps ?? []).map(s => [s.key, s]));

  // Rule 1: open deadline ≤14 days away.
  const soonDeadlines = caseDeadlines.filter(d => urgency(d, today) !== 'none');
  if (soonDeadlines.length > 0) {
    reasons.push(`${soonDeadlines.length} deadline${soonDeadlines.length !== 1 ? 's' : ''} due within 14 days`);
  }

  // Rule 2: an overdue gate task — or, for a task with no resolvable step (no
  // stepKey, or a stepKey not found in the template), any overdue task.
  const overdueTasks = caseTasks.filter(t => {
    if (isTaskClosed(t) || isWaiting(t) || t.date >= todayIso) return false;
    const step = t.stepKey ? stepByKey.get(t.stepKey) : undefined;
    return step ? !!step.isGate : true;
  });
  if (overdueTasks.length > 0) {
    reasons.push(`${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? 's' : ''}`);
  }

  // Rule 3: ready_to_lodge with a pending checklist item.
  if (caseItem.stage === 'ready_to_lodge' && checklist) {
    const pending = checklist.filter(c => c.status === 'pending');
    if (pending.length > 0) {
      reasons.push(`${pending.length} outstanding document${pending.length !== 1 ? 's' : ''} before lodgement`);
    }
  }

  // Rule 4: s56/s57 response deadline ≤7 days left.
  const statutoryUrgent = caseDeadlines.filter(
    d => (d.kind === 's56_response' || d.kind === 's57_response') && daysLeft(d, today) <= 7,
  );
  if (statutoryUrgent.length > 0) {
    reasons.push(`${statutoryUrgent.length} statutory response deadline${statutoryUrgent.length !== 1 ? 's' : ''} due within 7 days`);
  }

  return { atRisk: reasons.length > 0, reasons };
}
