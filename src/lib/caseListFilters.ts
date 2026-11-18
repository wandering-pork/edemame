import { NOT_CONFIRMED_SUBCLASS, type Case } from '../types';

/**
 * Case Manager list filters and hints for phases and visa types (Work Plans
 * spec, step 4). Pure.
 */

/** Visa filter value: '' = all, NO_SUBCLASS = cases with no subclass, NOT_CONFIRMED_SUBCLASS, or a subclass code. */
export const NO_SUBCLASS_FILTER = '__none__';

/** The subclass a case is for: its own, else its Work Plan's. */
export const effectiveSubclass = (c: Pick<Case, 'visaSubclass'>, templateSubclass?: string): string | undefined =>
  c.visaSubclass ?? templateSubclass;

export function matchesVisaFilter(
  subclass: string | undefined,
  substream: string | undefined,
  filter: { subclass: string; substream: string },
): boolean {
  if (!filter.subclass) return true;
  if (filter.subclass === NO_SUBCLASS_FILTER) return !subclass;
  if (subclass !== filter.subclass) return false;
  return !filter.substream || substream === filter.substream;
}

export const isNotConfirmed = (subclass?: string) => subclass === NOT_CONFIRMED_SUBCLASS;
