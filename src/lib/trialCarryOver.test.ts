import { describe, expect, it } from 'vitest';
import {
  TRIAL_SCENARIO_KEY,
  TRIAL_SCENARIO_TTL_MS,
  clearTrialScenario,
  peekTrialScenario,
  saveTrialScenario,
  takeTrialScenario,
} from './trialCarryOver';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const answers = {
  clientInfo: { fullName: 'Should not be kept', dob: '1999-01-01', age: 26, nationality: 'India', inAustralia: false, currentVisaStatus: '' },
  goals: { primaryPurpose: 'study', intendedDuration: 'years' },
  details: { courseLevel: 'bachelor' },
  supportingFactors: { englishProficiency: 'proficient', healthConcerns: false, criminalHistory: false },
};

describe('trialCarryOver', () => {
  it('saves the scenario without a name or date of birth', () => {
    const s = memoryStorage();
    saveTrialScenario(answers, 'client', 1000, s);
    const raw = s.data.get(TRIAL_SCENARIO_KEY)!;
    expect(raw).not.toContain('Should not be kept');
    expect(raw).not.toContain('1999');
    expect(peekTrialScenario(2000, s)?.answers.clientInfo.age).toBe(26);
  });

  it('peek keeps it, take uses it once', () => {
    const s = memoryStorage();
    saveTrialScenario(answers, 'self', 1000, s);
    expect(peekTrialScenario(1001, s)?.audience).toBe('self');
    expect(takeTrialScenario(1002, s)?.audience).toBe('self');
    expect(peekTrialScenario(1003, s)).toBeNull();
  });

  it('expires after 24 hours and removes the stale copy', () => {
    const s = memoryStorage();
    saveTrialScenario(answers, 'client', 0, s);
    expect(peekTrialScenario(TRIAL_SCENARIO_TTL_MS - 1, s)).not.toBeNull();
    expect(peekTrialScenario(TRIAL_SCENARIO_TTL_MS, s)).toBeNull();
    expect(s.data.has(TRIAL_SCENARIO_KEY)).toBe(false);
  });

  it('drops corrupt or foreign data', () => {
    const s = memoryStorage();
    s.setItem(TRIAL_SCENARIO_KEY, '{not json');
    expect(peekTrialScenario(0, s)).toBeNull();
    s.setItem(TRIAL_SCENARIO_KEY, JSON.stringify({ savedAt: 0, audience: 'admin', answers }));
    expect(peekTrialScenario(1, s)).toBeNull();
  });

  it('copes with no storage at all', () => {
    expect(() => saveTrialScenario(answers, 'client', 0, null)).not.toThrow();
    expect(peekTrialScenario(0, null)).toBeNull();
    expect(() => clearTrialScenario(null)).not.toThrow();
  });
});
