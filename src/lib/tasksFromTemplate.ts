import type { Deadline, DeadlineKind, Task, WorkflowStep, WorkflowTemplate } from '../types';
import { isTaskClosed } from './taskStatus';
import {
  KnownAnchors,
  RescheduleTask,
  ScheduleError,
  ScheduleStep,
  reschedule,
  scheduleFromTemplate,
} from './scheduleFromTemplate';

/**
 * Step 1 · 1E "Generation flow" orchestration: turns a template's timed steps
 * into deterministic `Task` drafts, and recomputes open (non-`dateLocked`)
 * tasks' dates when a new anchor becomes known (a step is marked done, or a
 * deadline is added/updated). Pure — no repository/network access — so
 * `pages/NewCase.tsx`, `pages/CaseDetails.tsx` and `lib/openCaseFromAdvisor.ts`
 * can all call the same tested logic (see 1E's "Generation flow" step 1 and
 * "Rescheduling").
 */

/** True when at least one of the template's steps has `timing` set — the switch between the deterministic scheduler and the old AI-only flow. */
export function templateHasTiming(template?: Pick<WorkflowTemplate, 'steps'> | null): boolean {
  return !!template?.steps?.some(s => !!s.timing);
}

function toScheduleStep(step: WorkflowStep): ScheduleStep {
  return { key: step.key, title: step.title, description: step.description, timing: step.timing, isGate: step.isGate };
}

/** A deterministically-generated task draft, shaped to slot into the existing `Partial<Task>[]`-based review flows (NewCase, openCaseFromAdvisor). */
export type TemplateTaskDraft = Pick<
  Task,
  'title' | 'description' | 'date' | 'stepKey' | 'datePending' | 'status' | 'isCompleted' | 'generatedByAi'
>;

/**
 * Builds one task draft per step, dated by `scheduleFromTemplate`. Steps with
 * no `timing` at all fall back to the scheduler's own case-start-plus-position
 * default (see `scheduleFromTemplate.ts`'s `defaultTiming`) — callers should
 * gate on `templateHasTiming()` first so a template with no timing data at all
 * keeps the old AI-only flow instead of silently getting made-up dates.
 */
export function buildTemplateTaskDrafts(
  steps: WorkflowStep[],
  caseStartDate: string,
  knownAnchors: KnownAnchors = {},
): { drafts: TemplateTaskDraft[]; errors: ScheduleError[] } {
  const scheduleSteps = steps.map(toScheduleStep);
  const { items, errors } = scheduleFromTemplate(scheduleSteps, caseStartDate, knownAnchors);
  const drafts: TemplateTaskDraft[] = items.map(item => ({
    title: item.title,
    description: item.description,
    date: item.date,
    stepKey: item.stepKey,
    datePending: item.datePending,
    status: 'not_started',
    isCompleted: false,
    generatedByAi: false,
  }));
  return { drafts, errors };
}

/**
 * Builds `KnownAnchors.deadlineDates` from a case's own deadlines — the
 * `deadline` anchor case of `scheduleFromTemplate`. When more than one
 * deadline shares a `kind` (shouldn't normally happen), the most recently
 * created one wins.
 */
export function knownAnchorsFromDeadlines(caseDeadlines: Deadline[]): KnownAnchors {
  const deadlineDates: Partial<Record<DeadlineKind, string>> = {};
  const sorted = [...caseDeadlines].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const d of sorted) {
    deadlineDates[d.kind] = d.dueDate;
  }
  return { deadlineDates };
}

/**
 * Recomputes dates for a case's own template-generated tasks (those with a
 * `stepKey`) and returns only the ones whose `date`/`datePending` actually
 * changed, ready to persist. Tasks that are closed or `dateLocked` are never
 * changed (`reschedule()`'s own rule) — a closed step's task additionally
 * feeds back in as a known "step done" anchor for the others. Tasks with no
 * `stepKey` (manually added, or AI suggestions with no anchor) are untouched
 * and not included in the input to `reschedule()`.
 */
export function rescheduleCaseTasks(
  steps: WorkflowStep[],
  caseStartDate: string,
  knownAnchors: KnownAnchors,
  caseTasks: Task[],
): Task[] {
  const stepTasks = caseTasks.filter((t): t is Task & { stepKey: string } => !!t.stepKey);
  if (stepTasks.length === 0) return [];

  const scheduleSteps = steps.map(toScheduleStep);
  const existing: RescheduleTask[] = stepTasks.map(t => ({
    stepKey: t.stepKey,
    date: t.date,
    dateLocked: t.dateLocked,
    isClosed: isTaskClosed(t),
  }));

  const { items } = reschedule(scheduleSteps, caseStartDate, knownAnchors, existing);
  const byStepKey = new Map(items.map(i => [i.stepKey, i]));

  const changed: Task[] = [];
  for (const task of stepTasks) {
    const item = byStepKey.get(task.stepKey);
    if (!item) continue;
    if (item.date !== task.date || item.datePending !== !!task.datePending) {
      changed.push({ ...task, date: item.date, datePending: item.datePending });
    }
  }
  return changed;
}
