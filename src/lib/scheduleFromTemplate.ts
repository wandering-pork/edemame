import type { DeadlineKind, StepAnchor, StepTiming } from '../types';
import { addDaysISO, diffDaysISO } from './dates';

/**
 * Scheduler input step shape. Deliberately its own type rather than reusing
 * `WorkflowStep` from `types.ts` — this lib only needs `key`/`timing`/`isGate`
 * (plus title/description to carry through to the output), and keeping it
 * separate means this file has no dependency on `Task`/`Case`, which other
 * agents are editing in parallel this slice (see 1E scope note).
 */
export interface ScheduleStep {
  key: string;
  title: string;
  description: string;
  timing?: StepTiming;
  isGate?: boolean;
}

/** Dates already known for anchors this schedule run can resolve against. */
export interface KnownAnchors {
  /** A deadline's actual due date, keyed by `DeadlineKind` (1D). */
  deadlineDates?: Partial<Record<DeadlineKind, string>>;
  /** A step's actual "done" date, keyed by `ScheduleStep.key`. */
  stepDoneDates?: Record<string, string>;
}

export interface ScheduledItem {
  stepKey: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  /** True when `date` is provisional — computed from a duration estimate because the real anchor date isn't known yet. */
  datePending: boolean;
  /** Set by law — carried through from `StepTiming.fixed` (false for steps with no `timing`). */
  fixed: boolean;
  isGate: boolean;
  durationDays?: { min: number; max: number };
}

export type ScheduleErrorType = 'cycle' | 'missing_step_key' | 'duplicate_step_key';

export interface ScheduleError {
  type: ScheduleErrorType;
  stepKey: string;
  message: string;
}

export interface ScheduleResult {
  items: ScheduledItem[];
  errors: ScheduleError[];
}

/**
 * A step with no `timing` (old/custom template, see `WorkflowStep.timing`'s
 * doc comment) gets this synthetic timing so the scheduler still produces a
 * usable date: anchored to case start, offset by its 1-based position in the
 * steps array. The `+1` (not `+index`, which would put the first step on day
 * 0) is deliberate — one of this slice's fixes is that new cases shouldn't
 * open with an already-"overdue" task (see plan's "No day-0" rule). Always
 * `datePending: true` since this is a placeholder, not real timing data.
 */
function defaultTiming(index: number): StepTiming {
  return { anchor: { type: 'case_start' }, offsetDays: index + 1, fixed: false };
}

/**
 * Resolves the fallback number of days to add onto a step's own date when
 * something anchors on that step's 'done' edge (or 'previous_step', which is
 * defined as anchoring on the immediately preceding step's 'done' edge) and
 * no actual completion date is known yet.
 *
 * Rule chosen (documented per the plan's "pick one rule, document it, test
 * it"): use the step's estimated max duration — i.e. assume the step takes as
 * long as it plausibly could, rather than the midpoint or the min. This is
 * deliberately conservative: chaining off an optimistic estimate is exactly
 * how a plan ends up back-loaded with dates that are already overdue the
 * moment a step overruns, which is the same complaint 1E exists to fix for
 * case-start offsets. Falls back to `min` if only that's given, else 0 (chain
 * immediately off the step's own date).
 */
function fallbackChainDays(durationDays?: { min: number; max: number }): number {
  if (!durationDays) return 0;
  return durationDays.max ?? durationDays.min ?? 0;
}

interface Resolution {
  date: string;
  pending: boolean;
}

