import { v4 as uuidv4 } from 'uuid';
import { NOT_CONFIRMED_SUBCLASS, type Case, type Task, type WorkflowTemplate } from '../types';
import { isConfirmedSubclass } from './visaTypes';
import { isTaskClosed, withStatus } from './taskStatus';
import { buildTemplateTaskDrafts } from './tasksFromTemplate';

/**
 * Changing a case's visa subclass (Work Plans spec, step 4). When the
 * subclass changes to a real one — from blank / Not Confirmed, or from a
 * different real subclass — the agent picks a Work Plan for the new visa and
 * says what happens to the current tasks. Changing back to blank or Not
 * Confirmed just saves. Pure; `App.tsx`'s `handleChangeCasePlan` persists it.
 */

export type ExistingTasksChoice = 'none' | 'delete' | 'done';

export const EXISTING_TASKS_CHOICES: { value: ExistingTasksChoice; label: string; hint: string }[] = [
  { value: 'none', label: 'Do nothing', hint: 'Keep the current tasks as they are.' },
  { value: 'delete', label: 'Delete', hint: 'Remove all of this case’s current tasks.' },
  { value: 'done', label: 'Mark all as complete', hint: 'Close every open task as done.' },
];

/** True when saving this subclass change should open the Work Plan window. */
export function needsPlanPrompt(oldSubclass: string | undefined, newSubclass: string | undefined): boolean {
  return isConfirmedSubclass(newSubclass) && newSubclass !== (oldSubclass || undefined);
}

/**
 * Plans to offer, matching plans first (same subclass; same substream ahead
 * of other substreams), then every other plan. Not Confirmed plans are left
 * out — they're for consultation only, not a confirmed visa.
 */
export function orderPlansForSubclass(
  templates: WorkflowTemplate[],
  subclass: string,
  substream?: string,
): { matching: WorkflowTemplate[]; others: WorkflowTemplate[] } {
  const usable = templates.filter(t => t.visaSubclass !== NOT_CONFIRMED_SUBCLASS);
  const matching = usable
    .filter(t => t.visaSubclass === subclass)
    .sort((a, b) => {
      const rank = (t: WorkflowTemplate) => (substream && t.visaSubstream === substream ? 0 : !t.visaSubstream ? 1 : 2);
      return rank(a) - rank(b) || a.title.localeCompare(b.title);
    });
  const others = usable.filter(t => t.visaSubclass !== subclass).sort((a, b) => a.title.localeCompare(b.title));
  return { matching, others };
}

export interface PlanChangeResult {
  updatedCase: Case;
  /** Ids of the case's tasks to delete (choice "delete"). */
  deleteIds: string[];
  /** Open tasks to save as done (choice "done"). */
  closedTasks: Task[];
  /** Tasks generated from the chosen plan. */
  newTasks: Task[];
}

/**
 * Builds everything a confirmed plan change writes: the case with its new
 * subclass/substream and plan, what happens to its current tasks, and one new
 * task per plan step (dated from `startDate`, normally today — the plan
 * starts now, not when the case was opened). A plan with no steps adds no
 * tasks; the case page's AI generation can be used afterwards.
 */
export function buildPlanChange(params: {
  caseItem: Case;
  caseTasks: Task[];
  plan: WorkflowTemplate;
  subclass: string;
  substream?: string;
  existing: ExistingTasksChoice;
  startDate: string;
  makeId?: () => string;
}): PlanChangeResult {
  const { caseItem, caseTasks, plan, subclass, substream, existing, startDate, makeId = uuidv4 } = params;
  const deleteIds = existing === 'delete' ? caseTasks.map(t => t.id) : [];
  const closedTasks = existing === 'done' ? caseTasks.filter(t => !isTaskClosed(t)).map(t => withStatus(t, 'done')) : [];

  const steps = plan.steps ?? [];
  const { drafts } = steps.length ? buildTemplateTaskDrafts(steps, startDate, {}, subclass) : { drafts: [] };
  const newTasks: Task[] = drafts.map((d, i) => ({
    id: makeId(),
    caseId: caseItem.id,
    priorityOrder: i,
    assignedTo: caseItem.caseOwner,
    ...d,
  }));

  const updatedCase: Case = {
    ...caseItem,
    visaSubclass: subclass,
    visaSubstream: substream || undefined,
    templateId: plan.id,
    templateVersion: steps.length ? plan.version : caseItem.templateVersion,
  };
  return { updatedCase, deleteIds, closedTasks, newTasks };
}
