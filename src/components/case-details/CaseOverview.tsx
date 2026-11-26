import React from 'react';
import { ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import type { CaseOutcome, CaseStage, Client, Deadline, Task } from '../../types';
import { STAGE_META } from '../../lib/caseStage';
import { caseStageName } from '../../lib/caseStageSync';
import { DEADLINE_KIND_LABELS, daysLeft } from '../../lib/deadlines';
import type { ChecklistCategorySummary, TimelineEntry } from '../../lib/caseOverview';
import { subclassShortLabel } from '../../lib/visaTypes';
import type { CasePhaseView } from '../../lib/phaseGrouping';
import type { PathStage } from '../../lib/progressPath';
import { ProgressPath } from './ProgressPath';
import { ProgressRings } from './ProgressRings';

function fmtDate(iso: string, pattern = 'd MMM'): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, pattern);
}

function countdown(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `${days} days`;
}

const cardCls = 'bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl shadow-sm p-[18px]';

const CardTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode; badge?: React.ReactNode }> = ({ children, action, badge }) => (
  <div className="flex items-center gap-2 mb-3.5">
    <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft">{children}</span>
    {badge}
    {action && <span className="ml-auto">{action}</span>}
  </div>
);

const LinkButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-edamame-700 dark:text-edamame-400 hover:underline"
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

interface CaseOverviewProps {
  stage: CaseStage;
  onHold: boolean;

  currentTask: Task | null;
  openTaskCount: number;
  totalTaskCount: number;
  onOpenTask: (task: Task) => void;

  timeline: TimelineEntry[];
  hiddenTaskCount: number;
  onViewAllTasks: () => void;
  /** Tasks grouped by phase; names the case's Stage in Case info. */
  phaseView?: CasePhaseView;
  /** Every stage of the journey for the progress path, or null for an older case with no stage information. */
  pathStages: PathStage[] | null;
  closed: boolean;
  outcome?: CaseOutcome;
  onCompleteStage: (stageName: string, updates: Task[]) => Promise<void>;

  client: Client;
  applicant?: Client;
  visaSubclass?: string;
  visaSubstream?: string;
  templateTitle?: string;
  ownerName?: string;
  openedAt: string;
  nextDeadline: Deadline | null;
  description?: string;
  onEditCase: () => void;
  onOpenDeadlines: () => void;

  checklistRows: ChecklistCategorySummary[];
  checklistTotal: number;
  checklistDone: number;
  onOpenChecklist: () => void;
  onGenerateChecklist: () => void;

}

/**
 * Case Details landing view: task progress and document checklist rings
 * (ProgressRings.tsx), then the progress path (every stage of the case, the
 * selected stage's tasks underneath, and "Mark stage complete" for the current
 * one; see ProgressPath.tsx), then case info and the checklist's per-category
 * bars side by side. Files live on the Case files tab. The floating Workspace bar is rendered separately by
 * `CaseDetails.tsx` (see `WorkspaceDock.tsx`).
 */
