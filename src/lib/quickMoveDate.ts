import { addDaysISO } from './dates';

/** The task window's "Move date" quick options — a custom pick uses the date input directly. */
export type QuickMoveOption = '+1d' | '+1w';

const OFFSETS: Record<QuickMoveOption, number> = {
  '+1d': 1,
  '+1w': 7,
};

/**
 * Computes the new YYYY-MM-DD date for a "Move date" quick option, relative
 * to a task's *current* due date (not "today") — so "+1 week" on a task
 * already 3 days overdue lands a week past its existing date, not a week
 * from now. Always goes through `lib/dates.ts`'s `addDaysISO()`, never
 * `toISOString()`, per the local-calendar-date rule.
 */
export function quickMoveDate(currentDate: string, option: QuickMoveOption): string {
  return addDaysISO(currentDate, OFFSETS[option]);
}
