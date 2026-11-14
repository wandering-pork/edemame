import { NOT_CONFIRMED_SUBCLASS, type CasePhase, type StepAnchor, type Task, type WorkflowStep } from '../types';
import { CONSULTATION_PHASE_KEY, SYSTEM_CASE_PHASES, sortCasePhases, visibleCasePhases } from './casePhases';
import { isTaskClosed } from './taskStatus';

/**
 * Phases on Work Plan steps and case tasks (Work Plans spec, step 3).
 *
 * A "phase ref" is how a step or task names its phase: a built-in phase's
 * `systemKey` ("consultation", "prerequisites"...) or a firm-added phase's
 * `id`. Using the systemKey for built-ins means system Work Plans
 * (`lib/seedData.ts`) can name phases without knowing any firm's ids, and a
 * renamed built-in phase keeps all its steps and tasks.
 *
 * Phases are separate from `Case.stage` (draft→closed), which is unchanged.
 */

export const phaseRef = (p: CasePhase): string => p.systemKey ?? p.id;

export function findPhase(phases: CasePhase[], ref: string | undefined | null): CasePhase | undefined {
  if (!ref) return undefined;
  return phases.find(p => p.systemKey === ref) ?? phases.find(p => p.id === ref);
}

/** Display name for a phase ref; falls back to the shipped name, then "Other". */
export function phaseName(phases: CasePhase[], ref: string | undefined | null): string {
  if (!ref) return 'Other';
  return findPhase(phases, ref)?.name ?? SYSTEM_CASE_PHASES.find(s => s.systemKey === ref)?.name ?? 'Other';
}

/** Sort rank of a phase ref in the firm's phase order. Unknown refs (a deleted phase) sort last. */
function phaseRank(phases: CasePhase[], ref: string): number {
  const sorted = sortCasePhases(phases);
  const i = sorted.findIndex(p => phaseRef(p) === ref || p.id === ref);
  if (i >= 0) return i;
  const s = SYSTEM_CASE_PHASES.findIndex(x => x.systemKey === ref);
  return s >= 0 ? 1000 + s : 10_000;
}

/**
 * Each step's effective phase, in step order: Not Confirmed plans are always
 * Consultation; otherwise a step's own phase, else the previous step's
 * effective phase ("by position"), else Consultation.
 */
export function resolveStepPhases(steps: Pick<WorkflowStep, 'phase'>[], visaSubclass?: string): string[] {
  if (visaSubclass === NOT_CONFIRMED_SUBCLASS) return steps.map(() => CONSULTATION_PHASE_KEY);
  const out: string[] = [];
  for (const s of steps) out.push(s.phase || out[out.length - 1] || CONSULTATION_PHASE_KEY);
  return out;
}

/**
 * Prepares a plan's steps for saving: fills in every step's effective phase,
 * then orders steps by phase (stable — steps keep their order within a phase).
 *
 * Before reordering, every `previous_step` timing anchor is rewritten as an
 * explicit "done of <that step>" anchor, which the scheduler treats the same
 * way (see `scheduleFromTemplate.ts`). Without this, moving a step into a
 * different phase would silently change which step it counts from.
 */
