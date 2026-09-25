import { describe, it, expect } from 'vitest';
import { describePlanSource, buildTaskPlanSummary } from './planActivity';

describe('describePlanSource', () => {
  it('returns none for an empty task list', () => {
    expect(describePlanSource([])).toBe('none');
  });

  it('returns template when every task is deterministic (stepKey, not AI)', () => {
    expect(
      describePlanSource([
        { stepKey: 'a', generatedByAi: false },
        { stepKey: 'b', generatedByAi: false },
      ])
    ).toBe('template');
  });

  it('returns template when generatedByAi is simply absent', () => {
    expect(describePlanSource([{ stepKey: 'a' }, { stepKey: 'b' }])).toBe('template');
  });

  it('returns ai when every task is AI-generated', () => {
    expect(
      describePlanSource([
        { generatedByAi: true },
        { generatedByAi: true },
      ])
    ).toBe('ai');
  });

  it('returns mixed when some tasks are AI-generated and some are not', () => {
    expect(
      describePlanSource([
        { stepKey: 'a', generatedByAi: false },
        { generatedByAi: true },
      ])
    ).toBe('mixed');
  });
});

describe('buildTaskPlanSummary', () => {
  it('names the template when known', () => {
    expect(buildTaskPlanSummary(12, 'template', 'Skilled Independent 189')).toBe(
      'Created a 12-task plan from the Skilled Independent 189 template.'
    );
  });

  it('falls back to a generic template phrase when the name is unknown', () => {
    expect(buildTaskPlanSummary(12, 'template')).toBe('Created a 12-task plan from the workflow template.');
  });

  it('describes an AI-generated plan', () => {
    expect(buildTaskPlanSummary(12, 'ai')).toBe('Generated a 12-task plan with AI.');
  });

  it('describes a mixed plan', () => {
    expect(buildTaskPlanSummary(14, 'mixed')).toBe(
      'Created a 14-task plan (template plan plus AI-suggested additions).'
    );
  });

  it('returns an empty string for no tasks', () => {
    expect(buildTaskPlanSummary(0, 'none')).toBe('');
  });
});