export const CaseOverview: React.FC<CaseOverviewProps> = props => {
  const {
    stage, onHold,
    currentTask, openTaskCount, totalTaskCount, onOpenTask,
    timeline, hiddenTaskCount, onViewAllTasks, phaseView, pathStages, closed, outcome, onCompleteStage,
    client, applicant, visaSubclass, visaSubstream, templateTitle, ownerName, openedAt, nextDeadline, description, onEditCase, onOpenDeadlines,
    checklistRows, checklistTotal, checklistDone, onOpenChecklist, onGenerateChecklist,
  } = props;

  const nextDeadlineDays = nextDeadline ? daysLeft(nextDeadline, new Date()) : null;

  return (
    <div className="mt-4 space-y-3.5">
      <ProgressRings
        tasksDone={totalTaskCount - openTaskCount}
        tasksTotal={totalTaskCount}
        stages={pathStages}
        currentTask={currentTask}
        closed={closed}
        onOpenTasks={onViewAllTasks}
        checklistRows={checklistRows}
        onOpenChecklist={onOpenChecklist}
        onGenerateChecklist={onGenerateChecklist}
      />

      <ProgressPath
        stages={pathStages}
        currentTask={currentTask}
        onOpenTask={onOpenTask}
        onViewAllTasks={onViewAllTasks}
        onHold={onHold}
        closed={closed}
        outcome={outcome}
        onCompleteStage={onCompleteStage}
        lifecycleStage={stage}
        timeline={timeline}
        hiddenTaskCount={hiddenTaskCount}
        openTaskCount={openTaskCount}
        totalTaskCount={totalTaskCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
        {/* ── Left: case info ── */}
        <div className="space-y-3.5 min-w-0">
          <section className={cardCls}>
            <CardTitle action={<LinkButton onClick={onEditCase}>Edit</LinkButton>}>Case info</CardTitle>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
              <dt className="text-ink-faint dark:text-plate-ink-faint">Client</dt>
              <dd className="text-ink dark:text-plate-ink font-semibold min-w-0 truncate">{client.name}</dd>
              {applicant && applicant.id !== client.id && (
                <>
                  <dt className="text-ink-faint dark:text-plate-ink-faint">Applicant</dt>
                  <dd className="text-ink dark:text-plate-ink min-w-0 truncate">{applicant.name}</dd>
                </>
              )}
              {(visaSubclass || templateTitle) && (
                <>
                  <dt className="text-ink-faint dark:text-plate-ink-faint">Visa</dt>
                  <dd className="text-ink dark:text-plate-ink min-w-0">
                    {visaSubclass ? subclassShortLabel(visaSubclass, visaSubstream) : templateTitle}
                    {visaSubclass && templateTitle && <span className="text-ink-faint dark:text-plate-ink-faint"> · {templateTitle}</span>}
                  </dd>
                </>
              )}
              <dt className="text-ink-faint dark:text-plate-ink-faint">Case owner</dt>
              <dd className="text-ink dark:text-plate-ink">{ownerName ?? <span className="text-ink-faint dark:text-plate-ink-faint">Unassigned</span>}</dd>
              {/* One Stage, read-only: it follows the tasks (the phase of the current task, as
                  grouped on the Tasks tab). Older cases with no phase info show the stored stage. */}
              <dt className="text-ink-faint dark:text-plate-ink-faint">Stage</dt>
              <dd>
                <span
                  title={stage === 'closed' ? undefined : 'Follows the tasks: the stage of the current task'}
                  className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${STAGE_META[stage].chip}`}
                >
                  {caseStageName(stage, phaseView)}
                </span>
              </dd>
              <dt className="text-ink-faint dark:text-plate-ink-faint">Next deadline</dt>
              <dd>
                {nextDeadline && nextDeadlineDays !== null ? (
                  <button
                    type="button"
                    onClick={onOpenDeadlines}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full text-left ${
                      nextDeadlineDays <= 7
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : nextDeadlineDays <= 14
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                          : 'bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft'
                    }`}
                  >
                    {nextDeadline.title || DEADLINE_KIND_LABELS[nextDeadline.kind]} · {countdown(nextDeadlineDays)}
                  </button>
                ) : (
                  <span className="text-ink-faint dark:text-plate-ink-faint">None open</span>
                )}
              </dd>
              <dt className="text-ink-faint dark:text-plate-ink-faint">Opened</dt>
              <dd className="text-ink dark:text-plate-ink">{fmtDate(openedAt, 'd MMM yyyy')}</dd>
            </dl>
            {description?.trim() && (
              <p className="mt-3 pt-3 border-t border-ink/10 dark:border-plate-ink/15 text-[12px] text-ink-soft dark:text-plate-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-4">
                {description}
              </p>
            )}
          </section>


        </div>

        {/* ── Right: document checklist by category ── */}
        <div className="space-y-3.5 min-w-0">
          <section className={cardCls}>
            <CardTitle
              badge={checklistTotal > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft">
                  {checklistDone}/{checklistTotal} in
                </span>
              ) : undefined}
              action={checklistTotal > 0 ? <LinkButton onClick={onOpenChecklist}>Open <ArrowRight size={11} /></LinkButton> : undefined}
            >
              Checklist by category
            </CardTitle>
            {checklistRows.length === 0 ? (
              <div className="text-[12px] text-ink-faint dark:text-plate-ink-faint">
                No checklist yet.{' '}
                <LinkButton onClick={onGenerateChecklist}>Generate one</LinkButton>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {checklistRows.map(row => {
                    const pct = (n: number) => `${(n / row.total) * 100}%`;
                    return (
                      <button key={row.category} type="button" onClick={onOpenChecklist} className="block w-full text-left group">
                        <div className="flex justify-between gap-2 text-[12.5px] mb-1">
                          <span className="font-semibold text-ink dark:text-plate-ink truncate group-hover:text-edamame">{row.category}</span>
                          <span className="text-ink-faint dark:text-plate-ink-faint whitespace-nowrap">
                            {row.linked + row.verified}/{row.total - row.waived} in
                          </span>
                        </div>
                        <div
                          className="flex gap-[2px] h-2 rounded-full overflow-hidden bg-ink/[0.07] dark:bg-plate-ink/10"
                          title={`${row.verified} verified, ${row.linked} linked, ${row.pending} pending, ${row.waived} waived`}
                        >
                          <span className="bg-edamame-800 dark:bg-edamame-400" style={{ width: pct(row.verified) }} />
                          <span className="bg-edamame-500 dark:bg-edamame-800" style={{ width: pct(row.linked) }} />
                          <span className="bg-slate-400" style={{ width: pct(row.waived) }} />
                        </div>
                        <div className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint mt-1">
                          {row.verified} verified · {row.linked} linked · {row.pending} pending{row.waived > 0 ? ` · ${row.waived} waived` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3.5 mt-3.5 text-[11px] text-ink-faint dark:text-plate-ink-faint">
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-edamame-800 dark:bg-edamame-400" />Verified</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-edamame-500 dark:bg-edamame-800" />Linked</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-ink/[0.07] dark:bg-plate-ink/10 border border-ink/10" />Pending</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-slate-400" />Waived</span>
                </div>
              </>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};

export default CaseOverview;