export function orderStepsByPhase(steps: WorkflowStep[], phases: CasePhase[], visaSubclass?: string): WorkflowStep[] {
  const effective = resolveStepPhases(steps, visaSubclass);
  const explicit = steps.map((s, i) => {
    const withPhase: WorkflowStep = { ...s, phase: effective[i] };
    if (s.timing?.anchor.type === 'previous_step' && i > 0) {
      const anchor: StepAnchor = { type: 'step', stepKey: steps[i - 1].key, edge: 'done' };
      withPhase.timing = { ...s.timing, anchor };
    }
    return withPhase;
  });
  return explicit
    .map((s, i) => ({ s, i, rank: phaseRank(phases, s.phase!) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(x => x.s);
}

/** True when ordering by phase would move at least one step. */
export function stepsOutOfPhaseOrder(steps: WorkflowStep[], phases: CasePhase[], visaSubclass?: string): boolean {
  const ordered = orderStepsByPhase(steps, phases, visaSubclass);
  return ordered.some((s, i) => s.key !== steps[i].key);
}

// ---------------------------------------------------------------------------
// Case tasks grouped by phase
// ---------------------------------------------------------------------------

export type PhaseGroupState = 'done' | 'current' | 'upcoming';

export interface PhaseGroup {
  ref: string;
  name: string;
  tasks: Task[];
  doneCount: number;
  state: PhaseGroupState;
}

export interface CasePhaseView {
  /** False for a case with no phase information at all (older AI-only plans) — show the flat list. */
  hasPhases: boolean;
  /** Non-empty phases only, in phase order. */
  groups: PhaseGroup[];
  /** First open task in phase order, then position. `null` when every task is closed. */
  currentTask: Task | null;
  /** Phase of the current task; the last phase with tasks once all are done; Consultation with no tasks. */
  currentPhaseRef: string;
  currentPhaseName: string;
}

/** Default task order within a phase: date, then priorityOrder (same as the Tasks tab). */
const byDate = (a: Task, b: Task) => a.date.localeCompare(b.date) || a.priorityOrder - b.priorityOrder;

/**
 * Each task's effective phase: its own `phase`, else its plan step's phase
 * (via `stepKey`), else the previous task's (in date order), else
 * Consultation. Not Confirmed cases are always Consultation.
 */
export function resolveTaskPhases(
  tasks: Task[],
  steps: WorkflowStep[] = [],
  visaSubclass?: string,
): Map<string, string> {
  const out = new Map<string, string>();
  const ordered = [...tasks].sort(byDate);
  if (visaSubclass === NOT_CONFIRMED_SUBCLASS) {
    for (const t of ordered) out.set(t.id, t.phase || CONSULTATION_PHASE_KEY);
    return out;
  }
  const stepPhases = resolveStepPhases(steps);
  const stepPhaseByKey = new Map(steps.map((s, i) => [s.key, stepPhases[i]]));
  let previous: string | undefined;
  for (const t of ordered) {
    const ref = t.phase || (t.stepKey ? stepPhaseByKey.get(t.stepKey) : undefined) || previous || CONSULTATION_PHASE_KEY;
    out.set(t.id, ref);
    previous = ref;
  }
  return out;
}

/** True when any task names a phase, directly or through its plan step. */
export function caseHasPhaseInfo(tasks: Task[], steps: WorkflowStep[] = []): boolean {
  const stepKeys = new Set(steps.filter(s => s.phase).map(s => s.key));
  return tasks.some(t => !!t.phase || (!!t.stepKey && stepKeys.has(t.stepKey)));
}

/**
 * Groups a case's tasks by phase for Case Details (Overview → Progress and
 * the Tasks tab). Only the current phase is meant to be unfolded.
 */
export function buildCasePhaseView(
  tasks: Task[],
  phases: CasePhase[],
  steps: WorkflowStep[] = [],
  visaSubclass?: string,
): CasePhaseView {
  const refs = resolveTaskPhases(tasks, steps, visaSubclass);
  const byPhase = new Map<string, Task[]>();
  for (const t of [...tasks].sort(byDate)) {
    const ref = refs.get(t.id)!;
    byPhase.set(ref, [...(byPhase.get(ref) ?? []), t]);
  }
  const orderedRefs = [...byPhase.keys()].sort((a, b) => phaseRank(phases, a) - phaseRank(phases, b));

  let currentTask: Task | null = null;
  for (const ref of orderedRefs) {
    currentTask = byPhase.get(ref)!.find(t => !isTaskClosed(t)) ?? null;
    if (currentTask) break;
  }
  const currentPhaseRef = currentTask
    ? refs.get(currentTask.id)!
    : orderedRefs[orderedRefs.length - 1] ?? CONSULTATION_PHASE_KEY;

  const groups: PhaseGroup[] = orderedRefs.map(ref => {
    const list = byPhase.get(ref)!;
    const doneCount = list.filter(isTaskClosed).length;
    const state: PhaseGroupState =
      currentTask && ref === currentPhaseRef ? 'current' : doneCount === list.length ? 'done' : 'upcoming';
    return { ref, name: phaseName(phases, ref), tasks: list, doneCount, state };
  });

  return {
    hasPhases: visaSubclass === NOT_CONFIRMED_SUBCLASS || caseHasPhaseInfo(tasks, steps),
    groups,
    currentTask,
    currentPhaseRef,
    currentPhaseName: phaseName(phases, currentPhaseRef),
  };
}

/**
 * Phases to offer when adding a task to a case: the phases the case's tasks
 * already use (in order), or every visible phase if it has none. Not
 * Confirmed cases only offer Consultation. The default is the case's current
 * phase.
 */
export function phaseChoicesForCase(
  tasks: Task[],
  phases: CasePhase[],
  steps: WorkflowStep[] = [],
  visaSubclass?: string,
): { options: { ref: string; name: string }[]; defaultRef: string; locked: boolean } {
  if (visaSubclass === NOT_CONFIRMED_SUBCLASS) {
    return {
      options: [{ ref: CONSULTATION_PHASE_KEY, name: phaseName(phases, CONSULTATION_PHASE_KEY) }],
      defaultRef: CONSULTATION_PHASE_KEY,
      locked: true,
    };
  }
  const view = buildCasePhaseView(tasks, phases, steps, visaSubclass);
  const options = view.hasPhases && view.groups.length > 0
    ? view.groups.map(g => ({ ref: g.ref, name: g.name }))
    : visibleCasePhases(phases).map(p => ({ ref: phaseRef(p), name: p.name }));
  const defaultRef = options.some(o => o.ref === view.currentPhaseRef) ? view.currentPhaseRef : options[0]?.ref ?? CONSULTATION_PHASE_KEY;
  return { options, defaultRef, locked: false };
}

/** Per-phase progress for a compact bar (Case Manager rows): one segment per non-empty phase. */
export function phaseProgressSegments(view: CasePhaseView): { ref: string; name: string; done: number; total: number; current: boolean }[] {
  return view.groups.map(g => ({ ref: g.ref, name: g.name, done: g.doneCount, total: g.tasks.length, current: g.state === 'current' }));
}