/**
 * Pure scheduler: turns a template's steps into one dated item per step.
 *
 * - `case_start` anchors offset from `caseStartDate`.
 * - `previous_step` anchors off the immediately preceding step in the array
 *   (or `caseStartDate` if it's the first step), using `fallbackChainDays` to
 *   estimate how long that prior step takes. Unlike an explicit `step`
 *   anchor, `previous_step` has no way to name a known completion date, so
 *   it is always `datePending: true` — even once the prior step is actually
 *   done (at which point the same information is better expressed as an
 *   explicit `step`/'done' anchor, or the caller should be using
 *   `reschedule`, which locks a closed step's own item to its real date).
 * - `step` anchors: `edge: 'start'` uses the target step's own resolved date
 *   directly; `edge: 'done'` uses `knownAnchors.stepDoneDates[stepKey]` when
 *   present, else `fallbackChainDays` off the target's date, and is marked
 *   `datePending: true` in that case.
 * - `deadline` anchors use `knownAnchors.deadlineDates[kind]` when present;
 *   otherwise there is no real anchor date to offset from yet, so the
 *   provisional anchor is the furthest date any step has resolved to so far
 *   in this schedule run (falling back to `caseStartDate` if nothing has
 *   resolved yet) — the plan's "unknown → provisional date from estimates,
 *   datePending true". This is deliberately *not* always `caseStartDate`:
 *   a deadline anchor (e.g. an invitation window) is typically reached only
 *   after a chain of earlier steps (skills assessment, EOI, etc.) — resetting
 *   to case start would silently drop that chain's elapsed time and schedule
 *   (and, via `typicalLength`, report) the deadline-anchored step and
 *   everything after it far too early. Bounding by the running high-water
 *   mark keeps a template with no steps before the deadline anchor behaving
 *   exactly as before (nothing resolved yet ⇒ `caseStartDate`, same as a
 *   template's very first step).
 *
 * No item lands on day 0 relative to its anchor unless `offsetDays` is
 * explicitly 0 — that falls directly out of `date = anchor + offsetDays`, so
 * a step whose author wants "same day as anchor" writes `offsetDays: 0`
 * explicitly rather than it happening by accident (see `defaultTiming`).
 *
 * Detects two error conditions instead of throwing: an anchor cycle (a chain
 * of `step`/`previous_step` anchors that loops back on itself) and a `step`
 * anchor pointing at a `stepKey` that isn't in `steps`. Both still produce a
 * best-effort item (anchored to `caseStartDate`, `datePending: true`) so one
 * bad step doesn't blank out the whole schedule.
 */
