import type { Task } from '../types';
import { diffDaysISO, toLocalISODate } from './dates';
import { isTaskClosed, isWaiting } from './taskStatus';

/**
 * The task window's context line for how a task's due date relates to
 * `today` — "Overdue by N days" / "Due today" / "Due in N days" — or `null`
 * when there's nothing worth saying (closed, waiting on someone else, or a
 * `datePending` estimate, both of which have their own separate copy — see
 * `TaskDetailModal`'s "Estimated" chip). Waiting tasks are excluded from
 * "overdue" the same way `lib/attention.ts`'s `overdueTasksFor` excludes
 * them from the Dashboard's overdue count.
 */
export function overdueLabel(task: Pick<Task, 'date' | 'status' | 'datePending'>, today: Date = new Date()): string | null {
  if (isTaskClosed(task) || isWaiting(task) || task.datePending) return null;
  const days = diffDaysISO(task.date, toLocalISODate(today));
  if (days > 0) return `Overdue by ${days} day${days === 1 ? '' : 's'}`;
  if (days === 0) return 'Due today';
  const daysUntil = -days;
  return `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
}
