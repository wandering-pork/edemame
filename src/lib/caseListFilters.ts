import { NOT_CONFIRMED_SUBCLASS, type Case, type CaseStage } from '../types';
import { caseStageGroup } from './caseStage';

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

/** Built-in phases that only make sense once an application is with the Department. */
const POST_LODGEMENT_PHASES = new Set(['lodged', 'decision', 'post_decision']);

/**
 * True when the case's tasks have reached a post-lodgement phase (Lodged,
 * Decision, Post-decision) but its stage is still before lodgement — a nudge
 * to update the stage, which is never moved automatically.
 */
export function phaseAheadOfStage(stage: CaseStage, currentPhaseRef: string | undefined, hasPhases: boolean): boolean {
  if (!hasPhases || !currentPhaseRef) return false;
  return caseStageGroup(stage) === 'pre_lodgement' && POST_LODGEMENT_PHASES.has(currentPhaseRef);
}

export const isNotConfirmed = (subclass?: string) => subclass === NOT_CONFIRMED_SUBCLASS;
