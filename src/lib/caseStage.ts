import type { Case, CaseStage } from '../types';

/** Human-readable labels shared by every stage control in the UI. */
export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  draft: 'Draft',
  assessment: 'Assessment',
  engaged: 'Engaged',
  preparing: 'Preparing',
  ready_to_lodge: 'Ready to lodge',
  lodged: 'Lodged',
  info_requested: 'Info requested',
  decision: 'Decision',
  closed: 'Closed',
};

/** All stages, in the order they appear in a stage picker. */
export const CASE_STAGE_ORDER: CaseStage[] = [
  'draft', 'assessment', 'engaged', 'preparing', 'ready_to_lodge',
  'lodged', 'info_requested', 'decision', 'closed',
];

/**
 * The "main line" a case travels through, used by the Case Manager row
 * stepper. `info_requested` is deliberately left out — it's shown as a
 * branch/chip off `lodged` rather than its own step, since a case toggles
 * between the two rather than progressing through both.
 */
export const CASE_STAGE_STEPPER: CaseStage[] = [
  'draft', 'assessment', 'engaged', 'preparing', 'ready_to_lodge', 'lodged', 'decision', 'closed',
];

export type CaseStageGroup = 'pre_lodgement' | 'with_department' | 'closed';

export const CASE_STAGE_GROUP_LABELS: Record<CaseStageGroup, string> = {
  pre_lodgement: 'Pre-lodgement',
  with_department: 'With department',
  closed: 'Closed',
};

/** Which board group a stage belongs to — drives the Case Manager's filter chips. */
export function caseStageGroup(stage: CaseStage): CaseStageGroup {
  if (stage === 'closed') return 'closed';
  if (stage === 'lodged' || stage === 'info_requested' || stage === 'decision') return 'with_department';
  return 'pre_lodgement';
}

/**
 * Ordinal rank used to detect a backward move. `lodged` and `info_requested`
 * share a rank — toggling between them is a normal back-and-forth with the
 * department, not a "backward" move that needs a confirm.
 */
const STAGE_RANK: Record<CaseStage, number> = {
  draft: 0,
  assessment: 1,
  engaged: 2,
  preparing: 3,
  ready_to_lodge: 4,
  lodged: 5,
  info_requested: 5,
  decision: 6,
  closed: 7,
};

export interface StageTransition {
  from: CaseStage;
  to: CaseStage;
  /** True when `to` is an earlier stage than `from` — the UI must ask for an inline confirm before applying it. */
  isBackward: boolean;
  /** True when `to` is `closed` — the UI must collect a `CaseOutcome` before applying it. */
  requiresOutcome: boolean;
}

/**
 * Every stage-to-stage move is allowed (an agent's case can genuinely go
 * backward — a department reopens a decision, a lodgement gets withdrawn and
 * re-prepared). This evaluates what confirmation the UI owes the agent before
 * applying the move, rather than blocking any particular transition.
 */
export function evaluateTransition(from: CaseStage, to: CaseStage): StageTransition {
  return {
    from,
    to,
    isBackward: STAGE_RANK[to] < STAGE_RANK[from],
    requiresOutcome: to === 'closed',
  };
}

/** True when `stage` is `closed` and moving there requires (or required) picking an outcome. */
export function outcomeRequired(stage: CaseStage): boolean {
  return stage === 'closed';
}

/** True for a case already normalized (has `stage`) that has reached `closed`. */
export function isCaseClosed(c: Pick<Case, 'stage'>): boolean {
  return c.stage === 'closed';
}

/**
 * Fills in `stage`/`onHold` for a case that may have been written before
 * `stage` existed — old local-mode JSON files and old cloud rows only have
 * the legacy `status`. Called by both repositories on every read, per the
 * "normalize at the repository boundary" rule.
 *
 * Legacy mapping: `open`/`in_progress` → `preparing`; `on_hold` → `preparing`
 * + `onHold: true`; `closed` → `closed` with no outcome (the UI prompts for
 * one the next time the case is opened, since a legacy row has no way to know
 * what actually happened).
 */
export function normalizeCase(raw: Case): Case {
  if (raw.stage) return raw;

  const legacyStatus = raw.status ?? 'open';
  let stage: CaseStage = 'preparing';
  let onHold = raw.onHold;

  switch (legacyStatus) {
    case 'open':
    case 'in_progress':
      stage = 'preparing';
      break;
    case 'on_hold':
      stage = 'preparing';
      onHold = true;
      break;
    case 'closed':
      stage = 'closed';
      break;
    default:
      stage = 'preparing';
  }

  return { ...raw, stage, onHold };
}

/**
 * The legacy `CaseStatus` a normalized case would derive to, for the cloud
 * mapper's one-release backward-compatible write of the `status` column
 * (see `repositories/cloud/index.ts`'s `caseToRow()`).
 */
export function deriveLegacyStatus(c: Pick<Case, 'stage' | 'onHold'>): 'open' | 'in_progress' | 'on_hold' | 'closed' {
  if (c.stage === 'closed') return 'closed';
  if (c.onHold) return 'on_hold';
  return c.stage === 'draft' || c.stage === 'assessment' ? 'open' : 'in_progress';
}
