import { v4 as uuidv4 } from 'uuid';
import type { Task } from '../types';
import { addDaysISO } from './dates';

const GAP_TASK_TITLE_PREFIX = 'Address gap: ';
/** Target overall title length (prefix + clause) — keeps the title scannable in a task list. */
const GAP_TASK_TITLE_MAX = 60;
/** Max length of the short clause itself, derived from the overall target minus the prefix. */
const GAP_TASK_CLAUSE_MAX = GAP_TASK_TITLE_MAX - GAP_TASK_TITLE_PREFIX.length;
/** Fixed (non-AI) gap tasks are due a week after the case's start date. */
const GAP_TASK_DUE_OFFSET_DAYS = 7;

/**
 * Picks the first clause of a gap (up to the first sentence/clause-ending
 * punctuation — '.', ';', ':' or an opening '(') as a short, scannable
 * summary. Gemini's gap text is often one long sentence followed by a
 * parenthetical detail (e.g. a points breakdown) — stopping before that
 * detail keeps the title readable without ever cutting a number in half.
 * If the clause itself is still too long, it's trimmed to the last whole
 * word within the budget rather than a hard character cut.
 */
function shortGapClause(gap: string): string {
  const trimmedGap = gap.trim();
  const clauseMatch = trimmedGap.match(/^[^.;:(]+/);
  let clause = (clauseMatch ? clauseMatch[0] : trimmedGap).trim();
  if (clause.length === 0) clause = trimmedGap;

  if (clause.length <= GAP_TASK_CLAUSE_MAX) return clause;

  const cut = clause.slice(0, GAP_TASK_CLAUSE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const wholeWords = (lastSpace > 15 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${wholeWords}…`;
}

/** Turns a gap into a short task title, keeping the "Address gap: " prefix intact. */
export function gapTaskTitle(gap: string): string {
  return `${GAP_TASK_TITLE_PREFIX}${shortGapClause(gap)}`;
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
    status: 'not_started',
    isCompleted: false,
    priorityOrder: index,
    caseId,
    generatedByAi: false,
  }));
}
