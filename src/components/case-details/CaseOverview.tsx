import React from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import type { CaseOutcome, CaseStage, Client, Task } from '../../types';
import type { ChecklistCategorySummary, TimelineEntry } from '../../lib/caseOverview';
import { subclassShortLabel } from '../../lib/visaTypes';
import type { PathStage } from '../../lib/progressPath';
import { ProgressPath } from './ProgressPath';
import { ProgressRings } from './ProgressRings';

function fmtDate(iso: string, pattern = 'd MMM'): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, pattern);
}

const cardCls = 'bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl shadow-sm p-[18px]';

const CardTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="text-[12px] font-semibold text-ink-soft dark:text-plate-ink-soft">{children}</span>
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

/** A person's name that opens them on the Clients page (expanded, scrolled to). */
const ClientLink: React.FC<{ client: Client }> = ({ client }) => (
  <Link
    to="/clients"
    state={{ focusClientId: client.id }}
    title={`Open ${client.name} in Clients`}
    className="hover:text-edamame-700 dark:hover:text-edamame-400 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-edamame-700 rounded-sm"
  >
    {client.name}
  </Link>
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
  description?: string;
  onEditCase: () => void;

  checklistRows: ChecklistCategorySummary[];
  onOpenChecklist: () => void;
  onGenerateChecklist: () => void;

}

/**
 * Case Details landing view. One row of three: the task and document
 * checklist rings (ProgressRings.tsx) and case info. Then the progress path
 * (every stage of the case, the selected stage's tasks underneath, and "Mark
 * stage complete" for the current one; see ProgressPath.tsx), then the
 * checklist's per-category bars across the full width.
 *
 * Each fact is shown once on the page: the stage lives in the header chip and
 * on the path, the next deadline in the header, the document count on the
 * ring. Files live on the Case files tab. The floating Workspace bar is
 * rendered separately by `CaseDetails.tsx` (see `WorkspaceDock.tsx`).
 */
export const CaseOverview: React.FC<CaseOverviewProps> = props => {
  const {
    stage, onHold,
    currentTask, openTaskCount, totalTaskCount, onOpenTask,
    timeline, hiddenTaskCount, onViewAllTasks, pathStages, closed, outcome, onCompleteStage,
    client, applicant, visaSubclass, visaSubstream, templateTitle, ownerName, openedAt, description, onEditCase,
    checklistRows, onOpenChecklist, onGenerateChecklist,
  } = props;

  const anyWaived = checklistRows.some(r => r.waived > 0);

  return (
    <div className="mt-4 space-y-3.5">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        <ProgressRings
          tasksDone={totalTaskCount - openTaskCount}
          tasksTotal={totalTaskCount}
          stages={pathStages}
          currentTask={currentTask}
          closed={closed}
          onOpenTasks={onViewAllTasks}
          onOpenTask={onOpenTask}
          checklistRows={checklistRows}
          onOpenChecklist={onOpenChecklist}
          onGenerateChecklist={onGenerateChecklist}
        />

        <section className={`${cardCls} min-w-0 md:col-span-2 xl:col-span-1`}>
          <CardTitle action={<LinkButton onClick={onEditCase}>Edit</LinkButton>}>Case info</CardTitle>
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink-faint dark:text-plate-ink-faint">Client</dt>
            <dd className="text-ink dark:text-plate-ink font-semibold min-w-0 truncate">
              <ClientLink client={client} />
            </dd>
            {applicant && applicant.id !== client.id && (
              <>
                <dt className="text-ink-faint dark:text-plate-ink-faint">Applicant</dt>
                <dd className="text-ink dark:text-plate-ink min-w-0 truncate">
                  <ClientLink client={applicant} />
                </dd>
              </>
            )}
            {(visaSubclass || templateTitle) && (
              <>
                <dt className="text-ink-faint dark:text-plate-ink-faint">Visa</dt>
                <dd className="text-ink dark:text-plate-ink min-w-0 truncate">
                  {visaSubclass ? subclassShortLabel(visaSubclass, visaSubstream) : templateTitle}
                </dd>
              </>
            )}
            <dt className="text-ink-faint dark:text-plate-ink-faint">Case owner</dt>
            <dd className="text-ink dark:text-plate-ink min-w-0 truncate">{ownerName ?? <span className="text-ink-faint dark:text-plate-ink-faint">Unassigned</span>}</dd>
            <dt className="text-ink-faint dark:text-plate-ink-faint">Opened</dt>
            <dd className="text-ink dark:text-plate-ink">{fmtDate(openedAt, 'd MMM yyyy')}</dd>
          </dl>
          {description?.trim() && (
            <p className="mt-3 pt-3 border-t border-ink/10 dark:border-plate-ink/15 text-[12px] text-ink-soft dark:text-plate-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-3">
              {description}
            </p>
          )}
        </section>
      </div>

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

      {/* The ring above already says "No checklist yet" and links to Generate, so this card only shows once there is one. */}
      {checklistRows.length > 0 && (
        <section className={cardCls}>
          <CardTitle>Checklist by category</CardTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 items-start gap-x-8 gap-y-3.5">
            {checklistRows.map(row => {
              const pct = (n: number) => `${(n / row.total) * 100}%`;
              const anyIn = row.verified + row.linked + row.waived > 0;
              return (
                <button key={row.category} type="button" onClick={onOpenChecklist} className="block w-full min-w-0 text-left group">
                  <div className="flex justify-between gap-2 text-[12.5px] mb-1">
                    <span className="font-semibold text-ink dark:text-plate-ink truncate group-hover:text-edamame-700 dark:group-hover:text-edamame-400">{row.category}</span>
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
                    <span className="bg-ink/25 dark:bg-plate-ink/30" style={{ width: pct(row.waived) }} />
                  </div>
                  {/* The breakdown only once something is in; "0/3 in" already says it otherwise. */}
                  {anyIn && (
                    <div className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint mt-1">
                      {row.verified} verified · {row.linked} linked · {row.pending} pending{row.waived > 0 ? ` · ${row.waived} waived` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3.5 mt-3.5 text-[11px] text-ink-faint dark:text-plate-ink-faint">
            <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-edamame-800 dark:bg-edamame-400" />Verified</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-edamame-500 dark:bg-edamame-800" />Linked</span>
            <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-ink/[0.07] dark:bg-plate-ink/10 border border-ink/10" />Pending</span>
            {anyWaived && <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-ink/25 dark:bg-plate-ink/30" />Waived</span>}
          </div>
        </section>
      )}
    </div>
  );
};

export default CaseOverview;
