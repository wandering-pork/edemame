/**
 * Local-calendar-date helpers.
 *
 * `Date#toISOString()` always renders in UTC, so `new Date().toISOString().split('T')[0]`
 * silently returns *yesterday's* (or tomorrow's) date for anyone west/east of UTC during
 * part of the day — e.g. 12:30am AEST (UTC+10) is still 2:30pm UTC the previous day.
 * Anywhere "today" or "this local date" is meant (defaulting a date picker, comparing
 * against a task's due date, stamping "created today"), use `toLocalISODate()` instead.
 */

/** Formats a Date as YYYY-MM-DD using its local (not UTC) calendar fields. */
export function toLocalISODate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
