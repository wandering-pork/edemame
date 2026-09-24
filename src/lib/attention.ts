import { differenceInCalendarDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import type { Task, Case, Client } from '../types';
import { isTaskClosed, isWaiting } from './taskStatus';

/** One row in the Dashboard's "Needs attention" list. */
export interface AttentionItem {
  id: string;
  dot: string;
  title: string;
  sub: string;
  caseId?: string;
}

/**
 * Open (not closed, not waiting-on-someone-else) tasks whose due date is
 * before `today`, oldest due date first. Waiting tasks are excluded — see
 * "Overdue counts must exclude waiting states" — and surfaced separately.
 */
export function overdueTasksFor(tasks: Task[], today: Date): Task[] {
  return tasks
    .filter(t => !isTaskClosed(t) && !isWaiting(t) && isBefore(startOfDay(new Date(t.date)), today))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Open, non-waiting tasks due today. */
export function dueTodayTasksFor(tasks: Task[], today: Date): Task[] {
  return tasks.filter(t => !isTaskClosed(t) && !isWaiting(t) && isSameDay(new Date(t.date), today));
}

/** Open tasks waiting on the client or a third party — tracked, not counted as overdue backlog. */
export function waitingTasksFor(tasks: Task[]): Task[] {
  return tasks.filter(t => !isTaskClosed(t) && isWaiting(t));
}

/**
 * Builds the "Needs attention" list: overdue tasks first (oldest due date
 * first, from `overdueTasksFor`), then tasks due today. Extracted from
 * `Dashboard.tsx` so the rule ("Overdue first, then due today") has one
 * tested home.
 */
export function buildAttentionItems(
  overdue: Task[],
  dueToday: Task[],
  getCaseAndClient: (caseId?: string) => { case?: Case; client?: Client },
  formatDate: (isoDate: string) => string,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  overdue.forEach(t => {
    const { case: c, client } = getCaseAndClient(t.caseId);
    items.push({
      id: t.id,
      dot: '#EF4444',
      title: `${t.title} overdue`,
      sub: c
        ? `${client?.name || 'Unknown client'} · ${c.title} · was due ${formatDate(t.date)}`
        : `No linked case · was due ${formatDate(t.date)}`,
      caseId: c?.id,
    });
  });

  dueToday.forEach(t => {
    const { case: c, client } = getCaseAndClient(t.caseId);
    items.push({
      id: t.id,
      dot: '#F59E0B',
      title: `${t.title} due today`,
      sub: c ? `${client?.name || 'Unknown client'} · ${c.title}` : 'No linked case',
      caseId: c?.id,
    });
  });

  return items;
}

/** Days until (or since, if negative) a YYYY-MM-DD date, relative to `today`. */
export function daysUntil(isoDate: string, today: Date): number {
  return differenceInCalendarDays(startOfDay(new Date(isoDate)), today);
}
