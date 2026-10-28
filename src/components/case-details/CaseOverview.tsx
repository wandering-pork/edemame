import React from 'react';
import { Check, FileText, Image as ImageIcon, File as FileIcon, ArrowRight, Pause } from 'lucide-react';
import { format } from 'date-fns';
import type { CaseStage, Client, Deadline, Document, Task } from '../../types';
import { CASE_STAGE_LABELS, STAGE_META } from '../../lib/caseStage';
import { DEADLINE_KIND_LABELS, daysLeft } from '../../lib/deadlines';
import { TASK_STATUS_LABELS, isWaiting } from '../../lib/taskStatus';
import type { ChecklistCategorySummary, TimelineEntry } from '../../lib/caseOverview';
import { DocumentUpload } from '../DocumentUpload';

function fileIconFor(fileType: string) {
  if (fileType.startsWith('image/')) return ImageIcon;
  if (fileType === 'application/pdf' || fileType.includes('wordprocessing')) return FileText;
  return FileIcon;
}

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
// Checklist donut
// ---------------------------------------------------------------------------

const ChecklistDonut: React.FC<{ rows: ChecklistCategorySummary[] }> = ({ rows }) => {
  const sum = (key: 'verified' | 'linked' | 'pending' | 'waived') => rows.reduce((n, r) => n + r[key], 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  const verified = sum('verified');
  const linked = sum('linked');
  const pending = sum('pending');
  const waived = sum('waived');
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  // Verified → linked → waived → (pending as the empty track), matching the category bars.
  const v = pct(verified);
  const l = v + pct(linked);
  const w = l + pct(waived);
  const needed = total - waived;
  return (
    <div className="flex items-center gap-4 mb-4">
      <div
        aria-hidden
        className="w-[84px] h-[84px] rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: `conic-gradient(#29B767 0 ${v}%, #3b82f6 ${v}% ${l}%, #94a3b8 ${l}% ${w}%, rgba(127,127,127,0.15) ${w}% 100%)`,
        }}
      >
        <div className="w-[58px] h-[58px] rounded-full bg-paper-2 dark:bg-plate-card flex items-center justify-center text-[13px] font-bold text-ink dark:text-plate-ink">
          {verified + linked}/{needed}
        </div>
      </div>
      <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint leading-relaxed">
        <span className="block text-ink dark:text-plate-ink font-semibold">{verified + linked} of {needed} documents in</span>
        {verified} verified · {linked} linked · {pending} pending{waived > 0 ? ` · ${waived} waived` : ''}
      </div>
    </div>
  );
};

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

  client: Client;
  applicant?: Client;
  visaSubclass?: string;
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

  documents: Document[];
  caseId: string;
  onOpenDocument: (doc: Document) => void;
  onViewAllFiles: () => void;
  onDocumentUploaded: (doc: Document) => void;
  onRequestCompress: (files: File[]) => void;
}

/**
 * Case Details landing view (design option C — "Tabbed + Workspace drawer"):
 * a "You are here" current-task hero, then case info + progress on the left
 * and the document checklist (overall donut + per-category bars) + recent
 * case files on the right. The Workspace lives in an on-demand drawer
 * rendered separately by `CaseDetails.tsx` (see `WorkspaceDrawer.tsx`), so
 * the case itself stays the focus here.
 */
