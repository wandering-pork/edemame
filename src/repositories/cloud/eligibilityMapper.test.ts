import { describe, it, expect } from 'vitest';
import { eligibilityAssessmentToRow, rowToEligibilityAssessment } from './index';
import type { EligibilityAssessment } from '../../types';

function makeAssessment(overrides: Partial<EligibilityAssessment> = {}): EligibilityAssessment {
  return {
    id: 'assessment-1',
    createdAt: '2026-09-24T00:00:00.000Z',
    inputs: {
      clientInfo: { fullName: 'Jane Doe', dob: '1990-01-01', nationality: 'NZ', inAustralia: false, currentVisaStatus: '' },
      goals: { primaryPurpose: 'family', intendedDuration: 'permanent' },
      details: {},
      supportingFactors: { englishProficiency: 'fluent', healthConcerns: false, criminalHistory: false },
    },
    options: [
      { visaSubclass: '820', visaName: 'Partner', verdict: 'qualifies', reasons: ['r1'], gaps: ['g1'] },
    ],
    ...overrides,
  };
}

describe('eligibilityAssessmentToRow / rowToEligibilityAssessment', () => {
  it('round-trips an assessment with no case/client/selection yet', () => {
    const assessment = makeAssessment();
    const row = eligibilityAssessmentToRow('user-1', assessment);
    expect(row.user_id).toBe('user-1');
    expect(row.client_id).toBeNull();
    expect(row.case_id).toBeNull();
    expect(row.selected_subclass).toBeNull();

    const roundTripped = rowToEligibilityAssessment(row);
    expect(roundTripped).toEqual({ ...assessment, userId: 'user-1' });
  });

  it('round-trips clientId, caseId and selectedSubclass when set', () => {
    const assessment = makeAssessment({ clientId: 'client-1', caseId: 'case-1', selectedSubclass: '820' });
    const row = eligibilityAssessmentToRow('user-1', assessment);
    expect(row.client_id).toBe('client-1');
    expect(row.case_id).toBe('case-1');
    expect(row.selected_subclass).toBe('820');

    const roundTripped = rowToEligibilityAssessment(row);
    expect(roundTripped.clientId).toBe('client-1');
    expect(roundTripped.caseId).toBe('case-1');
    expect(roundTripped.selectedSubclass).toBe('820');
  });

  it('preserves inputs and options as-is (jsonb passthrough)', () => {
    const assessment = makeAssessment();
    const row = eligibilityAssessmentToRow('user-1', assessment);
    expect(row.inputs).toEqual(assessment.inputs);
    expect(row.options).toEqual(assessment.options);
  });
});
