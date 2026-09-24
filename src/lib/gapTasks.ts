import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../types';
import { addDaysISO } from './dates';

const GAP_TASK_TITLE_MAX = 90;
const GAP_TASK_TITLE_PREFIX = 'Address gap: ';
/** Fixed (non-AI) gap tasks are due a week after the case's start date. */
const GAP_TASK_DUE_OFFSET_DAYS = 7;

/** Truncates a gap into a task title, keeping the "Address gap: " prefix intact. */
export function gapTaskTitle(gap: string): string {
  const max = GAP_TASK_TITLE_MAX - GAP_TASK_TITLE_PREFIX.length;
  const trimmed = gap.length > max ? `${gap.slice(0, max - 1).trimEnd()}…` : gap;
  return `${GAP_TASK_TITLE_PREFIX}${trimmed}`;
}

/**
 * Builds one fixed (non-AI) task per eligibility gap, due
 * `GAP_TASK_DUE_OFFSET_DAYS` after the case start date. Used by the Visa
 * Advisor "Open Case" confirmation panel's optional "Add a task for each gap"
 * checkbox (default off — see `OpenCasePanel.tsx` / `OpenCaseParams.gapTasks`
 * in `lib/openCaseFromAdvisor.ts`), which places these
 * ahead of any AI-generated tasks.
 */
export function buildGapTasks(
  gaps: string[],
  caseId: string,
  startDate: string,
  makeId: () => string = uuidv4,
): Task[] {
  const dueDate = addDaysISO(startDate, GAP_TASK_DUE_OFFSET_DAYS);
  return gaps.map((gap, index) => ({
    id: makeId(),
    title: gapTaskTitle(gap),
    description: gap,
    date: dueDate,
    isCompleted: false,
    priorityOrder: index,
    caseId,
    generatedByAi: false,
  }));
}
