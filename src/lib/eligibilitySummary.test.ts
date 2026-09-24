import { describe, it, expect } from 'vitest';
import { buildEligibilitySummary } from './eligibilitySummary';
import type { EligibilityAssessmentOption } from '../types';

function makeOption(overrides: Partial<EligibilityAssessmentOption> = {}): EligibilityAssessmentOption {
  return {
    visaSubclass: '820',
    visaName: 'Partner',
    verdict: 'qualifies',
    reasons: ['Long relationship history'],
    gaps: ['No joint lease yet'],
    ...overrides,
  };
}

describe('buildEligibilitySummary', () => {
  it('includes the pathway name, subclass, and verdict label', () => {
    const summary = buildEligibilitySummary(makeOption());
    expect(summary).toContain('Partner (subclass 820)');
    expect(summary).toContain('verdict: Strong match');
  });

  it('includes the primary purpose label when given', () => {
    const summary = buildEligibilitySummary(makeOption(), 'Family Reunification');
    expect(summary).toContain('Primary purpose: Family Reunification.');
  });

  it('omits the primary purpose line when not given', () => {
    const summary = buildEligibilitySummary(makeOption());
    expect(summary).not.toContain('Primary purpose:');
  });

  it('points to the case eligibility assessment instead of dumping reasons/gaps', () => {
    const summary = buildEligibilitySummary(makeOption());
    expect(summary).toContain('Full eligibility assessment saved');
    expect(summary).not.toContain('No joint lease yet');
    expect(summary).not.toContain('Long relationship history');
  });

  it('falls back to the raw verdict string for an unknown verdict', () => {
    const summary = buildEligibilitySummary(makeOption({ verdict: 'unknown' as any }));
    expect(summary).toContain('verdict: unknown');
  });
});
