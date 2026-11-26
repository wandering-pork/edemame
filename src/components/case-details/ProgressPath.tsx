import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pause, Clock, Circle, CheckCircle2, MinusCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { CaseOutcome, CaseStage, Task } from '../../types';
import { CASE_STAGE_LABELS, CASE_STAGE_STEPPER, OUTCOME_LABELS } from '../../lib/caseStage';
import { TASK_STATUS_LABELS, isTaskClosed, isWaiting } from '../../lib/taskStatus';
import type { TimelineEntry } from '../../lib/caseOverview';
import {
  applyStageCompletion,
  stageCompletionPlan,
  stagePosition,
  taskCountLabel,
  type PathStage,
  type PathStageState,
} from '../../lib/progressPath';

/**
 * Overview → progress path (docs/plans/case-overview-progress-path.md, OV.1 +
 * OV.2). A row of chevrons, one per stage of the case's journey, with the
 * selected stage's tasks in a panel underneath. Clicking a stage only changes
 * what the panel shows; completing work is the separate, current-stage-only
 * "Mark stage complete" button, which confirms inline first.
 */

function fmtDate(iso: string | null, pattern = 'd MMM'): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : format(d, pattern);
}

function dateRange(stage: PathStage): string | null {
  if (!stage.startDate) return null;
  const range = stage.startDate === stage.endDate
    ? fmtDate(stage.startDate)
    : `${fmtDate(stage.startDate)} to ${fmtDate(stage.endDate)}`;
  if (stage.allEstimated) return `${range} (estimated)`;
  return stage.estimated ? `${range} (some estimated)` : range;
}

// The chevron shape. The first stage has a flat left edge; the others take a
// notch that the previous chevron's point sits in. Each chevron overlaps the
// previous one by its point minus SEAM, leaving an even, thin seam between them.
const POINT = 12;
const SEAM = 4;
const overlap = (i: number): React.CSSProperties => (i === 0 ? {} : { marginLeft: -(POINT - SEAM) });
const chevronClip = (first: boolean) =>
  first
    ? `polygon(0 0, calc(100% - ${POINT}px) 0, 100% 50%, calc(100% - ${POINT}px) 100%, 0 100%)`
    : `polygon(0 0, calc(100% - ${POINT}px) 0, 100% 50%, calc(100% - ${POINT}px) 100%, 0 100%, ${POINT}px 50%)`;

const CHEVRON_STYLE: Record<PathStageState, string> = {
  done: 'bg-edamame-100 text-edamame-800 dark:bg-edamame-900/60 dark:text-edamame-300 group-hover:bg-edamame-200 dark:group-hover:bg-edamame-900',
  current: 'bg-edamame-700 text-white group-hover:bg-edamame-800',
  upcoming: 'bg-ink/[0.10] text-ink dark:bg-plate-ink/[0.14] dark:text-plate-ink group-hover:bg-ink/[0.15] dark:group-hover:bg-plate-ink/20',
  empty: 'bg-ink/[0.035] text-ink-faint dark:bg-plate-ink/[0.05] dark:text-plate-ink-faint group-hover:bg-ink/[0.07] dark:group-hover:bg-plate-ink/10',
};

function chevronSubline(stage: PathStage, onHold: boolean): string {
  if (stage.state === 'empty') return 'No tasks';
  if (stage.state === 'done') return `${stage.total} done`;
  if (stage.state === 'current' && onHold) return `On hold · ${stage.done} of ${stage.total}`;
  return `${stage.done} of ${stage.total}`;
}

// ---------------------------------------------------------------------------
// Task rows
// ---------------------------------------------------------------------------

