import type { CaseStage, Deadline } from '../types';
import { CASE_STAGE_LABELS, CASE_STAGE_STEPPER } from './caseStage';
import { daysLeft } from './deadlines';

/**
 * The soonest *open* deadline for a case, given the case's already-merged
 * deadline list (stored + derived, e.g. `lib/deadlines.ts`'s `allDeadlines()`
 * filtered down to one case — see `pages/CaseDetails.tsx`'s `caseDeadlines`).
 * Resolved deadlines (`met`/`missed`/`dismissed`) are never shown as "next" —
 * a dismissed or handled deadline shouldn't sit at the top of the case page.
 * `null` when there's no open deadline at all.
 */
export function nextDeadlineFor(deadlines: Deadline[], today: Date = new Date()): Deadline | null {
  const open = deadlines.filter(d => d.status === 'open');
  if (open.length === 0) return null;
  return [...open].sort((a, b) => daysLeft(a, today) - daysLeft(b, today))[0];
}

/**
 * "Stage N of M · Label" for the case summary strip — position along the
 * "main line" a case travels (`CASE_STAGE_STEPPER`), not the full
 * `CASE_STAGE_ORDER` picker list. `info_requested` is a branch off `lodged`
 * (see `CASE_STAGE_STEPPER`'s own doc comment), so it's shown at the same
 * position as `lodged` rather than being absent from the count.
 */
export function stagePositionLabel(stage: CaseStage): string {
  const stepperStage = stage === 'info_requested' ? 'lodged' : stage;
  const index = CASE_STAGE_STEPPER.indexOf(stepperStage);
  const position = index === -1 ? 1 : index + 1;
  return `Stage ${position} of ${CASE_STAGE_STEPPER.length} · ${CASE_STAGE_LABELS[stage]}`;
}
