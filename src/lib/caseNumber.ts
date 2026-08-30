import type { Case } from '../types';

const PREFIX = 'EDM';
const SEQUENCE_PATTERN = /^EDM-(\d{4})-(\d+)$/i;

/**
 * Next case number for the given year, e.g. "EDM-2026-0001".
 *
 * The sequence is per-year and derived from the highest existing number rather
 * than a stored counter — there is no server to hand out ids in local mode, and
 * a linked folder is single-user by construction, so scanning is both correct
 * and cheap at this data scale.
 */
export function generateCaseNumber(existing: Case[], now: Date = new Date()): string {
  const year = now.getFullYear();
  let max = 0;
  for (const c of existing) {
    const match = c.caseNumber?.match(SEQUENCE_PATTERN);
    if (!match) continue;
    if (Number(match[1]) !== year) continue;
    max = Math.max(max, Number(match[2]));
  }
  return `${PREFIX}-${year}-${String(max + 1).padStart(4, '0')}`;
}

/**
 * What to show in the UI. Cases created before `caseNumber` existed fall back
 * to a stable, readable slice of their UUID so every case still has a
 * searchable, quotable reference.
 */
export function displayCaseNumber(c: Pick<Case, 'id' | 'caseNumber'>): string {
  if (c.caseNumber) return c.caseNumber;
  return `${PREFIX}-${c.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
