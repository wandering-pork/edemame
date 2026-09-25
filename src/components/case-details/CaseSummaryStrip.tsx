import React from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Calendar, Pause, Play } from 'lucide-react';
import type { Case, CaseOutcome, CaseStage, Deadline } from '../../types';
import {
  CASE_STAGE_LABELS,
  CASE_STAGE_ORDER,
  STAGE_META,
  OUTCOME_LABELS,
  caseStageGroup,
  CASE_STAGE_GROUP_LABELS,
  CaseStageGroup,
} from '../../lib/caseStage';
import { DEADLINE_KIND_LABELS, daysLeft, urgency, DeadlineUrgency } from '../../lib/deadlines';
import { stagePositionLabel } from '../../lib/caseSummary';
import type { CaseRisk } from '../../lib/risk';

const URGENCY_CHIP: Record<DeadlineUrgency, string> = {
  none: 'bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft border-ink/15 dark:border-plate-ink/20',
  soon: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/40',
  urgent: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-300/60 dark:border-orange-700/40',
  critical: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-300/60 dark:border-red-700/40',
};

function countdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `${days}d left`;
}

const STAGE_GROUP_ORDER: CaseStageGroup[] = ['pre_lodgement', 'with_department', 'closed'];

interface CaseSummaryStripProps {
  stage: CaseStage;
  outcome?: CaseOutcome;
  onHold: boolean;
  onToggleOnHold: () => void;
  risk: CaseRisk;
  nextDeadline: Deadline | null;
  onOpenDeadlines: () => void;

  // Stage-picker dropdown state — owned by the parent so `evaluateTransition()`'s
  // backward-move confirm / outcome picker logic stays in one place.
  statusOpen: boolean;
  onToggleStatusOpen: () => void;
  onCloseStatusOpen: () => void;
  onStageSelect: (stage: CaseStage) => void;
  backwardConfirmStage: CaseStage | null;
  onCancelBackward: () => void;
  onConfirmBackward: () => void;
  outcomePickerOpen: boolean;
  outcomeDraft: CaseOutcome | '';
  onSetOutcomeDraft: (outcome: CaseOutcome) => void;
  onCancelOutcomePicker: () => void;
  onConfirmOutcome: () => void;
}

/**
 * "Case information at a glance" strip shown directly under the case title —
 * see the UX review this addresses (root `CLAUDE.md`'s doc history has no
 * entry for this yet; it's step 1's case-summary work). Four pieces:
 * Stage (grouped picker), At Risk / On track (reasons always visible, not
 * just on hover), Next deadline (countdown, opens the Tasks tab's Deadlines
 * panel), and an On hold toggle labelled for the action it takes.
 */
