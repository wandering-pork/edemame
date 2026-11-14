import { describe, it, expect } from 'vitest';
import { NOT_CONFIRMED_SUBCLASS } from '../types';
import { NO_SUBCLASS_FILTER, effectiveSubclass, matchesVisaFilter, phaseAheadOfStage } from './caseListFilters';

describe('matchesVisaFilter', () => {
  it('matches everything with no filter', () => {
    expect(matchesVisaFilter(undefined, undefined, { subclass: '', substream: '' })).toBe(true);
  });

  it('filters by subclass, then substream', () => {
    const f = { subclass: '189', substream: '' };
    expect(matchesVisaFilter('189', 'New Zealand', f)).toBe(true);
    expect(matchesVisaFilter('190', undefined, f)).toBe(false);
    expect(matchesVisaFilter('189', 'New Zealand', { subclass: '189', substream: 'Points-tested' })).toBe(false);
    expect(matchesVisaFilter('189', 'Points-tested', { subclass: '189', substream: 'Points-tested' })).toBe(true);
  });

  it('can find Not Confirmed cases and cases with no subclass', () => {
    expect(matchesVisaFilter(NOT_CONFIRMED_SUBCLASS, undefined, { subclass: NOT_CONFIRMED_SUBCLASS, substream: '' })).toBe(true);
    expect(matchesVisaFilter(undefined, undefined, { subclass: NO_SUBCLASS_FILTER, substream: '' })).toBe(true);
    expect(matchesVisaFilter('189', undefined, { subclass: NO_SUBCLASS_FILTER, substream: '' })).toBe(false);
  });

  it('falls back to the plan subclass', () => {
    expect(effectiveSubclass({ visaSubclass: undefined }, '500')).toBe('500');
    expect(effectiveSubclass({ visaSubclass: '189' }, '500')).toBe('189');
  });
});

describe('phaseAheadOfStage', () => {
  it('flags a post-lodgement phase on a pre-lodgement stage', () => {
    expect(phaseAheadOfStage('preparing', 'lodged', true)).toBe(true);
    expect(phaseAheadOfStage('draft', 'decision', true)).toBe(true);
  });

  it('does not flag matching or earlier phases, closed cases, or cases without phases', () => {
    expect(phaseAheadOfStage('lodged', 'lodged', true)).toBe(false);
    expect(phaseAheadOfStage('preparing', 'prerequisites', true)).toBe(false);
    expect(phaseAheadOfStage('closed', 'decision', true)).toBe(false);
    expect(phaseAheadOfStage('preparing', 'lodged', false)).toBe(false);
  });
});
