import type { Case, Task } from '../types';
import { addDaysISO } from './dates';

/** Whole calendar days from `fromISO` to `toISO` (both YYYY-MM-DD). */
function dayDiff(fromISO: string, toISO: string): number {
  const [fy, fm, fd] = fromISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toISO.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export interface DuplicateCaseOptions {
  /** Today, YYYY-MM-DD; the copy starts on this date. */
  today: string;
  /** ISO timestamp for `createdAt`. */
  now: string;
  /** Id generator (uuid in the app; deterministic in tests). */
  newId: () => string;
}

/**
 * A copy of `source` as a new Draft case for the same client: same title
 * (with " (copy)"), description, visa subclass and substream, work plan and
 * owner. It gets a fresh id and no case number (one is assigned on create),
 * no assignment history, no outcome and isn't on hold.
 *
 * Its tasks are copied as not started, keeping their order, phase, step and
 * assignee, with every date moved by the same amount so the plan starts
 * today. Manual date locks are cleared, since the dates are new. Deadlines,
 * documents, notes, the checklist and chats are not copied: they belong to
 * the original case's real-world events.
 */
export function duplicateCase(
  source: Case,
  sourceTasks: Task[],
  { today, now, newId }: DuplicateCaseOptions,
): { newCase: Case; newTasks: Task[] } {
  const caseId = newId();
  const shift = dayDiff(source.startDate || today, today);

  const newCase: Case = {
    id: caseId,
    clientId: source.clientId,
    applicantId: source.applicantId,
    title: `${source.title} (copy)`,
    description: source.description,
    templateId: source.templateId,
    templateVersion: source.templateVersion,
    visaSubclass: source.visaSubclass,
    visaSubstream: source.visaSubstream,
    caseOwner: source.caseOwner,
    stage: 'draft',
    startDate: today,
    createdAt: now,
  };

  const newTasks: Task[] = sourceTasks
    .filter(t => t.caseId === source.id)
    .sort((a, b) => a.priorityOrder - b.priorityOrder)
    .map(t => ({
      id: newId(),
      caseId,
      title: t.title,
      description: t.description,
      date: addDaysISO(t.date, shift),
      status: 'not_started',
      isCompleted: false,
      priorityOrder: t.priorityOrder,
      generatedByAi: t.generatedByAi,
      assignedTo: t.assignedTo,
      stepKey: t.stepKey,
      phase: t.phase,
      datePending: t.datePending,
    }));

  return { newCase, newTasks };
}
