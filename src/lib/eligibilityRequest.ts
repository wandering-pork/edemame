import type { EligibilityAssessmentInputs } from '../types';

// What the Visa Advisor actually sends to /api/check-eligibility (docs/plans/public-visa-advisor-
// trial.md, VA.0). The wizard collects a full name and date of birth (kept in the browser for
// opening a case, and in the saved EligibilityAssessment's inputs), but the AI never needs either:
// it gets an age in whole years and no name at all.

/** Whole years between a YYYY-MM-DD date of birth and `today` (local calendar), or null if unusable. */
export function ageFromDob(dob: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age--;
  return age >= 0 && age <= 120 ? age : null;
}

export function buildEligibilityRequest(inputs: EligibilityAssessmentInputs, today: Date = new Date()) {
  const { clientInfo, goals, details, supportingFactors } = inputs;
  return {
    clientInfo: {
      // An age entered directly (the homepage trial asks for age, not a date of birth) wins.
      age: clientInfo.age ?? ageFromDob(clientInfo.dob, today),
      nationality: clientInfo.nationality,
      inAustralia: clientInfo.inAustralia,
      currentVisaStatus: clientInfo.currentVisaStatus,
    },
    goals,
    details,
    supportingFactors,
  };
}
