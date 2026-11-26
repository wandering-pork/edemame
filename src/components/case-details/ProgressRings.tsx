import React from 'react';
import type { Task } from '../../types';
import type { ChecklistCategorySummary } from '../../lib/caseOverview';
import { format } from 'date-fns';
import { stagePosition, type PathStage } from '../../lib/progressPath';

/**
 * The two headline figures at the top of the Overview: task progress and the
 * document checklist, as a pair of rings above the progress path.
 *
 * Each ring is a single-ratio meter in one hue (done of total), never a
 * multi-colour donut. The checklist ring adds a lighter step of the same green
 * for documents linked but not yet verified. The numbers are always printed in
 * text, so the rings are decoration for readers who can't see them.
 *
 * Colours were checked with the dataviz skill's validator as an ordinal pair
 * (one hue, the lighter step still clears 2:1 against the card): light mode
 * edamame-800 + edamame-500, dark mode edamame-400 + edamame-800.
 */

const Ring: React.FC<{ primary: number; secondary?: number; total: number; children: React.ReactNode }> = ({
  primary, secondary = 0, total, children,
}) => {
  const size = 92;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = total ? Math.min(primary / total, 1) : 0;
  const s = total ? Math.min((primary + secondary) / total, 1) : 0;
  const arc = (frac: number) => `${frac * c} ${c}`;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink/10 dark:stroke-plate-ink/15" />
        {s > p && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            className="stroke-edamame-500 dark:stroke-edamame-800" strokeDasharray={arc(s)} />
        )}
        {p > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            className="stroke-edamame-800 dark:stroke-edamame-400" strokeDasharray={arc(p)} />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};

const Fraction: React.FC<{ n: number; of: number }> = ({ n, of }) => (
  <span className="text-[21px] font-bold text-ink dark:text-plate-ink leading-none tracking-tight">
    {n}<span className="text-[13px] font-semibold text-ink-faint dark:text-plate-ink-faint">/{of}</span>
  </span>
);

const cardCls = 'rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card shadow-sm p-[18px] flex items-center gap-5 min-w-0';
const labelCls = 'text-[12px] font-semibold text-ink-soft dark:text-plate-ink-soft';
const headlineCls = 'text-[17px] font-bold text-ink dark:text-plate-ink tracking-tight truncate';
const subCls = 'text-[12px] text-ink-soft dark:text-plate-ink-soft';
const linkCls = 'mt-1.5 text-[12px] font-semibold text-edamame-700 dark:text-edamame-400 hover:underline';

interface ProgressRingsProps {
  tasksDone: number;
  tasksTotal: number;
  stages: PathStage[] | null;
  currentTask: Task | null;
  closed: boolean;
  onOpenTasks: () => void;
  onOpenTask: (task: Task) => void;

  checklistRows: ChecklistCategorySummary[];
  onOpenChecklist: () => void;
  onGenerateChecklist: () => void;
}

export const ProgressRings: React.FC<ProgressRingsProps> = ({
  tasksDone, tasksTotal, stages, currentTask, closed, onOpenTasks, onOpenTask,
  checklistRows, onOpenChecklist, onGenerateChecklist,
}) => {
  const sum = (key: 'verified' | 'linked' | 'pending' | 'waived' | 'total') => checklistRows.reduce((n, r) => n + r[key], 0);
  const verified = sum('verified');
  const linked = sum('linked');
  const needed = sum('total') - sum('waived');
  const docsIn = verified + linked;

  const current = stages?.find(s => s.state === 'current');
  const position = current && stages ? stagePosition(stages, current) : null;

  // The headline is the next task; the stage name lives on the path and in
  // the header's Stage chip, so here it is only context underneath.
  let taskLabel = 'Task progress';
  let taskHeadline: string;
  let taskSub: string | null = null;
  if (tasksTotal === 0) { taskHeadline = 'No tasks yet'; taskSub = 'Plan tasks to track progress here.'; }
  else if (closed) { taskHeadline = 'Case closed'; taskSub = `${tasksDone} of ${tasksTotal} tasks done`; }
  else if (!currentTask) { taskHeadline = 'All tasks done'; }
  else {
    taskLabel = 'Next up';
    taskHeadline = currentTask.title;
    const d = new Date(currentTask.date);
    const when = Number.isNaN(d.getTime()) ? null : `${currentTask.datePending ? 'Est.' : 'Due'} ${format(d, 'd MMM')}`;
    const where = current && position ? `${current.name}, stage ${position.n} of ${position.of}` : null;
    taskSub = [where, when].filter(Boolean).join(' · ') || null;
  }

  return (
    // Two grid cells: the parent (CaseOverview) owns the grid, so case info can sit in the same row.
    <>
      <section className={cardCls} aria-label="Task progress">
        <Ring primary={tasksDone} total={tasksTotal}><Fraction n={tasksDone} of={tasksTotal} /></Ring>
        <div className="min-w-0">
          <div className={labelCls}>{taskLabel}</div>
          <div className={headlineCls}>{taskHeadline}</div>
          {taskSub && <div className={`${subCls} truncate`}>{taskSub}</div>}
          <span className="sr-only">{tasksDone} of {tasksTotal} tasks done.</span>
          {currentTask && !closed ? (
            <button type="button" onClick={() => onOpenTask(currentTask)} className={linkCls}>Open task</button>
          ) : (
            <button type="button" onClick={onOpenTasks} className={linkCls}>
              {tasksTotal === 0 ? 'Plan tasks' : 'Open Tasks'}
            </button>
          )}
        </div>
      </section>

      <section className={cardCls} aria-label="Document checklist">
        <Ring primary={verified} secondary={linked} total={needed}><Fraction n={docsIn} of={needed} /></Ring>
        <div className="min-w-0">
          <div className={labelCls}>Document checklist</div>
          {needed === 0 ? (
            <>
              <div className={headlineCls}>No checklist yet</div>
              <div className={subCls}>Generate one from the case's visa.</div>
              <button type="button" onClick={onGenerateChecklist} className={linkCls}>Generate checklist</button>
            </>
          ) : (
            <>
              <div className={headlineCls}>
                {needed - docsIn === 0 ? 'All documents in' : `${needed - docsIn} document${needed - docsIn === 1 ? '' : 's'} to collect`}
              </div>
              <div className={`${subCls} flex items-center gap-x-3 gap-y-0.5 flex-wrap`}>
                {docsIn === 0 ? (
                  <span>None in yet</span>
                ) : (
                  <>
                    {verified > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <i aria-hidden className="w-2.5 h-2.5 rounded-full bg-edamame-800 dark:bg-edamame-400" />{verified} verified
                      </span>
                    )}
                    {linked > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <i aria-hidden className="w-2.5 h-2.5 rounded-full bg-edamame-500 dark:bg-edamame-800" />{linked} linked, not yet verified
                      </span>
                    )}
                  </>
                )}
              </div>
              <button type="button" onClick={onOpenChecklist} className={linkCls}>Open Document Checklist</button>
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default ProgressRings;
