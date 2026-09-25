import { describe, it, expect } from 'vitest';
import { buildGapTasks, gapTaskTitle } from './gapTasks';

describe('gapTaskTitle', () => {
  it('prefixes the gap with "Address gap: "', () => {
    expect(gapTaskTitle('Skills assessment not yet completed')).toBe(
      'Address gap: Skills assessment not yet completed'
    );
  });

  it('does not truncate short gaps', () => {
    expect(gapTaskTitle('Short gap')).toBe('Address gap: Short gap');
  });

  it('stops at the first clause, dropping a parenthetical detail', () => {
    const gap = 'Estimated points score is currently too low (approx. 50 points: Age 25 + Qualifications 15 + English 10)';
    const title = gapTaskTitle(gap);
    expect(title).toBe('Address gap: Estimated points score is currently too low');
    expect(title).not.toContain('(');
    expect(title.length).toBeLessThanOrEqual(62);
  });

  it('stops at a sentence-ending period, dropping the rest of the sentence', () => {
    const gap = 'English test not yet sat. IELTS or PTE results are required before lodgement.';
    expect(gapTaskTitle(gap)).toBe('Address gap: English test not yet sat');
  });

  it('truncates a long single clause at a whole word, never mid-word or mid-number, and marks it with an ellipsis', () => {
    const longGap = 'Applicant needs to gather substantially more supporting evidence of a genuine and continuing relationship spanning several years';
    const title = gapTaskTitle(longGap);
    expect(title.startsWith('Address gap: ')).toBe(true);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(65);
    // No partial word right before the ellipsis.
    const clause = title.replace('Address gap: ', '').replace('…', '');
    expect(longGap.startsWith(clause)).toBe(true);
    expect(longGap[clause.length]).toBe(' ');
  });

  it('never cuts a title in the middle of a number', () => {
    const longGap = 'Requires 12345678901234567890 continuous days of employment history before this gap can be closed';
    const title = gapTaskTitle(longGap);
    expect(title).not.toMatch(/\d…/);
  });
});

describe('buildGapTasks', () => {
  const gaps = ['English test not yet sat', 'Skills assessment pending'];

  it('builds one task per gap', () => {
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => 'fixed-id');
    expect(tasks).toHaveLength(2);
  });

  it('dates each task 7 days after the case start date', () => {
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => 'fixed-id');
    expect(tasks.every(t => t.date === '2026-01-08')).toBe(true);
  });

  it('sets the full gap text as the description and a truncated title', () => {
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => 'fixed-id');
    expect(tasks[0].description).toBe(gaps[0]);
    expect(tasks[0].title).toBe(`Address gap: ${gaps[0]}`);
  });

  it('marks tasks as fixed (not AI-generated) and assigns the caseId', () => {
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => 'fixed-id');
    expect(tasks.every(t => t.generatedByAi === false)).toBe(true);
    expect(tasks.every(t => t.caseId === 'case-1')).toBe(true);
    expect(tasks.every(t => t.isCompleted === false)).toBe(true);
  });

  it('orders tasks by priorityOrder matching the gaps order', () => {
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => 'fixed-id');
    expect(tasks[0].priorityOrder).toBe(0);
    expect(tasks[1].priorityOrder).toBe(1);
  });

  it('returns an empty array for no gaps', () => {
    expect(buildGapTasks([], 'case-1', '2026-01-01')).toEqual([]);
  });

  it('uses the provided id generator for each task', () => {
    let n = 0;
    const tasks = buildGapTasks(gaps, 'case-1', '2026-01-01', () => `id-${n++}`);
    expect(tasks[0].id).toBe('id-0');
    expect(tasks[1].id).toBe('id-1');
  });
});
