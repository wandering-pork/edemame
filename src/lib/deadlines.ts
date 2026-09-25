import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Client, Deadline, DeadlineKind } from '../types';

/**
 * Days until (negative if past) a deadline's due date, relative to `today`.
 * Computed on local calendar fields (see `lib/dates.ts`'s note on the UTC
 * pitfall) via `date-fns`'s calendar-day diff rather than millisecond math.
 */
export function daysLeft(d: Pick<Deadline, 'dueDate'>, today: Date): number {
  return differenceInCalendarDays(startOfDay(new Date(`${d.dueDate}T00:00:00`)), startOfDay(today));
}

export type DeadlineUrgency = 'none' | 'soon' | 'urgent' | 'critical';

/**
 * `none` (>14 days) · `soon` (≤14) · `urgent` (≤7) · `critical` (≤2 or past).
 * Independent of `status` — callers that only care about open deadlines
 * filter on `status === 'open'` themselves (see `deadlineAttentionItemsFor`,
 * `buildDeadlineAlerts`).
 */
export function urgency(d: Pick<Deadline, 'dueDate'>, today: Date): DeadlineUrgency {
  const days = daysLeft(d, today);
  if (days <= 2) return 'critical';
  if (days <= 7) return 'urgent';
  if (days <= 14) return 'soon';
  return 'none';
}

/**
 * Ranking used for "rank by consequence, not age": lower number = more
 * consequential = sorts first. s56/s57 response windows (statutory, missing
 * one can void the application) outrank an invitation window, which outranks
 * nomination validity, then visa expiry, then passport expiry, then
 * everything else.
 */
const CONSEQUENCE_WEIGHT: Record<DeadlineKind, number> = {
  s56_response: 0,
  s57_response: 0,
  invitation_window: 1,
  nomination_validity: 2,
  visa_expiry: 3,
  passport_expiry: 4,
  other: 5,
};

export function consequenceWeight(kind: DeadlineKind): number {
  return CONSEQUENCE_WEIGHT[kind] ?? CONSEQUENCE_WEIGHT.other;
}

/**
 * The virtual passport-expiry deadline for one client, derived from
 * `Client.passportExpiry` — never stored, computed at display time (the same
 * pattern as `lib/autoLink.ts`'s auto-link recalculation). `null` when the
 * client has no passport expiry on file.
 */
export function passportDeadlineFor(client: Pick<Client, 'id' | 'passportExpiry'>): Deadline | null {
  if (!client.passportExpiry) return null;
  return {
    id: `passport:${client.id}`,
    kind: 'passport_expiry',
    title: 'Passport expiry',
    dueDate: client.passportExpiry,
    clientId: client.id,
    status: 'open',
    createdAt: '',
  };
}

/**
 * Merges stored deadlines with the derived virtual ones (currently just
 * passport expiry — visa expiry becomes derived once Step 2 records grants
 * on the client). A client is skipped if it already has a stored, open
 * passport_expiry deadline, so the agent's own record (which they can edit/
 * dismiss) takes precedence over the always-on virtual one.
 */
export function allDeadlines(stored: Deadline[], clients: Pick<Client, 'id' | 'passportExpiry'>[]): Deadline[] {
  const clientsWithStoredPassportDeadline = new Set(
    stored
      .filter(d => d.status === 'open' && d.kind === 'passport_expiry' && d.clientId)
      .map(d => d.clientId),
  );
  const virtual = clients
    .filter(c => !clientsWithStoredPassportDeadline.has(c.id))
    .map(passportDeadlineFor)
    .filter((d): d is Deadline => d !== null);
  return [...stored, ...virtual];
}
