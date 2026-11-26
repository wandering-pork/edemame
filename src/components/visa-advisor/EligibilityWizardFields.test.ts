import { describe, expect, it } from 'vitest';
import { isWizardStepValid, purposeLabels } from './EligibilityWizardFields';

const answers = (fullName: string) => ({
  clientInfo: { fullName, dob: '', nationality: '', inAustralia: false, currentVisaStatus: '' },
  goals: { primaryPurpose: '', intendedDuration: '' },
  details: {},
  supportingFactors: { englishProficiency: '', healthConcerns: false, criminalHistory: false },
});

describe('isWizardStepValid', () => {
  it('needs a name on step 1 of the app wizard only', () => {
    expect(isWizardStepValid(answers(''), 1, 'app')).toBe(false);
    expect(isWizardStepValid(answers('  '), 1)).toBe(false);
    expect(isWizardStepValid(answers('Priya'), 1, 'app')).toBe(true);
    expect(isWizardStepValid(answers(''), 2, 'app')).toBe(true);
  });
  it('never needs a name in the trial', () => {
    expect(isWizardStepValid(answers(''), 1, 'trial')).toBe(true);
  });
});

describe('purposeLabels', () => {
  it('keeps the labels the case summary uses', () => {
    expect(purposeLabels.study).toBe('Study');
    expect(purposeLabels.pr).toBe('Permanent Residence');
  });
});
