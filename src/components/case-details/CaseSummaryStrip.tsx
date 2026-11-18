import React from 'react';
import { AlertTriangle, CheckCircle2, Calendar, Pause, Play } from 'lucide-react';
import type { CaseOutcome, CaseStage, Deadline } from '../../types';
import { CASE_STAGE_LABELS, STAGE_META, OUTCOME_LABELS } from '../../lib/caseStage';
import { DEADLINE_KIND_LABELS, daysLeft, urgency, DeadlineUrgency } from '../../lib/deadlines';
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

interface CaseSummaryStripProps {
  /** The case's stored stage — only used for its colour and for Closed. */
  stage: CaseStage;
  /** Read-only label for the task-based stage, e.g. "Stage 2 of 4 · Prerequisites". */
  stageLabel: string;
  outcome?: CaseOutcome;
  onHold: boolean;
  onToggleOnHold: () => void;
  risk: CaseRisk;
  nextDeadline: Deadline | null;
  onOpenDeadlines: () => void;

  // Outcome picker for closing a case — opened from Case actions → Close case…
  // (or the "no recorded outcome" banner), anchored under the Stage chip.
  outcomePickerOpen: boolean;
  outcomeDraft: CaseOutcome | '';
  onSetOutcomeDraft: (outcome: CaseOutcome) => void;
  onCancelOutcomePicker: () => void;
  onConfirmOutcome: () => void;
}

/**
 * "Case information at a glance" strip shown directly under the case title.
 * Four pieces: Stage (read-only — it follows the tasks, the same phases as
 * the Tasks tab; see lib/caseStageSync.ts), At Risk / On track (reasons
 * always visible, not just on hover), Next deadline (countdown, opens the
 * Tasks tab's Deadlines panel), and an On hold toggle labelled for the
 * action it takes.
 */
export const CaseSummaryStrip: React.FC<CaseSummaryStripProps> = ({
  stage,
  stageLabel,
  outcome,
  onHold,
  onToggleOnHold,
  risk,
  nextDeadline,
  onOpenDeadlines,
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

  return (
    <div className="mt-3 flex flex-wrap items-stretch gap-2">
      {/* ── Stage (read-only: follows the tasks) ── */}
      <div className="relative">
        <div
          title={stage === 'closed' ? 'This case is closed. Reopen it from Case actions.' : 'Follows the tasks: the stage of the current task, as grouped on the Tasks tab'}
          className={`h-full inline-flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-xl border border-transparent ${stageMeta.chip}`}
        >
          <span className="text-[9.5px] font-bold uppercase tracking-wide opacity-70">Stage</span>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
            <span className={`w-1.5 h-1.5 rounded-full ${stageMeta.dot}`} />
            {stage === 'closed' ? CASE_STAGE_LABELS.closed : stageLabel}
            {stage === 'closed' && outcome && <span className="opacity-70">· {OUTCOME_LABELS[outcome]}</span>}
          </span>
        </div>

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
