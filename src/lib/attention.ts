import { differenceInCalendarDays, isBefore, isSameDay, startOfDay } from 'date-fns';
import type { Task, Case, Client, Deadline } from '../types';
import { isTaskClosed, isWaiting } from './taskStatus';
import { consequenceWeight, daysLeft, urgency } from './deadlines';

/** One row in the Dashboard's "Needs attention" list. */
export interface AttentionItem {
  id: string;
  dot: string;
  title: string;
  sub: string;
  caseId?: string;
  /** Set for a deadline whose only link is a client (no case) — the item navigates to the client instead. */
  clientId?: string;
  /** Absent (undefined) means 'task', for backward compatibility with existing callers/tests. */
  kind?: 'task' | 'deadline';
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

/**
 * Builds "Needs attention" rows for open deadlines at urgency `soon` or
 * above, sorted by `consequenceWeight` (most consequential first) then by
 * days left (soonest first) — "rank by consequence, not age". A deadline
 * linked to a case shows the case + client and navigates to the case; one
 * linked only to a client (no case, e.g. a bare passport expiry) navigates
 * to the client instead.
 */
export function deadlineAttentionItemsFor(
  deadlines: Deadline[],
  today: Date,
  getCaseAndClient: (caseId?: string) => { case?: Case; client?: Client },
  getClientById: (clientId?: string) => Client | undefined,
): AttentionItem[] {
  const eligible = deadlines.filter(d => d.status === 'open' && urgency(d, today) !== 'none');
  const sorted = [...eligible].sort((a, b) => {
    const byConsequence = consequenceWeight(a.kind) - consequenceWeight(b.kind);
    if (byConsequence !== 0) return byConsequence;
    return daysLeft(a, today) - daysLeft(b, today);
  });

  return sorted.map(d => {
    const days = daysLeft(d, today);
    const { case: c, client: caseClient } = getCaseAndClient(d.caseId);
    const client = caseClient ?? getClientById(d.clientId);
    const u = urgency(d, today);
    const dot = u === 'critical' ? '#EF4444' : u === 'urgent' ? '#F97316' : '#F59E0B';
    const dueLabel = days < 0 ? `overdue by ${Math.abs(days)}d` : days === 0 ? 'due today' : `due in ${days}d`;

    return {
      id: `deadline:${d.id}`,
      dot,
      title: `${d.title} — ${dueLabel}`,
      sub: client ? (c ? `${client.name} · ${c.title}` : client.name) : 'No linked client',
      caseId: c?.id,
      clientId: !c ? client?.id : undefined,
      kind: 'deadline',
    };
  });
}

/**
 * Merges deadline items ahead of task items — "deadlines with urgency ≥ soon
 * rank above tasks" (plan 1D). Deadline items are already internally sorted
 * by `deadlineAttentionItemsFor`; task items keep `buildAttentionItems`'s
 * existing "overdue first, then due today" order.
 */
export function mergeAttentionItems(deadlineItems: AttentionItem[], taskItems: AttentionItem[]): AttentionItem[] {
  return [...deadlineItems, ...taskItems];
}
