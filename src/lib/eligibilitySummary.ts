import type { EligibilityAssessmentOption } from '../types';

const VERDICT_LABELS: Record<string, string> = {
  qualifies: 'Strong match',
  possibly_qualifies: 'Possible',
  unlikely: 'Unlikely',
  needs_more_info: 'Needs more info',
};

/**
 * Short case-intake summary for a case opened from the Visa Advisor.
 *
 * Replaces the old full wizard-answers dump: the full report is now saved
 * separately as an `EligibilityAssessment` record (see types.ts /
 * `repos.eligibility`), so the case description and its intake `CaseNote`
 * (see `App.tsx`'s `handleTasksConfirmed`) no longer duplicate it — this
 * just points the reader at "View eligibility assessment" on the case.
 */
export function buildEligibilitySummary(
  option: EligibilityAssessmentOption,
  primaryPurposeLabel?: string,
): string {
  const verdict = VERDICT_LABELS[option.verdict] ?? option.verdict;
  const lines = [
    `Generated from Visa Eligibility Advisor — assessed pathway: ${option.visaName} (subclass ${option.visaSubclass}), verdict: ${verdict}.`,
  ];
  if (primaryPurposeLabel) {
    lines.push(`Primary purpose: ${primaryPurposeLabel}.`);
  }
  lines.push(`Full eligibility assessment saved — see "Eligibility assessment" on this case.`);
  return lines.join('\n');
}
