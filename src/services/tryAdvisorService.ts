import type { EligibilityAssessmentInputs } from '../types';
import { buildEligibilityRequest } from '../lib/eligibilityRequest';
import type { TrialAudience } from '../lib/trialCarryOver';

// Client for the public, signed-out Visa Advisor trial (api/try-eligibility.ts). No auth header:
// the endpoint is for visitors without an account and is protected by Turnstile and IP limits.

export type TrialVerdict = 'qualifies' | 'possibly_qualifies' | 'unlikely' | 'needs_more_info';

export interface TrialMatch {
  visaSubclass: string;
  visaName: string;
  verdict: TrialVerdict;
}

export type TrialResult =
  | { audience: 'client'; result: TrialMatch; remainingToday: number }
  | {
      audience: 'self';
      best: TrialMatch | { verdict: TrialVerdict };
      hidden: boolean;
      others: TrialMatch[];
      rankingToken?: string;
      remainingToday: number;
    };

/** Why a check didn't produce a result; each has its own state in the trial sheet. */
export type TrialErrorCode = 'trial_limit' | 'trial_paused' | 'challenge_failed' | 'ai_busy' | 'ai_error' | 'network';

export class TrialError extends Error {
  constructor(public code: TrialErrorCode, message: string) {
    super(message);
    this.name = 'TrialError';
  }
}

const KNOWN: TrialErrorCode[] = ['trial_limit', 'trial_paused', 'challenge_failed', 'ai_busy', 'ai_error'];

export async function runTrialCheck(params: {
  audience: TrialAudience;
  answers: EligibilityAssessmentInputs;
  turnstileToken: string | null;
}): Promise<TrialResult> {
  let response: Response;
  try {
    response = await fetch('/api/try-eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audience: params.audience,
        // Age, never a name or date of birth (the trial collects neither).
        answers: buildEligibilityRequest(params.answers),
        turnstileToken: params.turnstileToken,
      }),
    });
  } catch {
    throw new TrialError('network', 'Couldn’t reach Edamame. Check your connection and try again.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    const code = KNOWN.includes(body?.code as TrialErrorCode) ? (body!.code as TrialErrorCode) : 'ai_error';
    throw new TrialError(code, body?.error || 'The check didn’t finish. Please try again.');
  }
  return (await response.json()) as TrialResult;
}

/** True when the applicant teaser includes the best match itself rather than only its verdict. */
export const isFullMatch = (m: TrialMatch | { verdict: TrialVerdict }): m is TrialMatch => 'visaSubclass' in m;