export function scheduleFromTemplate(
  steps: ScheduleStep[],
  caseStartDate: string,
  knownAnchors: KnownAnchors = {},
): ScheduleResult {
  const errors: ScheduleError[] = [];
  const stepsByKey = new Map<string, ScheduleStep>();
  const indexByKey = new Map<string, number>();

  steps.forEach((step, index) => {
    if (stepsByKey.has(step.key)) {
      errors.push({
        type: 'duplicate_step_key',
        stepKey: step.key,
        message: `Step key "${step.key}" is used by more than one step; only the first is schedulable.`,
      });
      return;
    }
    stepsByKey.set(step.key, step);
    indexByKey.set(step.key, index);
  });

  const resolved = new Map<string, Resolution>();
  const cycleReported = new Set<string>();
  // Running high-water mark of every date resolved so far in this run — see
  // the 'deadline' case below.
  let latestResolvedDate = caseStartDate;

  function resolve(key: string, chain: string[]): Resolution {
    const cached = resolved.get(key);
    if (cached) return cached;

    if (chain.includes(key)) {
      if (!cycleReported.has(key)) {
        cycleReported.add(key);
        errors.push({
          type: 'cycle',
          stepKey: key,
          message: `Anchor cycle detected: ${[...chain, key].join(' -> ')}.`,
        });
      }
      // Break the cycle with a best-effort placeholder rather than recursing forever.
      const broken: Resolution = { date: caseStartDate, pending: true };
      resolved.set(key, broken);
      return broken;
    }

    const step = stepsByKey.get(key);
    const index = indexByKey.get(key) ?? 0;
    const usedDefaultTiming = !step?.timing;
    const timing = step?.timing ?? defaultTiming(index);
    const nextChain = [...chain, key];

    let anchorDate: string;
    // A step with no `timing` at all has no real anchor data behind it — its
    // date is always provisional, same as any other "no known anchor yet" case below.
    let pending = usedDefaultTiming;

    switch (timing.anchor.type) {
      case 'case_start': {
        anchorDate = caseStartDate;
        break;
      }
      case 'previous_step': {
        const prevStep = index > 0 ? steps[index - 1] : undefined;
        if (!prevStep) {
          anchorDate = caseStartDate;
        } else {
          const prevResolution = resolve(prevStep.key, nextChain);
          const days = fallbackChainDays(prevStep.timing?.durationDays);
          anchorDate = addDaysISO(prevResolution.date, days);
          // Chaining off the previous step's date is always an estimate —
          // there's no "known done date" concept for `previous_step` the way
          // there is for an explicit `step`/'done' anchor (see below), so this
          // is provisional even when `days` is 0.
          pending = true;
        }
        break;
      }
      case 'step': {
        const target = stepsByKey.get(timing.anchor.stepKey);
        if (!target) {
          errors.push({
            type: 'missing_step_key',
            stepKey: timing.anchor.stepKey,
            message: `Step "${key}" anchors on unknown step key "${timing.anchor.stepKey}".`,
          });
          anchorDate = caseStartDate;
          pending = true;
        } else {
          const targetResolution = resolve(target.key, nextChain);
          if (timing.anchor.edge === 'start') {
            anchorDate = targetResolution.date;
            pending = targetResolution.pending;
          } else {
            const knownDone = knownAnchors.stepDoneDates?.[target.key];
            if (knownDone) {
              anchorDate = knownDone;
              pending = false;
            } else {
              anchorDate = addDaysISO(targetResolution.date, fallbackChainDays(target.timing?.durationDays));
              pending = true;
            }
          }
        }
        break;
      }
      case 'deadline': {
        const knownDate = knownAnchors.deadlineDates?.[timing.anchor.kind];
        if (knownDate) {
          anchorDate = knownDate;
          pending = false;
        } else {
          // No known date for this deadline yet — provisionally anchor off
          // the furthest point the plan has reached so far (see doc comment
          // above), not `caseStartDate`, so the chain of steps that actually
          // leads up to this deadline isn't silently discarded.
          anchorDate = latestResolvedDate;
          pending = true;
        }
        break;
      }
      default: {
        // Exhaustiveness guard — StepAnchor is a closed union.
        const _never: never = timing.anchor;
        void _never;
        anchorDate = caseStartDate;
        pending = true;
      }
    }

    const date = addDaysISO(anchorDate, timing.offsetDays);
    const result: Resolution = { date, pending };
    resolved.set(key, result);
    if (date > latestResolvedDate) latestResolvedDate = date;
    return result;
  }

  const items: ScheduledItem[] = [];
  steps.forEach((step, index) => {
    if (indexByKey.get(step.key) !== index) return; // duplicate, already errored — skip
    const timing = step.timing ?? defaultTiming(index);
    const { date, pending } = resolve(step.key, []);
    items.push({
      stepKey: step.key,
      title: step.title,
      description: step.description,
      date,
      datePending: pending,
      fixed: timing.fixed,
      isGate: step.isGate ?? false,
      durationDays: timing.durationDays,
    });
  });

  return { items, errors };
}

// ---------------------------------------------------------------------------
// reschedule
// ---------------------------------------------------------------------------

/** Minimal shape `reschedule` needs from an existing task, by its `stepKey`. */
export interface RescheduleTask {
  stepKey: string;
  date: string;
  /** A manual date edit — never recalculated. */
  dateLocked?: boolean;
  /** Done or not_applicable — never recalculated, and its `date` feeds other steps' 'done'-edge anchors. */
  isClosed?: boolean;
}

