import type { DeadlineKind, StepAnchor, StepTiming, WorkflowStep } from '../types';
import type { TypicalLength } from './scheduleFromTemplate';

/**
 * Human labels for `DeadlineKind`, used both in the Templates page's plain-
 * words step description ("Within 60 days of invitation received") and the
 * custom template step editor's "counts from" select. Lower-case, no leading
 * article, so they read naturally after "of"/"since".
 */
export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  visa_expiry: 'visa expiry',
  passport_expiry: 'passport expiry',
  s56_response: 's56 request received',
  s57_response: 's57 notice received',
  nomination_validity: 'nomination approval',
  invitation_window: 'invitation received',
  other: 'the linked deadline',
};

function pluralDays(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Names what a step's timing is anchored to, in prose — the second half of
 * "2 days after {anchorLabel}". `steps` is used to look up another step's
 * title for `type: 'step'` anchors; an anchor pointing at a step key that
 * isn't found (shouldn't happen for a schedulable template, but templates
 * mid-edit can be in this state) falls back to a generic label rather than
 * throwing.
 */
function describeAnchor(anchor: StepAnchor, steps: WorkflowStep[]): string {
  switch (anchor.type) {
    case 'case_start':
      return 'case start';
    case 'previous_step':
      return 'the previous step';
    case 'step': {
      const target = steps.find(s => s.key === anchor.stepKey);
      const title = target?.title ?? 'an earlier step';
      return anchor.edge === 'done' ? `${title} is done` : `${title} starts`;
    }
    case 'deadline':
      return DEADLINE_KIND_LABELS[anchor.kind];
    default: {
      const _never: never = anchor;
      void _never;
      return 'case start';
    }
  }
}

/**
 * The offset half of a step's timing description, e.g. "On case start",
 * "2 days after Skills assessment", or (for `fixed` steps, phrased as a legal
 * window rather than a scheduling offset) "Within 60 days of invitation received".
 */
export function describeStepOffset(timing: StepTiming, steps: WorkflowStep[]): string {
  const anchorLabel = describeAnchor(timing.anchor, steps);
  if (timing.offsetDays === 0) {
    return timing.anchor.type === 'case_start' ? 'On case start' : `On ${anchorLabel}`;
  }
  if (timing.fixed) {
    return `Within ${pluralDays(timing.offsetDays)} of ${anchorLabel}`;
  }
  return `${pluralDays(timing.offsetDays)} after ${anchorLabel}`;
}

/** The " · takes X–Y days" half, or undefined when the step has no duration estimate. */
export function describeStepDuration(timing: StepTiming): string | undefined {
  if (!timing.durationDays) return undefined;
  const { min, max } = timing.durationDays;
  if (min === max) return `takes ${pluralDays(min)}`;
  return `takes ${min}–${max} days`;
}

/**
 * The full plain-words timing line shown on a Templates page timeline row,
 * e.g. "2 days after Skills assessment · takes 28–84 days". A step with
 * no `timing` at all (old/custom template, see `WorkflowStep.timing`'s doc
 * comment) renders as "No timing set" rather than guessing.
 */
export function describeStepTiming(timing: StepTiming | undefined, steps: WorkflowStep[]): string {
  if (!timing) return 'No timing set';
  const offset = describeStepOffset(timing, steps);
  const duration = describeStepDuration(timing);
  return duration ? `${offset} · ${duration}` : offset;
}

/**
 * The Templates page header's "Typical length: X–Y ..." figure from
 * `scheduleFromTemplate.ts`'s `typicalLength()`. Picks the coarsest unit that
 * keeps both ends of the range at 1 or more: days under two weeks, weeks
 * under two months, months otherwise — per the plan's "X–Y months (or
 * weeks when short)".
 */
export function formatTypicalLength({ minDays, maxDays }: TypicalLength): string {
  if (maxDays <= 0) return 'Typical length: same day';

  if (maxDays < 14) {
    return minDays === maxDays
      ? `Typical length: ${pluralDays(minDays)}`
      : `Typical length: ${minDays}–${maxDays} days`;
  }

  if (maxDays < 60) {
    const minWeeks = Math.max(1, Math.round(minDays / 7));
    const maxWeeks = Math.max(1, Math.round(maxDays / 7));
    return minWeeks === maxWeeks
      ? `Typical length: ${minWeeks} week${minWeeks === 1 ? '' : 's'}`
      : `Typical length: ${minWeeks}–${maxWeeks} weeks`;
  }

  const minMonths = Math.max(1, Math.round(minDays / 30));
  const maxMonths = Math.max(1, Math.round(maxDays / 30));
  return minMonths === maxMonths
    ? `Typical length: ${minMonths} month${minMonths === 1 ? '' : 's'}`
    : `Typical length: ${minMonths}–${maxMonths} months`;
}
