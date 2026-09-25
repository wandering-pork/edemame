/**
 * Pluralizes `noun` for `count`, using `plural` (default: `noun + 's'`) when
 * `count !== 1`. Keeps count labels (e.g. "1 task" / "2 tasks") consistent
 * across the app instead of every component hand-rolling its own ternary.
 */
export function pluralize(count: number, noun: string, plural: string = `${noun}s`): string {
  return count === 1 ? noun : plural;
}

/** Formats a "N noun(s)" label, e.g. `countLabel(1, 'task')` → "1 task". */
export function countLabel(count: number, noun: string, plural?: string): string {
  return `${count} ${pluralize(count, noun, plural)}`;
}