export const CaseSummaryStrip: React.FC<CaseSummaryStripProps> = ({
  stage,
  outcome,
  onHold,
  onToggleOnHold,
  risk,
  nextDeadline,
  onOpenDeadlines,
  statusOpen,
  onToggleStatusOpen,
  onCloseStatusOpen,
  onStageSelect,
  backwardConfirmStage,
  onCancelBackward,
  onConfirmBackward,
  outcomePickerOpen,
  outcomeDraft,
  onSetOutcomeDraft,
  onCancelOutcomePicker,
  onConfirmOutcome,
}) => {
  const stageMeta = STAGE_META[stage];
  const today = new Date();
  const deadlineDays = nextDeadline ? daysLeft(nextDeadline, today) : null;
  const deadlineUrgency = nextDeadline ? urgency(nextDeadline, today) : 'none';

  const stagesByGroup = STAGE_GROUP_ORDER.map(group => ({
    group,
    stages: CASE_STAGE_ORDER.filter(s => caseStageGroup(s) === group),
  }));

  return (
    <div className="mt-3 flex flex-wrap items-stretch gap-2">
      {/* ── Stage ── */}
      <div className="relative">
        <button
          onClick={onToggleStatusOpen}
          aria-haspopup="true"
          aria-expanded={statusOpen}
          className={`h-full inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl border transition-colors focus-ring ${stageMeta.chip} border-transparent hover:opacity-90`}
        >
          <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-70">Stage</span>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dot}`} />
            {stagePositionLabel(stage)}
            {stage === 'closed' && outcome && <span className="opacity-70">· {OUTCOME_LABELS[outcome]}</span>}
            <ChevronDown size={12} />
          </span>
        </button>

        {statusOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={onCloseStatusOpen} />
            <div className="absolute left-0 top-full mt-1.5 z-40 w-64 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content max-h-96 overflow-y-auto">
              {stagesByGroup.map(({ group, stages }) => (
                <div key={group} className="mb-1 last:mb-0">
                  <div className="px-3 pt-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-ink-soft/60 dark:text-plate-ink-soft/60">
                    {CASE_STAGE_GROUP_LABELS[group]}
                  </div>
                  {stages.map(s => (
                    <button
                      key={s}
                      onClick={() => onStageSelect(s)}
                      aria-current={stage === s ? 'true' : undefined}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold hover:bg-paper dark:hover:bg-plate transition-colors ${stage === s ? 'text-ink dark:text-plate-ink' : 'text-ink-soft dark:text-plate-ink-soft'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[s].dot}`} />
                      {CASE_STAGE_LABELS[s]}
                      {stage === s && <span className="ml-auto text-[10px] text-edamame font-bold">Current</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Backward-move confirm — inline, never window.confirm */}
        {backwardConfirmStage && (
          <>
            <div className="fixed inset-0 z-30" onClick={onCancelBackward} />
            <div className="absolute left-0 top-full mt-1.5 z-40 w-64 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-3 modal-content">
              <p className="text-[12px] text-ink dark:text-plate-ink font-semibold mb-1">Move stage backward?</p>
              <p className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mb-3">
                This moves the case from {CASE_STAGE_LABELS[stage]} back to {CASE_STAGE_LABELS[backwardConfirmStage]}.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={onCancelBackward} className="px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={onConfirmBackward} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg transition-colors">
                  Confirm
                </button>
              </div>
            </div>
          </>
        )}

        {/* Outcome picker — required before a move to Closed applies */}
        {outcomePickerOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={onCancelOutcomePicker} />
            <div className="absolute left-0 top-full mt-1.5 z-40 w-64 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-3 modal-content">
              <p className="text-[12px] text-ink dark:text-plate-ink font-semibold mb-2">Outcome</p>
              <div className="space-y-1 mb-3">
                {(['granted', 'refused', 'withdrawn', 'lapsed'] as CaseOutcome[]).map(o => (
                  <button
                    key={o}
                    onClick={() => onSetOutcomeDraft(o)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                      outcomeDraft === o
                        ? 'bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400'
                        : 'text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate'
                    }`}
                  >
                    {OUTCOME_LABELS[o]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={onCancelOutcomePicker} className="px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={onConfirmOutcome}
                  disabled={!outcomeDraft}
                  className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Close case
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── At Risk / On track — reasons always visible, not just a tooltip ── */}
      <div
        className={`inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl border max-w-sm ${
          risk.atRisk
            ? 'bg-red-50 dark:bg-red-900/20 border-red-300/60 dark:border-red-700/40'
            : 'bg-paper-2 dark:bg-plate-card border-ink/15 dark:border-plate-ink/20'
        }`}
      >
        <span className={`text-[9.5px] font-bold uppercase tracking-wide ${risk.atRisk ? 'text-red-700 dark:text-red-300 opacity-90' : 'text-ink-soft/70 dark:text-plate-ink-soft/70'}`}>
          Risk
        </span>
        {risk.atRisk ? (
          <span className="inline-flex items-start gap-1.5 text-[11.5px] font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle size={13} strokeWidth={2} className="flex-shrink-0 mt-[1px]" />
            <span>At risk — {risk.reasons.join('; ')}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft">
            <CheckCircle2 size={13} strokeWidth={2} className="text-edamame flex-shrink-0" />
            On track
          </span>
        )}
      </div>

      {/* ── Next deadline ── */}
      <button
        onClick={onOpenDeadlines}
        title={nextDeadline ? 'Open the Deadlines panel' : 'Add a deadline'}
        className={`inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl border transition-colors focus-ring hover:opacity-90 ${
          nextDeadline ? URGENCY_CHIP[deadlineUrgency] : 'bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft border-ink/15 dark:border-plate-ink/20'
        }`}
      >
        <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-70">Next deadline</span>
        {nextDeadline ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold">
            <Calendar size={12} strokeWidth={2} />
            {DEADLINE_KIND_LABELS[nextDeadline.kind]}
            <span className="opacity-80 font-semibold">· {countdownLabel(deadlineDays ?? 0)}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold underline decoration-dotted">
            <Calendar size={12} strokeWidth={2} />
            No deadlines · Add
          </span>
        )}
      </button>

      {/* ── On hold toggle ── */}
      <button
        onClick={onToggleOnHold}
        title={onHold ? 'Resume this case' : 'Put this case on hold'}
        className={`inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl border transition-colors focus-ring ${
          onHold
            ? 'border-orange-400 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
            : 'border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-edamame'
        }`}
      >
        <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-70">{onHold ? 'On hold' : 'Status'}</span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold">
          {onHold ? <Play size={12} strokeWidth={2.2} /> : <Pause size={12} strokeWidth={2.2} />}
          {onHold ? 'Resume' : 'Put on hold'}
        </span>
      </button>
    </div>
  );
};

export default CaseSummaryStrip;
