import { describe, it, expect } from 'vitest';
import { scheduleFromTemplate, reschedule, typicalLength, type ScheduleStep } from './scheduleFromTemplate';
import { addDaysISO } from './dates';

const START = '2026-01-01';

function step(partial: Partial<ScheduleStep> & { key: string; title: string }): ScheduleStep {
  return {
    description: '',
    ...partial,
  };
}

describe('scheduleFromTemplate', () => {
  it('schedules a case_start anchor by its offset', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 5, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe(addDaysISO(START, 5));
    expect(items[0].datePending).toBe(false);
    expect(items[0].fixed).toBe(false);
  });

  it('does not land on day 0 unless offsetDays is explicitly 0', () => {
    const zeroOffset: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 0, fixed: false } }),
    ];
    expect(scheduleFromTemplate(zeroOffset, START, {}).items[0].date).toBe(START);

    // A step with no timing at all (legacy/custom template) must NOT default to day 0 —
    // this is the "new cases open with an overdue task" bug 1E exists to fix.
    const noTiming: ScheduleStep[] = [step({ key: 'a', title: 'A' })];
    const result = scheduleFromTemplate(noTiming, START, {});
    expect(result.items[0].date).not.toBe(START);
    expect(result.items[0].date > START).toBe(true);
    expect(result.items[0].datePending).toBe(true);
  });

  it('chains previous_step off the prior step using its max duration when done date is unknown', () => {
    const steps: ScheduleStep[] = [
      step({
        key: 'a',
        title: 'A',
        timing: { anchor: { type: 'case_start' }, offsetDays: 2, durationDays: { min: 10, max: 20 }, fixed: false },
      }),
      step({
        key: 'b',
        title: 'B',
        timing: { anchor: { type: 'previous_step' }, offsetDays: 3, fixed: false },
      }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toEqual([]);
    const aDate = addDaysISO(START, 2);
    // b = a.date + a.durationDays.max (20) + b.offsetDays (3)
    const expectedB = addDaysISO(addDaysISO(aDate, 20), 3);
    expect(items[0].date).toBe(aDate);
    expect(items[1].date).toBe(expectedB);
    expect(items[1].datePending).toBe(true); // chained through an unknown done date
  });

  it('previous_step for the first step falls back to case_start', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'previous_step' }, offsetDays: 4, fixed: false } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    expect(items[0].date).toBe(addDaysISO(START, 4));
  });

  it('step anchor on the "start" edge uses the target step\'s own date directly', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 5, fixed: false } }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'start' }, offsetDays: 1, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toEqual([]);
    expect(items[1].date).toBe(addDaysISO(items[0].date, 1));
    expect(items[1].datePending).toBe(false);
  });

  it('step anchor on the "done" edge uses a known done date when provided', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 5, durationDays: { min: 1, max: 99 }, fixed: false } }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'done' }, offsetDays: 2, fixed: false } }),
    ];
    const knownDone = '2026-02-01';
    const { items, errors } = scheduleFromTemplate(steps, START, { stepDoneDates: { a: knownDone } });
    expect(errors).toEqual([]);
    expect(items[1].date).toBe(addDaysISO(knownDone, 2));
    expect(items[1].datePending).toBe(false);
  });

  it('step anchor on the "done" edge with no known done date is provisional, using max duration', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 0, durationDays: { min: 10, max: 30 }, fixed: false } }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'done' }, offsetDays: 0, fixed: false } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    expect(items[1].date).toBe(addDaysISO(START, 30));
    expect(items[1].datePending).toBe(true);
  });

  it('deadline anchor with a known date offsets from it and is not pending', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'Lodge', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true } }),
    ];
    const invitationDate = '2026-03-01';
    const { items } = scheduleFromTemplate(steps, START, { deadlineDates: { invitation_window: invitationDate } });
    expect(items[0].date).toBe(addDaysISO(invitationDate, 60));
    expect(items[0].datePending).toBe(false);
    expect(items[0].fixed).toBe(true);
  });

  it('deadline anchor with no known date is provisional off case start when it is the first step', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'Lodge', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    expect(items[0].date).toBe(addDaysISO(START, 60));
    expect(items[0].datePending).toBe(true);
  });

  it('deadline anchor with no known date is provisional off the furthest point the plan has already reached, not case start', () => {
    // Regression test for a real bug: a template's Templates-page "Typical
    // length" (and a live case's actual task dates) for e.g. Subclass 189
    // silently discarded the whole skills-assessment → EOI → invitation
    // chain once it hit the "lodge within 60 days of invitation" deadline
    // anchor, because that anchor reset all the way back to case start
    // instead of picking up from wherever the plan had actually reached.
    const steps: ScheduleStep[] = [
      step({ key: 'assessment', title: 'Skills assessment', timing: { anchor: { type: 'case_start' }, offsetDays: 1, durationDays: { min: 28, max: 84 }, fixed: false } }),
      step({ key: 'invitation', title: 'Invitation to apply', timing: { anchor: { type: 'step', stepKey: 'assessment', edge: 'done' }, offsetDays: 3, durationDays: { min: 14, max: 90 }, fixed: false } }),
      step({ key: 'lodge', title: 'Lodge visa application', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    const invitation = items.find(i => i.stepKey === 'invitation')!;
    const lodge = items.find(i => i.stepKey === 'lodge')!;
    // "assessment" has no known done date, so "invitation" chains off its max
    // duration estimate (84 days) — it must land well after case start...
    expect(invitation.date).toBe(addDaysISO(START, 1 + 84 + 3));
    // ...and "lodge" (the unknown deadline anchor) must not reset earlier
    // than that — it should be anchored on the furthest point reached so
    // far ("invitation"'s date), not on caseStartDate.
    expect(lodge.date).toBe(addDaysISO(invitation.date, 60));
    expect(lodge.date > addDaysISO(START, 60)).toBe(true);
    expect(lodge.datePending).toBe(true);
  });

  it('a step chained after an unknown deadline anchor still lands after it, not back near case start', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'assessment', title: 'Skills assessment', timing: { anchor: { type: 'case_start' }, offsetDays: 1, durationDays: { min: 28, max: 84 }, fixed: false } }),
      step({ key: 'lodge', title: 'Lodge visa application', timing: { anchor: { type: 'deadline', kind: 'invitation_window' }, offsetDays: 60, fixed: true } }),
      step({ key: 'grant', title: 'Grant', timing: { anchor: { type: 'previous_step' }, offsetDays: 5, fixed: false } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    const lodge = items.find(i => i.stepKey === 'lodge')!;
    const grant = items.find(i => i.stepKey === 'grant')!;
    expect(grant.date).toBe(addDaysISO(lodge.date, 5));
    expect(grant.date > addDaysISO(START, 60)).toBe(true);
  });

  it('detects a missing stepKey without throwing', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'step', stepKey: 'ghost', edge: 'start' }, offsetDays: 1, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe('missing_step_key');
    expect(errors[0].stepKey).toBe('ghost');
    expect(items).toHaveLength(1); // still produces a best-effort item
    expect(items[0].datePending).toBe(true);
  });

  it('detects a duplicate stepKey without throwing', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } }),
      step({ key: 'a', title: 'A again', timing: { anchor: { type: 'case_start' }, offsetDays: 2, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe('duplicate_step_key');
    expect(items).toHaveLength(1); // only the first "a" is schedulable
  });

  it('detects a direct anchor cycle without throwing or hanging', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'step', stepKey: 'b', edge: 'start' }, offsetDays: 1, fixed: false } }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'start' }, offsetDays: 1, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors.some(e => e.type === 'cycle')).toBe(true);
    expect(items).toHaveLength(2);
    // Best-effort: cycle is broken by falling back to case start for the step revisited.
    items.forEach(item => expect(item.datePending).toBe(true));
  });

  it('detects a longer indirect cycle (a -> b -> c -> a)', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'step', stepKey: 'c', edge: 'start' }, offsetDays: 1, fixed: false } }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'start' }, offsetDays: 1, fixed: false } }),
      step({ key: 'c', title: 'C', timing: { anchor: { type: 'step', stepKey: 'b', edge: 'start' }, offsetDays: 1, fixed: false } }),
    ];
    const { errors } = scheduleFromTemplate(steps, START, {});
    expect(errors.some(e => e.type === 'cycle')).toBe(true);
  });

  it('carries isGate and durationDays through to the output', () => {
    const steps: ScheduleStep[] = [
      step({
        key: 'a',
        title: 'A',
        isGate: true,
        timing: { anchor: { type: 'case_start' }, offsetDays: 1, durationDays: { min: 2, max: 4 }, fixed: false },
      }),
      step({ key: 'b', title: 'B', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } }),
    ];
    const { items } = scheduleFromTemplate(steps, START, {});
    expect(items[0].isGate).toBe(true);
    expect(items[0].durationDays).toEqual({ min: 2, max: 4 });
    expect(items[1].isGate).toBe(false);
  });

  it('a long chain of case_start-independent steps schedules correctly end to end', () => {
    const steps: ScheduleStep[] = [
      step({ key: 's1', title: 'S1', timing: { anchor: { type: 'case_start' }, offsetDays: 1, fixed: false } }),
      step({ key: 's2', title: 'S2', timing: { anchor: { type: 'previous_step' }, offsetDays: 2, fixed: false } }),
      step({ key: 's3', title: 'S3', timing: { anchor: { type: 'previous_step' }, offsetDays: 3, fixed: false } }),
      step({ key: 's4', title: 'S4', timing: { anchor: { type: 'step', stepKey: 's1', edge: 'start' }, offsetDays: 10, fixed: false } }),
    ];
    const { items, errors } = scheduleFromTemplate(steps, START, {});
    expect(errors).toEqual([]);
    expect(items[0].date).toBe(addDaysISO(START, 1));
    expect(items[1].date).toBe(addDaysISO(items[0].date, 2)); // no duration on s1, so 0 chain days
    expect(items[2].date).toBe(addDaysISO(items[1].date, 3));
    expect(items[3].date).toBe(addDaysISO(items[0].date, 10));
  });
});

