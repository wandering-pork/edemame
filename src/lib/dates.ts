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

/**
 * Adds `days` (positive or negative) to a YYYY-MM-DD date string and returns
 * the result as a YYYY-MM-DD string, computed on local calendar fields (via
 * `toLocalISODate`) so it doesn't fall prey to the UTC pitfall described
 * above.
 */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/**
 * Whole-day difference `b - a` between two YYYY-MM-DD date strings (positive
 * when `b` is after `a`), computed on local midnight calendar instants so it
 * isn't thrown off by DST transitions falling between the two dates.
 */
export function diffDaysISO(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`);
  const db = new Date(`${b}T00:00:00`);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((db.getTime() - da.getTime()) / msPerDay);
}