const TaskRow: React.FC<{ task: Task; isCurrent: boolean; onOpen: (t: Task) => void }> = ({ task, isCurrent, onOpen }) => {
  const closed = isTaskClosed(task);
  const waiting = isWaiting(task);
  const Icon = task.status === 'done' ? CheckCircle2 : task.status === 'not_applicable' ? MinusCircle : waiting ? Clock : Circle;
  const meta = closed
    ? TASK_STATUS_LABELS[task.status]
    : `${task.datePending ? 'Est.' : 'Due'} ${fmtDate(task.date)}${waiting || task.status === 'in_progress' ? ` · ${TASK_STATUS_LABELS[task.status]}` : ''}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left group transition-colors ${
          isCurrent ? 'bg-edamame-50 dark:bg-edamame-900/25' : 'hover:bg-ink/[0.04] dark:hover:bg-plate-ink/[0.06]'
        }`}
      >
        <Icon
          size={16}
          aria-hidden
          className={`flex-shrink-0 ${
            task.status === 'done' ? 'text-edamame-700 dark:text-edamame-400'
              : waiting ? 'text-amber-600 dark:text-amber-400'
              : isCurrent ? 'text-edamame-700 dark:text-edamame-400'
              : 'text-ink-faint dark:text-plate-ink-faint'
          }`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[13px] group-hover:text-edamame-700 dark:group-hover:text-edamame-400 ${
            closed ? 'line-through text-ink-faint dark:text-plate-ink-faint'
              : isCurrent ? 'font-bold text-ink dark:text-plate-ink'
              : 'text-ink dark:text-plate-ink'
          }`}
        >
          {task.title}
        </span>
        <span className={`flex-shrink-0 text-[11.5px] ${waiting ? 'text-amber-700 dark:text-amber-300' : 'text-ink-faint dark:text-plate-ink-faint'}`}>
          {meta}
        </span>
      </button>
    </li>
  );
};

// ---------------------------------------------------------------------------
// Mark stage complete: inline confirm
// ---------------------------------------------------------------------------

const CompleteStageConfirm: React.FC<{
  stage: PathStage;
  onConfirm: (updates: Task[]) => Promise<void>;
  onCancel: () => void;
}> = ({ stage, onConfirm, onCancel }) => {
  const plan = useMemo(() => stageCompletionPlan(stage.tasks), [stage.tasks]);
  const [includeWaiting, setIncludeWaiting] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = plan.toClose.length + (includeWaiting ? plan.waiting.length : 0);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);

  const submit = async () => {
    setSaving(true);
    try {
      await onConfirm(applyStageCompletion(plan, includeWaiting));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="group"
      aria-labelledby="complete-stage-title"
      className="mt-3 rounded-lg border border-edamame-700/30 dark:border-edamame-400/30 bg-edamame-50/60 dark:bg-edamame-900/20 p-3.5"
      onKeyDown={e => { if (e.key === 'Escape' && !saving) onCancel(); }}
    >
      <p id="complete-stage-title" className="text-[13px] font-bold text-ink dark:text-plate-ink">
        Complete {stage.name}?
      </p>
      {plan.toClose.length > 0 ? (
        <>
          <p className="mt-1 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
            {plan.toClose.length === 1 ? 'This open task will be marked done:' : `These ${plan.toClose.length} open tasks will be marked done:`}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {plan.toClose.map(t => (
              <li key={t.id} className="flex items-center gap-2 text-[12.5px] text-ink dark:text-plate-ink">
                <Check size={13} aria-hidden className="text-edamame-700 dark:text-edamame-400 flex-shrink-0" />
                <span className="truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">Every open task in this stage is waiting on someone.</p>
      )}
      {plan.waiting.length > 0 && (
        <div className="mt-3 pt-3 border-t border-ink/10 dark:border-plate-ink/15">
          <p className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
            {plan.waiting.length === 1
              ? `"${plan.waiting[0].title}" is ${TASK_STATUS_LABELS[plan.waiting[0].status].toLowerCase()}, so it stays open.`
              : `${plan.waiting.length} tasks are waiting on the client or a third party, so they stay open.`}
          </p>
          <label className="mt-1.5 inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink dark:text-plate-ink cursor-pointer">
            <input
              type="checkbox"
              checked={includeWaiting}
              onChange={e => setIncludeWaiting(e.target.checked)}
              className="w-4 h-4 accent-edamame-700"
            />
            Mark {plan.waiting.length === 1 ? 'it' : 'these'} done too
          </label>
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          ref={confirmRef}
          type="button"
          onClick={submit}
          disabled={saving || count === 0}
          className="btn-press px-3.5 py-1.5 bg-edamame-700 hover:bg-edamame-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs transition-colors"
        >
          {saving ? 'Marking done…' : count === 0 ? 'Mark tasks done' : `Mark ${taskCountLabel(count)} done`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-press px-3.5 py-1.5 border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink font-bold rounded-lg text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

interface ProgressPathProps {
  /** Every stage of the case's journey, or null for an older case with no stage information. */
  stages: PathStage[] | null;
  currentTask: Task | null;
  onOpenTask: (task: Task) => void;
  onViewAllTasks: () => void;
  onHold: boolean;
  closed: boolean;
  outcome?: CaseOutcome;
  /** Called with the tasks to save (already marked done). */
  onCompleteStage: (stageName: string, updates: Task[]) => Promise<void>;

  // Older cases without stage information: lifecycle stages + flat task list.
  lifecycleStage: CaseStage;
  timeline: TimelineEntry[];
  hiddenTaskCount: number;
  openTaskCount: number;
  totalTaskCount: number;
}

export const ProgressPath: React.FC<ProgressPathProps> = props => {
  const { stages } = props;
  return stages ? <StagePath {...props} stages={stages} /> : <LifecyclePath {...props} />;
};

const StagePath: React.FC<ProgressPathProps & { stages: PathStage[] }> = ({
  stages, currentTask, onOpenTask, onViewAllTasks, onHold, closed, outcome, onCompleteStage,
}) => {
  const currentRef = stages.find(s => s.state === 'current')?.ref ?? null;
  // null = follow the current stage (it moves on as tasks complete elsewhere).
  const [pickedRef, setPickedRef] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const selected =
    stages.find(s => s.ref === pickedRef)
    ?? stages.find(s => s.ref === currentRef)
    ?? [...stages].reverse().find(s => s.total > 0)
    ?? stages[0];
  const selectedIndex = stages.indexOf(selected);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (ref: string) => {
    setPickedRef(ref === currentRef ? null : ref);
    setConfirming(false);
  };

  // Close the confirm if the stage stops being current underneath it.
  useEffect(() => {
    if (confirming && selected.state !== 'current') setConfirming(false);
  }, [confirming, selected.state]);

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const last = stages.length - 1;
    const next = e.key === 'ArrowRight' ? Math.min(i + 1, last)
      : e.key === 'ArrowLeft' ? Math.max(i - 1, 0)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    buttons.current[next]?.focus();
    select(stages[next].ref);
  };

  const plan = stageCompletionPlan(selected.tasks);
  const canComplete = !closed && selected.state === 'current' && plan.toClose.length + plan.waiting.length > 0;
  const showCurrentTask = selected.state === 'current' && currentTask && selected.tasks.some(t => t.id === currentTask.id);
  const range = dateRange(selected);
  const position = stagePosition(stages, selected);
  const outcomeLabel = closed && outcome ? OUTCOME_LABELS[outcome] : null;

  return (
    <section aria-label="Task progress" className="rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card shadow-sm">
      {/* ── Wide screens: the chevron row ── */}
      <div className="hidden md:block px-[18px] pt-[18px]">
        <div className="flex items-stretch gap-3">
          <ol
            className="grid flex-1 min-w-0"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
          >
            {stages.map((stage, i) => {
              const isSelected = i === selectedIndex;
              return (
                <li key={stage.ref} className="min-w-0 flex flex-col" style={overlap(i)}>
                  <button
                    ref={el => { buttons.current[i] = el; }}
                    type="button"
                    onClick={() => select(stage.ref)}
                    onKeyDown={e => onKeyDown(e, i)}
                    tabIndex={isSelected ? 0 : -1}
                    aria-pressed={isSelected}
                    aria-current={stage.state === 'current' ? 'step' : undefined}
                    title={`${stage.name}: ${chevronSubline(stage, onHold)}`}
                    className="group block w-full rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-edamame-700"
                  >
                    <span
                      className={`flex items-center gap-1.5 h-[52px] text-left transition-colors ${CHEVRON_STYLE[stage.state]} ${
                        i === 0 ? 'pl-3.5 rounded-l-lg' : 'pl-[22px]'
                      } pr-5`}
                      style={{ clipPath: chevronClip(i === 0) }}
                    >
                      {stage.state === 'done' && <Check size={14} strokeWidth={3} aria-hidden className="flex-shrink-0" />}
                      {stage.state === 'current' && onHold && <Pause size={13} aria-hidden className="flex-shrink-0" />}
                      <span className="min-w-0">
                        <span className={`block truncate text-[12.5px] leading-tight ${stage.state === 'current' || isSelected ? 'font-bold' : 'font-semibold'}`}>
                          {stage.name}
                        </span>
                        <span className={`block truncate text-[11px] leading-tight mt-0.5 ${stage.state === 'current' ? 'text-white/85' : 'opacity-80'}`}>
                          {chevronSubline(stage, onHold)}
                        </span>
                      </span>
                    </span>
                  </button>
                  {/* The selected stage points down into its panel. */}
                  <span
                    aria-hidden
                    className={`mx-auto mt-1.5 w-0 h-0 border-x-[7px] border-x-transparent border-b-[7px] transition-opacity ${
                      isSelected ? 'border-b-ink/15 dark:border-b-plate-ink/25 opacity-100' : 'opacity-0 border-b-transparent'
                    }`}
                  />
                </li>
              );
            })}
          </ol>
          {outcomeLabel && (
            <span className="self-start mt-[13px] flex-shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-full bg-ink text-paper dark:bg-plate-ink dark:text-plate">
              {outcomeLabel}
            </span>
          )}
        </div>
      </div>

      {/* ── Narrow screens: a stage picker instead of chevrons ── */}
      <div className="md:hidden px-4 pt-4">
        <label htmlFor="stage-picker" className="block text-[11.5px] text-ink-faint dark:text-plate-ink-faint mb-1">
          {position ? `Stage ${position.n} of ${position.of}` : 'Stage'}{outcomeLabel ? ` · ${outcomeLabel}` : ''}
        </label>
        <select
          id="stage-picker"
          value={selected.ref}
          onChange={e => select(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate text-[13px] font-semibold text-ink dark:text-plate-ink"
        >
          {stages.map(s => (
            <option key={s.ref} value={s.ref}>
              {s.name} ({s.state === 'current' ? 'current, ' : ''}{chevronSubline(s, false).toLowerCase()})
            </option>
          ))}
        </select>
      </div>

      {/* ── Selected-stage panel ── */}
      <div key={selected.ref} className="path-panel-in mx-[18px] mb-[18px] mt-0 max-md:mt-3 border-t border-ink/15 dark:border-plate-ink/25 pt-3.5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-ink dark:text-plate-ink tracking-tight">{selected.name}</h3>
            <p className="text-[12px] text-ink-faint dark:text-plate-ink-faint">
              {selected.total === 0
                ? 'No tasks in this stage yet.'
                : range ?? taskCountLabel(selected.total)}
              {selected.state === 'current' && onHold && (
                <span className="ml-2 inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300">
                  <Pause size={11} aria-hidden /> Case on hold
                </span>
              )}
            </p>
          </div>
          {canComplete && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-press px-3 py-1.5 border border-edamame-700/40 dark:border-edamame-400/40 text-edamame-800 dark:text-edamame-300 hover:bg-edamame-50 dark:hover:bg-edamame-900/30 font-bold rounded-lg text-xs transition-colors"
            >
              Mark stage complete
            </button>
          )}
        </div>

        {confirming && (
          <CompleteStageConfirm
            stage={selected}
            onCancel={() => setConfirming(false)}
            onConfirm={async updates => {
              await onCompleteStage(selected.name, updates);
              setConfirming(false);
            }}
          />
        )}

        {selected.tasks.length > 0 ? (
          <ul className="mt-2 -mx-3">
            {selected.tasks.map(t => (
              <TaskRow key={t.id} task={t} isCurrent={!!showCurrentTask && t.id === currentTask?.id} onOpen={onOpenTask} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[12.5px] text-ink-soft dark:text-plate-ink-soft">
            Tasks for {selected.name} will show here once they're added to the case.{' '}
            <button type="button" onClick={onViewAllTasks} className="font-semibold text-edamame-700 dark:text-edamame-400 hover:underline">
              Go to Tasks
            </button>
          </p>
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Older cases: lifecycle stages, display only, with the flat task list
// ---------------------------------------------------------------------------

const LifecyclePath: React.FC<ProgressPathProps> = ({
  lifecycleStage, timeline, hiddenTaskCount, openTaskCount, totalTaskCount, currentTask, onOpenTask, onViewAllTasks, onHold, closed, outcome,
}) => {
  // info_requested sits with lodged on the path.
  const stage = lifecycleStage === 'info_requested' ? 'lodged' : lifecycleStage;
  const currentIndex = CASE_STAGE_STEPPER.indexOf(stage);
  const outcomeLabel = closed && outcome ? OUTCOME_LABELS[outcome] : null;
  return (
    <section aria-label="Task progress" className="rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card shadow-sm p-[18px]">
      <ol className="hidden md:grid" style={{ gridTemplateColumns: `repeat(${CASE_STAGE_STEPPER.length}, minmax(0, 1fr))` }}>
        {CASE_STAGE_STEPPER.map((s, i) => {
          const state: PathStageState = closed || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming';
          return (
            <li
              key={s}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-1.5 h-[40px] text-[12px] font-semibold ${CHEVRON_STYLE[state]} ${i === 0 ? 'pl-3.5 rounded-l-lg' : 'pl-[22px]'} pr-5`}
              style={{ clipPath: chevronClip(i === 0), ...overlap(i) }}
              title={CASE_STAGE_LABELS[s]}
            >
              {state === 'done' && <Check size={13} strokeWidth={3} aria-hidden className="flex-shrink-0" />}
              {state === 'current' && onHold && <Pause size={12} aria-hidden className="flex-shrink-0" />}
              <span className="truncate">{s === 'closed' && outcomeLabel ? outcomeLabel : CASE_STAGE_LABELS[s]}</span>
            </li>
          );
        })}
      </ol>
      <p className="md:hidden text-[13px] font-semibold text-ink dark:text-plate-ink">
        Stage {currentIndex + 1} of {CASE_STAGE_STEPPER.length}: {CASE_STAGE_LABELS[stage]}{outcomeLabel ? ` (${outcomeLabel})` : ''}
      </p>

      <div className="mt-3.5 border-t border-ink/15 dark:border-plate-ink/25 pt-3.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[15px] font-bold text-ink dark:text-plate-ink tracking-tight">Tasks</h3>
          <span className="text-[12px] text-ink-faint dark:text-plate-ink-faint">
            {totalTaskCount === 0 ? 'None yet' : `${totalTaskCount - openTaskCount} of ${totalTaskCount} done`}
          </span>
          <button type="button" onClick={onViewAllTasks} className="ml-auto text-[12px] font-semibold text-edamame-700 dark:text-edamame-400 hover:underline">
            {totalTaskCount === 0 ? 'Plan tasks' : hiddenTaskCount > 0 ? `View all ${totalTaskCount}` : 'Go to Tasks'}
          </button>
        </div>
        {timeline.length > 0 && (
          <ul className="mt-2 -mx-3">
            {timeline.map(({ task }) => (
              <TaskRow key={task.id} task={task} isCurrent={currentTask?.id === task.id} onOpen={onOpenTask} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ProgressPath;
