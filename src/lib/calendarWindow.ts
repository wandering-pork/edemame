import { addDays, getDay, startOfDay, startOfWeek } from 'date-fns';

/** Number of day columns rendered by the Dashboard board. Deliberately 5, not 7. */
export const WINDOW_SIZE = 5;

/**
 * Where the 5-day window starts when the board is in "auto" mode.
 *
 * - Mon/Tue/Wed: fixed anchor — the window is Mon–Fri with Monday leftmost, and
 *   TODAY simply falls at the 1st/2nd/3rd column. The window does not move.
 * - Thu/Fri/Sat/Sun: rolling — the window is [TODAY-2 … TODAY+2] so TODAY is
 *   always the middle column. Not clamped to the current week, so Sat/Sun (and
 *   next week's Mon/Tue) roll into view.
 *
 * Because Mon/Tue/Wed always resolve to `startOfWeek`, the window automatically
 * snaps back to the fixed Mon–Fri anchor the moment TODAY becomes Monday again
 * — including the "next week" Monday a Saturday/Sunday window had spilled into.
 */
export function computeAutoWindowStart(today: Date): Date {
  const day = startOfDay(today);
  const weekday = getDay(day); // 0 = Sunday … 6 = Saturday
  const isEarlyWeek = weekday === 1 || weekday === 2 || weekday === 3;
  return isEarlyWeek ? startOfWeek(day, { weekStartsOn: 1 }) : addDays(day, -2);
}

/** The 5 consecutive calendar days beginning at `start`. */
export function buildWindow(start: Date): Date[] {
  const from = startOfDay(start);
  return Array.from({ length: WINDOW_SIZE }, (_, i) => addDays(from, i));
}

/** Start of the window one week before/after `start`, snapped to that week's Monday. */
export function jumpWeek(start: Date, direction: -1 | 1): Date {
  return startOfWeek(addDays(startOfDay(start), direction * 7), { weekStartsOn: 1 });
}

/** Start of the window one calendar day before/after `start`. */
export function stepDay(start: Date, direction: -1 | 1): Date {
  return addDays(startOfDay(start), direction);
}
