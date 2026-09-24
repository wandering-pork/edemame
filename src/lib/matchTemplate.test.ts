import { describe, it, expect } from 'vitest';
import { matchTemplate } from './matchTemplate';
import type { WorkflowTemplate } from '../types';

function makeTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
  return {
    id: 'tpl-1',
    title: 'Student Visa',
    description: '',
    ...overrides,
  };
}

describe('matchTemplate', () => {
  it('matches a template with a single-subclass visaSubclass', () => {
    const target = makeTemplate({ id: 'tpl-500', visaSubclass: '500' });
    const templates = [makeTemplate({ id: 'tpl-190', visaSubclass: '190' }), target];
    expect(matchTemplate(templates, '500')).toBe(target);
  });

  it('matches a template whose visaSubclass lists multiple subclasses split on "/"', () => {
    const target = makeTemplate({ id: 'tpl-820-801', visaSubclass: '820/801' });
    const templates = [target];
    expect(matchTemplate(templates, '801')).toBe(target);
    expect(matchTemplate(templates, '820')).toBe(target);
  });

  it('trims whitespace around split subclass entries', () => {
    const target = makeTemplate({ id: 'tpl-820-801', visaSubclass: '820 / 801' });
    const templates = [target];
    expect(matchTemplate(templates, '801')).toBe(target);
  });

  it('does not match on substring — "489" should not match inside "4890"', () => {
    const templates = [makeTemplate({ id: 'tpl-4890', visaSubclass: '4890' })];
    expect(matchTemplate(templates, '489')).toBeUndefined();
  });

  it('returns undefined when no template matches', () => {
    const templates = [makeTemplate({ visaSubclass: '190' })];
    expect(matchTemplate(templates, '500')).toBeUndefined();
  });

  it('treats a missing visaSubclass as not matching anything', () => {
    const templates = [makeTemplate({ visaSubclass: undefined })];
    expect(matchTemplate(templates, '500')).toBeUndefined();
  });
});