/**
 * Recomputes a schedule, but only for tasks that are still open (not closed)
 * and not `dateLocked`. Locked or closed tasks keep their existing date
 * exactly — the plan's "recalculates only open tasks where `dateLocked` is
 * false". Closed tasks additionally feed back in as a known step-done anchor
 * (a step marked done gives every `step`/`previous_step` anchor pointing at
 * its 'done' edge a real date instead of a duration estimate), which is the
 * scenario this function exists for: "It runs when an anchor becomes known,
 * i.e. a step is marked done or a deadline is added."
 *
 * `existingTasks` need not cover every step — a step with no matching task is
 * scheduled fresh, same as `scheduleFromTemplate`.
 */
export function reschedule(
  steps: ScheduleStep[],
  caseStartDate: string,
  knownAnchors: KnownAnchors,
  existingTasks: RescheduleTask[],
): ScheduleResult {
  const byStepKey = new Map(existingTasks.map(t => [t.stepKey, t]));

  const mergedAnchors: KnownAnchors = {
    ...knownAnchors,
    stepDoneDates: { ...knownAnchors.stepDoneDates },
  };
  for (const task of existingTasks) {
    if (task.isClosed) {
      mergedAnchors.stepDoneDates![task.stepKey] = task.date;
    }
  }

  const result = scheduleFromTemplate(steps, caseStartDate, mergedAnchors);

  const items = result.items.map(item => {
    const existing = byStepKey.get(item.stepKey);
    if (existing && (existing.isClosed || existing.dateLocked)) {
      return { ...item, date: existing.date, datePending: false };
    }
    return item;
  });

  return { items, errors: result.errors };
}

// ---------------------------------------------------------------------------
// typicalLength
// ---------------------------------------------------------------------------

export interface TypicalLength {
  minDays: number;
  maxDays: number;
}

/** Arbitrary fixed reference start date used only to measure elapsed days — never surfaced. */
const REFERENCE_START = '2000-01-01';

/**
 * Same resolution algorithm as `scheduleFromTemplate`, but the fallback
 * chaining duration (see `fallbackChainDays`) is parameterised so callers can
 * ask for the min-duration and max-duration ends of the range separately.
 * Not exported — `scheduleFromTemplate` always uses the conservative `'max'`
 * behaviour documented on `fallbackChainDays`; only `typicalLength` needs the
 * `'min'` variant, to report a real range rather than a single number.
 */
function scheduleWithDurationMode(steps: ScheduleStep[], mode: 'min' | 'max'): ScheduleResult {
  if (mode === 'max') {
    return scheduleFromTemplate(steps, REFERENCE_START, {});
  }
  // Swap each step's own duration estimate so `fallbackChainDays` resolves to
  // the min side, then delegate to the normal algorithm.
  const minSteps = steps.map(step => {
    if (!step.timing?.durationDays) return step;
    const { min } = step.timing.durationDays;
    return {
      ...step,
      timing: { ...step.timing, durationDays: { min, max: min } },
    };
  });
  return scheduleFromTemplate(minSteps, REFERENCE_START, {});
}

/**
 * The Templates page header's "Typical length: X–Y" figure: runs the
 * scheduler with every step's duration estimate pinned to its min, then again
 * pinned to its max, and reports the elapsed days from the first step to the
 * last (by whichever ends up latest — steps aren't guaranteed to be scheduled
 * in array order once `step` anchors are involved).
 *
 * A template with no steps, or where every step resolves to the reference
 * start date, returns `{ minDays: 0, maxDays: 0 }`.
 */
export function typicalLength(steps: ScheduleStep[]): TypicalLength {
  if (steps.length === 0) return { minDays: 0, maxDays: 0 };

  const minResult = scheduleWithDurationMode(steps, 'min');
  const maxResult = scheduleWithDurationMode(steps, 'max');

  const latestOffset = (items: ScheduledItem[]): number =>
    items.reduce((max, item) => Math.max(max, diffDaysISO(REFERENCE_START, item.date)), 0);

  return {
    minDays: latestOffset(minResult.items),
    maxDays: latestOffset(maxResult.items),
  };
}