describe('reschedule', () => {
  const steps: ScheduleStep[] = [
    step({
      key: 'a',
      title: 'A',
      timing: { anchor: { type: 'case_start' }, offsetDays: 5, durationDays: { min: 5, max: 10 }, fixed: false },
    }),
    step({ key: 'b', title: 'B', timing: { anchor: { type: 'step', stepKey: 'a', edge: 'done' }, offsetDays: 2, fixed: false } }),
    step({ key: 'c', title: 'C', timing: { anchor: { type: 'case_start' }, offsetDays: 20, fixed: false } }),
  ];

  it('recalculates open, unlocked tasks the same as a fresh schedule', () => {
    const { items } = reschedule(steps, START, {}, []);
    const fresh = scheduleFromTemplate(steps, START, {});
    expect(items).toEqual(fresh.items);
  });

  it('preserves a dateLocked task\'s date exactly, even though it would otherwise recalculate', () => {
    const lockedDate = '2099-12-25';
    const { items } = reschedule(steps, START, {}, [
      { stepKey: 'c', date: lockedDate, dateLocked: true },
    ]);
    const c = items.find(i => i.stepKey === 'c')!;
    expect(c.date).toBe(lockedDate);
    expect(c.datePending).toBe(false);
  });

  it('preserves a closed task\'s date and feeds it back in as a known done anchor for dependents', () => {
    const doneDate = addDaysISO(START, 7); // step "a" finished early
    const { items, errors } = reschedule(steps, START, {}, [
      { stepKey: 'a', date: doneDate, isClosed: true },
    ]);
    expect(errors).toEqual([]);
    const a = items.find(i => i.stepKey === 'a')!;
    const b = items.find(i => i.stepKey === 'b')!;
    expect(a.date).toBe(doneDate); // preserved, not recalculated off its offset
    expect(b.date).toBe(addDaysISO(doneDate, 2)); // b's 'done' anchor now uses the real date
    expect(b.datePending).toBe(false);
  });

  it('a task with no matching existing entry is scheduled fresh', () => {
    const { items } = reschedule(steps, START, {}, [{ stepKey: 'zzz-unrelated', date: '2020-01-01', dateLocked: true }]);
    const fresh = scheduleFromTemplate(steps, START, {});
    expect(items).toEqual(fresh.items);
  });
});