export const CaseOverview: React.FC<CaseOverviewProps> = props => {
  const {
    stage, onHold,
    currentTask, openTaskCount, totalTaskCount, onOpenTask,
    timeline, hiddenTaskCount, onViewAllTasks,
    client, applicant, visaSubclass, templateTitle, ownerName, openedAt, nextDeadline, description, onEditCase, onOpenDeadlines,
    checklistRows, checklistTotal, checklistDone, onOpenChecklist, onGenerateChecklist,
    documents, caseId, onOpenDocument, onViewAllFiles, onDocumentUploaded, onRequestCompress,
  } = props;

  const recentDocs = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 5);
  const nextDeadlineDays = nextDeadline ? daysLeft(nextDeadline, new Date()) : null;

  return (
    <div className="mt-4 space-y-3.5">
      {/* ── You are here: current task ── */}
      <section className="flex items-center gap-4 flex-wrap rounded-xl border border-ink/15 dark:border-plate-ink/20 border-l-4 border-l-edamame bg-paper-2 dark:bg-plate-card shadow-sm px-[18px] py-3.5">
          {currentTask ? (
            <>
              <div className="min-w-0">
                <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                  You are here · {totalTaskCount - openTaskCount} of {totalTaskCount} tasks done
                </div>
                <div className="text-[18px] font-bold text-ink dark:text-plate-ink tracking-tight truncate">{currentTask.title}</div>
                <div className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft">
                  Due {fmtDate(currentTask.date)}
                  {currentTask.datePending && ' (estimated)'}
                  {currentTask.status !== 'not_started' && ` · ${TASK_STATUS_LABELS[currentTask.status]}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenTask(currentTask)}
                className="btn-press ml-auto px-3.5 py-1.5 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Open task
              </button>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">Current task</div>
                <div className="text-[14px] font-bold text-ink dark:text-plate-ink">
                  {totalTaskCount === 0 ? 'No tasks yet' : 'All tasks are done'}
                </div>
              </div>
              <button
                type="button"
                onClick={onViewAllTasks}
                className="btn-press ml-auto px-3.5 py-1.5 border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame font-bold rounded-lg text-xs transition-colors"
              >
                {totalTaskCount === 0 ? 'Plan tasks' : 'View tasks'}
              </button>
            </>
          )}
          {onHold && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
              <Pause size={12} /> On hold
            </span>
          )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3.5 items-start">
        {/* ── Left: case info + timeline ── */}
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
                    {visaSubclass ? `Subclass ${visaSubclass}` : templateTitle}
                    {visaSubclass && templateTitle && <span className="text-ink-faint dark:text-plate-ink-faint"> · {templateTitle}</span>}
                  </dd>
                </>
              )}
              <dt className="text-ink-faint dark:text-plate-ink-faint">Case owner</dt>
              <dd className="text-ink dark:text-plate-ink">{ownerName ?? <span className="text-ink-faint dark:text-plate-ink-faint">Unassigned</span>}</dd>
              <dt className="text-ink-faint dark:text-plate-ink-faint">Stage</dt>
              <dd>
                <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${STAGE_META[stage].chip}`}>
                  {CASE_STAGE_LABELS[stage]}
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

          <section className={cardCls}>
            <CardTitle
              badge={totalTaskCount > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft">
                  {totalTaskCount - openTaskCount} of {totalTaskCount} done
                </span>
              ) : undefined}
              action={<LinkButton onClick={onViewAllTasks}>{hiddenTaskCount > 0 ? `View all ${totalTaskCount}` : 'Open tasks'} <ArrowRight size={11} /></LinkButton>}
            >
              Progress
            </CardTitle>
            {timeline.length === 0 ? (
              <p className="text-[12px] text-ink-faint dark:text-plate-ink-faint">No tasks on this case yet.</p>
            ) : (
              <ol>
                {timeline.map(({ task, state }, i) => {
                  const last = i === timeline.length - 1;
                  return (
                    <li key={task.id} className="relative flex gap-3 pb-3 last:pb-0">
                      {!last && <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-0.5 bg-ink/10 dark:bg-plate-ink/15" />}
                      <span
                        className={`relative mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center border-2 ${
                          state === 'done'
                            ? 'bg-edamame border-edamame text-white'
                            : state === 'current'
                              ? 'bg-paper-2 dark:bg-plate-card border-edamame ring-4 ring-edamame/15'
                              : 'bg-paper-2 dark:bg-plate-card border-ink/15 dark:border-plate-ink/20'
                        }`}
                      >
                        {state === 'done' && <Check size={11} strokeWidth={3} />}
                        {state === 'current' && <span className="w-2 h-2 rounded-full bg-edamame" />}
                      </span>
                      <button type="button" onClick={() => onOpenTask(task)} className="min-w-0 text-left group">
                        <div
                          className={`text-[13px] truncate group-hover:text-edamame ${
                            state === 'current'
                              ? 'font-bold text-ink dark:text-plate-ink'
                              : state === 'done'
                                ? 'text-ink-soft dark:text-plate-ink-soft'
                                : 'text-ink-faint dark:text-plate-ink-faint'
                          }`}
                        >
                          {task.title}
                        </div>
                        <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                          {state === 'done'
                            ? `${TASK_STATUS_LABELS[task.status]} · ${fmtDate(task.date)}`
                            : `${task.datePending ? 'Est.' : 'Due'} ${fmtDate(task.date)}${isWaiting(task) ? ` · ${TASK_STATUS_LABELS[task.status]}` : ''}`}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* ── Right: checklist + recent files ── */}
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
              Document checklist
            </CardTitle>
            {checklistRows.length === 0 ? (
              <div className="text-[12px] text-ink-faint dark:text-plate-ink-faint">
                No checklist yet.{' '}
                <LinkButton onClick={onGenerateChecklist}>Generate one</LinkButton>
              </div>
            ) : (
              <>
                <ChecklistDonut rows={checklistRows} />
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
                          className="flex h-2 rounded-full overflow-hidden bg-ink/[0.07] dark:bg-plate-ink/10"
                          title={`${row.verified} verified, ${row.linked} linked, ${row.pending} pending, ${row.waived} waived`}
                        >
                          <span className="bg-edamame" style={{ width: pct(row.verified) }} />
                          <span className="bg-blue-500" style={{ width: pct(row.linked) }} />
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
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-edamame" />Verified</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-blue-500" />Linked</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-ink/[0.07] dark:bg-plate-ink/10 border border-ink/10" />Pending</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-slate-400" />Waived</span>
                </div>
              </>
            )}
          </section>

          <section className={cardCls}>
            <CardTitle
              badge={documents.length > 0 ? (
                <span className="text-[10px] font-bold px-1.5 py-px rounded-full bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft">
                  {documents.length} total
                </span>
              ) : undefined}
              action={documents.length > 0 ? <LinkButton onClick={onViewAllFiles}>View all files <ArrowRight size={11} /></LinkButton> : undefined}
            >
              Recent case files
            </CardTitle>
            <DocumentUpload caseId={caseId} visaSubclass={visaSubclass} onUpload={onDocumentUploaded} onRequestCompress={onRequestCompress} compact />
            {recentDocs.length === 0 ? (
              <p className="mt-2 text-[12px] text-ink-faint dark:text-plate-ink-faint">No files in this case yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink/10 dark:divide-plate-ink/15">
                {recentDocs.map(doc => {
                  const Icon = fileIconFor(doc.fileType);
                  return (
                    <li key={doc.id}>
                      <button type="button" onClick={() => onOpenDocument(doc)} className="w-full flex items-center gap-2.5 py-2 text-left group">
                        <span className="w-8 h-8 rounded-lg bg-paper dark:bg-plate flex items-center justify-center flex-shrink-0">
                          <Icon size={14} className="text-ink-soft dark:text-plate-ink-soft" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] text-ink dark:text-plate-ink truncate group-hover:text-edamame">{doc.fileName}</span>
                          <span className="block text-[11px] text-ink-faint dark:text-plate-ink-faint">{fmtDate(doc.uploadedAt, 'd MMM yyyy')}</span>
                        </span>
                        {doc.documentTypeCode && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-paper dark:bg-plate text-ink-soft dark:text-plate-ink-soft flex-shrink-0">
                            {doc.documentTypeCode}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default CaseOverview;
