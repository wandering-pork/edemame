import type { Deadline, Notification } from '../types';
import { daysLeft } from './deadlines';

/** Thresholds (days remaining) that each get their own alert. */
export const DEADLINE_ALERT_THRESHOLDS = [14, 7, 2] as const;

/**
 * Stable, dedupable id for the "deadline is within N days" notification —
 * `deadline:{id}:{threshold}`. Checked against existing notifications so the
 * same threshold crossing never creates a second alert.
 */
export function deadlineAlertId(deadlineId: string, threshold: number): string {
  return `deadline:${deadlineId}:${threshold}`;
}

/**
 * Builds the `Notification`s that should exist but don't yet, for every open
 * deadline that has crossed a 14/7/2-day threshold. Checked on app load —
 * there's no background job (see plan 1D). A deadline that has crossed more
 * than one threshold (e.g. first opened at 3 days left) gets one alert per
 * threshold already crossed, so the history shows each escalation. Overdue
 * deadlines (`daysLeft < 0`) are not alerted here — they surface as "Missed?"
 * in the Deadlines panel instead, which asks the agent to resolve rather than
 * auto-generating more notifications.
 */
export function buildDeadlineAlerts(
  deadlines: Deadline[],
  existingNotifications: Pick<Notification, 'id'>[],
  today: Date,
): Notification[] {
  const existingIds = new Set(existingNotifications.map(n => n.id));
  const toCreate: Notification[] = [];

  for (const d of deadlines) {
    if (d.status !== 'open') continue;
    const days = daysLeft(d, today);
    if (days < 0) continue;

    for (const threshold of DEADLINE_ALERT_THRESHOLDS) {
      if (days > threshold) continue;
      const id = deadlineAlertId(d.id, threshold);
      if (existingIds.has(id)) continue;
      toCreate.push({
        id,
        title: 'Deadline approaching',
        message: `"${d.title}" is due ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`} (${d.dueDate}).`,
        type: 'warning',
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return toCreate;
}
