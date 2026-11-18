import type { CasePhase, CaseStage } from '../types';
import { CASE_STAGE_LABELS } from './caseStage';
import { CONSULTATION_PHASE_KEY, sortCasePhases } from './casePhases';
import { phaseRef, type CasePhaseView } from './phaseGrouping';

/**
 * The case's Stage follows its tasks.
 *
 * Case Details shows one read-only **Stage**: the phase of the current task
 * (`lib/phaseGrouping.ts`'s `buildCasePhaseView()`). The older manual
 * `Case.stage` (draft→closed) is no longer picked by hand; it's kept in step
 * with that phase automatically (App.tsx), because the Case Manager's stage
 * filters and row chip, and the "ready to lodge" At Risk rule, still read it.
 * Only closing (with an outcome) and reopening a case set it directly.
 */

/** Which `CaseStage` each built-in phase means. */
const STAGE_FOR_BUILT_IN_PHASE: Record<string, CaseStage> = {
  [CONSULTATION_PHASE_KEY]: 'assessment',
  prerequisites: 'preparing',
  preparing: 'preparing',
  ready_to_lodge: 'ready_to_lodge',
  lodged: 'lodged',
  decision: 'decision',
  post_decision: 'decision',
};

/** Early stages that all count as "still in Consultation" — left alone rather than flattened to Assessment. */
const CONSULTATION_STAGES = new Set<CaseStage>(['draft', 'assessment', 'engaged']);

/**
 * The built-in phase key a phase ref counts as: its own key for a built-in
 * phase; for a firm-added phase, the nearest built-in phase before it in the
 * firm's phase order (Consultation if none). Unknown refs count as
 * Consultation.
 */
export function builtInPhaseFor(ref: string, phases: CasePhase[]): string {
  if (STAGE_FOR_BUILT_IN_PHASE[ref]) return ref;
  const sorted = sortCasePhases(phases);
  const i = sorted.findIndex(p => phaseRef(p) === ref || p.id === ref);
  for (let j = i; j >= 0; j--) {
    const key = sorted[j].systemKey;
    if (key && STAGE_FOR_BUILT_IN_PHASE[key]) return key;
  }
  return CONSULTATION_PHASE_KEY;
}

/** The `CaseStage` a phase ref maps to (ignoring the case's current stage). */
export function stageForPhase(ref: string, phases: CasePhase[]): CaseStage {
  return STAGE_FOR_BUILT_IN_PHASE[builtInPhaseFor(ref, phases)];
}

/**
 * The stage a case should be at given its tasks, or `null` to leave it as is:
 * closed cases (only Reopen moves them), cases with no phase information
 * (older AI-only plans, or no tasks yet), Consultation while the case is
 * still at an early stage, and Lodged while it's at Information requested.
 */
export function syncedCaseStage(current: CaseStage, view: CasePhaseView, phases: CasePhase[]): CaseStage | null {
  if (current === 'closed' || !view.hasPhases) return null;
  const target = stageForPhase(view.currentPhaseRef, phases);
  if (target === 'assessment' && CONSULTATION_STAGES.has(current)) return null;
  if (target === 'lodged' && current === 'info_requested') return null;
  return target === current ? null : target;
}

/** Stage to reopen a closed case at: where its tasks are, else Preparing. */
export function reopenStage(view: CasePhaseView, phases: CasePhase[]): CaseStage {
  return view.hasPhases ? stageForPhase(view.currentPhaseRef, phases) : 'preparing';
}

/**
 * Top-bar label for the task-based stage: "Stage 2 of 4 · Prerequisites",
 * counting only the phases this case has tasks in (the groups on the Tasks
 * tab).
 */
export function phaseStagePositionLabel(view: CasePhaseView): string {
  const total = view.groups.length;
  const index = view.groups.findIndex(g => g.ref === view.currentPhaseRef);
  if (total === 0 || index === -1) return view.currentPhaseName;
  return `Stage ${index + 1} of ${total} · ${view.currentPhaseName}`;
}

/**
 * The case's Stage as shown everywhere (Case Details, Case Manager, Team
 * Dashboard): the current task's phase name, or the stored stage's label for
 * a closed case or one whose tasks have no phase information.
 */
export function caseStageName(stage: CaseStage, view: CasePhaseView | null | undefined): string {
  return stage !== 'closed' && view?.hasPhases ? view.currentPhaseName : CASE_STAGE_LABELS[stage];
}
