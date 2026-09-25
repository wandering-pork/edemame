import { describe, it, expect } from 'vitest';
import { describeStepTiming, describeStepOffset, describeStepDuration, formatTypicalLength } from './describeTiming';
import type { StepTiming, WorkflowStep } from '../types';

const steps: WorkflowStep[] = [
  { key: 'skills-assessment', title: 'Skills assessment', description: '' },
  { key: 'eoi', title: 'EOI submission', description: '' },
];

describe('describeStepTiming', () => {
  it('renders "No timing set" for a step with no timing', () => {
    expect(describeStepTiming(undefined, steps)).toBe('No timing set');
  });

  it('renders "On case start" for a zero-offset case_start anchor', () => {
    const timing: StepTiming = { anchor: { type: 'case_start' }, offsetDays: 0, fixed: false };
    expect(describeStepTiming(timing, steps)).toBe('On case start');
  });

  it('renders an offset-after-anchor phrase with a duration suffix for a step anchor', () => {
    const timing: StepTiming = {
      anchor: { type: 'step', stepKey: 'skills-assessment', edge: 'done' },
      offsetDays: 2,
      durationDays: { min: 28, max: 84 },
      fixed: false,
    };
    expect(describeStepTiming(timing, steps)).toBe('2 days after Skills assessment is done · takes 28–84 days');
  });

  it('renders a fixed/"set by law" step as a "Within N days of" window', () => {
    const timing: StepTiming = { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true };
    expect(describeStepTiming(timing, steps)).toBe('Within 60 days of invitation received');
  });

  it('singularizes a 1-day offset and 1-day duration', () => {
    const timing: StepTiming = {
      anchor: { type: 'previous_step' },
      offsetDays: 1,
      durationDays: { min: 1, max: 1 },
      fixed: false,
    };
    expect(describeStepTiming(timing, steps)).toBe('1 day after the previous step · takes 1 day');
  });

  it('falls back to a generic label when a step anchor points at an unknown key', () => {
    const timing: StepTiming = { anchor: { type: 'step', stepKey: 'nope', edge: 'start' }, offsetDays: 3, fixed: false };
    expect(describeStepOffset(timing, steps)).toBe('3 days after an earlier step starts');
  });

  it('omits the duration suffix when there is no durationDays', () => {
    const timing: StepTiming = { anchor: { type: 'case_start' }, offsetDays: 5, fixed: false };
    expect(describeStepDuration(timing)).toBeUndefined();
    expect(describeStepTiming(timing, steps)).toBe('5 days after case start');
  });
});

describe('formatTypicalLength', () => {
  it('reports same day when both ends are zero', () => {
    expect(formatTypicalLength({ minDays: 0, maxDays: 0 })).toBe('Typical length: same day');
  });

  it('reports days under two weeks', () => {
    expect(formatTypicalLength({ minDays: 3, maxDays: 10 })).toBe('Typical length: 3–10 days');
  });

  it('reports a single day value without a range', () => {
    expect(formatTypicalLength({ minDays: 1, maxDays: 1 })).toBe('Typical length: 1 day');
  });

  it('reports weeks between two weeks and two months', () => {
    expect(formatTypicalLength({ minDays: 14, maxDays: 42 })).toBe('Typical length: 2–6 weeks');
  });

  it('reports months at sixty days or more', () => {
    expect(formatTypicalLength({ minDays: 90, maxDays: 365 })).toBe('Typical length: 3–12 months');
  });

  it('collapses to a single month value when min and max round the same', () => {
    expect(formatTypicalLength({ minDays: 60, maxDays: 65 })).toBe('Typical length: 2 months');
  });
});
