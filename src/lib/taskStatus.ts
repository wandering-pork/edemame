import type { Task, TaskStatus } from '../types';

/** Human-readable labels shared by every status control in the UI. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_client: 'Waiting on client',
  waiting_third_party: 'Waiting on third party',
  not_applicable: 'Not applicable',
  done: 'Done',
};

/** All statuses, in the order they should appear in a status menu. */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  'not_started',
  'in_progress',
  'waiting_client',
  'waiting_third_party',
  'not_applicable',
  'done',
];

/** Statuses that mean the task is finished and off the active board. */
const CLOSED_STATUSES: ReadonlySet<TaskStatus> = new Set(['done', 'not_applicable']);

/** Statuses that mean the task is blocked on someone outside the firm. */
const WAITING_STATUSES: ReadonlySet<TaskStatus> = new Set(['waiting_client', 'waiting_third_party']);

/**
 * Fills in `status` (and keeps `isCompleted` in sync) for a task that may
 * have been written before `status` existed — old local-mode JSON files and
 * old cloud rows only have `isCompleted`. Called by both repositories on
 * every read, per the "normalize at the repository boundary" rule.
 */
export function normalizeTask(raw: Task): Task {
  if (raw.status) {
    // Already has a status — just keep the deprecated mirror in sync.
    if (raw.isCompleted !== isTaskClosed(raw)) {
      return { ...raw, isCompleted: isTaskClosed(raw) };
    }
    return raw;
  }
  const status: TaskStatus = raw.isCompleted ? 'done' : 'not_started';
  return { ...raw, status, isCompleted: status === 'done' };
}

/** True when the task is done or explicitly marked not applicable. */
export function isTaskClosed(task: Pick<Task, 'status'>): boolean {
  return CLOSED_STATUSES.has(task.status);
}

/** True when the task is blocked on the client or a third party. */
export function isWaiting(task: Pick<Task, 'status'>): boolean {
  return WAITING_STATUSES.has(task.status);
}

/**
 * Returns a copy of `task` with a new status applied, keeping the deprecated
 * `isCompleted` mirror in sync. Throws if moving to `not_applicable` without
 * a non-empty `reason` — the UI must collect one via an inline field, never
 * `window.prompt`.
 */
export function withStatus(task: Task, status: TaskStatus, reason?: string): Task {
  if (status === 'not_applicable' && !reason?.trim()) {
    throw new Error('A reason is required when marking a task not applicable.');
  }
  const next: Task = {
    ...task,
    status,
    statusReason: status === 'not_applicable' ? reason!.trim() : undefined,
  };
  next.isCompleted = isTaskClosed(next);
  return next;
}

/** A status chip's label + Tailwind classes, readable in both themes. */
export interface StatusChip {
  label: string;
  className: string;
}

/**
 * A row-level status chip for every status that isn't the quiet default
 * (`not_started` shows no chip — a task row's tick is enough) or `done`
 * (which keeps its own tick + strikethrough treatment rather than a chip).
 * Each of the four remaining statuses gets its own colour so they read apart
 * from one another at a glance, not just "not the default".
 */
const STATUS_CHIP_CLASSES: Partial<Record<TaskStatus, string>> = {
  in_progress: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  waiting_client: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  waiting_third_party: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  not_applicable: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
};

/**
 * Returns the chip to render for `status` on a task row, or `null` for
 * `not_started`/`done` (no chip needed — see `STATUS_CHIP_CLASSES`'s doc
 * comment). Shared by every surface that lists tasks (case Tasks tab,
 * Dashboard calendar cards, Needs Attention) so they render statuses
 * identically.
 */
export function statusChipFor(status: TaskStatus): StatusChip | null {
  const className = STATUS_CHIP_CLASSES[status];
  if (!className) return null;
  return { label: TASK_STATUS_LABELS[status], className };
}
