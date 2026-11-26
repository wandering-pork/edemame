import type { EligibilityAssessmentInputs } from '../types';

// Keeps the scenario a visitor tried in the homepage's Visa Advisor trial, so that after they create
// an account (or log in) the full Visa Advisor opens with their answers already filled in
// (docs/plans/public-visa-advisor-trial.md, VA.2b, Decisions 6 and 8).
//
// localStorage, not sessionStorage: the email-confirmation link opens in a new tab, where
// sessionStorage is empty. It holds no name and no date of birth (stripped here even if present),
// expires after 24 hours, and is cleared once used or on sign-out.

export type TrialAudience = 'client' | 'self';

export interface TrialScenario {
  savedAt: number;
  audience: TrialAudience;
  answers: EligibilityAssessmentInputs;
}

export const TRIAL_SCENARIO_KEY = 'edamame:try-advisor-scenario';
export const TRIAL_SCENARIO_TTL_MS = 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage disabled (privacy mode, sandboxed frame)
  }
}

export function saveTrialScenario(
  answers: EligibilityAssessmentInputs,
  audience: TrialAudience,
  now: number = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const scenario: TrialScenario = {
    savedAt: now,
    audience,
    answers: { ...answers, clientInfo: { ...answers.clientInfo, fullName: '', dob: '' } },
  };
  try {
    storage.setItem(TRIAL_SCENARIO_KEY, JSON.stringify(scenario));
  } catch {
    // full or blocked storage: the carry-over is a convenience, not a requirement
  }
}

/** The stored scenario if there is one under 24 hours old; an expired or corrupt one is removed. */
export function peekTrialScenario(now: number = Date.now(), storage: StorageLike | null = defaultStorage()): TrialScenario | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(TRIAL_SCENARIO_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TrialScenario;
    const fresh = typeof parsed?.savedAt === 'number' && now - parsed.savedAt >= 0 && now - parsed.savedAt < TRIAL_SCENARIO_TTL_MS;
    if (fresh && parsed.answers?.clientInfo && (parsed.audience === 'client' || parsed.audience === 'self')) return parsed;
  } catch {
    // fall through to removal
  }
  clearTrialScenario(storage);
  return null;
}

/** Returns the stored scenario and removes it, so it's used once. */
export function takeTrialScenario(now: number = Date.now(), storage: StorageLike | null = defaultStorage()): TrialScenario | null {
  const scenario = peekTrialScenario(now, storage);
  if (scenario) clearTrialScenario(storage);
  return scenario;
}

export function clearTrialScenario(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(TRIAL_SCENARIO_KEY);
  } catch {
    // nothing to do
  }
}