describe('typicalLength', () => {
  it('returns zero for a template with no steps', () => {
    expect(typicalLength([])).toEqual({ minDays: 0, maxDays: 0 });
  });

  it('computes a range from chained duration estimates', () => {
    const steps: ScheduleStep[] = [
      step({
        key: 'a',
        title: 'A',
        timing: { anchor: { type: 'case_start' }, offsetDays: 1, durationDays: { min: 10, max: 20 }, fixed: false },
      }),
      step({
        key: 'b',
        title: 'B',
        timing: { anchor: { type: 'previous_step' }, offsetDays: 1, fixed: false },
      }),
    ];
    const { minDays, maxDays } = typicalLength(steps);
    // b = a.offset(1) + a.duration + b.offset(1)
    expect(minDays).toBe(1 + 10 + 1);
    expect(maxDays).toBe(1 + 20 + 1);
    expect(minDays).toBeLessThan(maxDays);
  });

  it('a single fixed-offset step with no duration gives an equal min/max', () => {
    const steps: ScheduleStep[] = [
      step({ key: 'a', title: 'A', timing: { anchor: { type: 'case_start' }, offsetDays: 7, fixed: false } }),
    ];
    const { minDays, maxDays } = typicalLength(steps);
    expect(minDays).toBe(7);
    expect(maxDays).toBe(7);
  });
});
