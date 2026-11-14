import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { Task } from '../../types';
import type { CasePhaseView } from '../../lib/phaseGrouping';
import { isTaskClosed, isWaiting, TASK_STATUS_LABELS } from '../../lib/taskStatus';

/**
 * A case's tasks grouped by phase (Work Plans spec, step 3), used by Overview
 * → Progress and the Tasks tab. Only the current phase starts unfolded and
 * highlighted; in it the current task is bold and done tasks are struck
 * through. Done phases are folded with a green tick and struck-through name;
 * upcoming phases are folded and grey. Any phase can be unfolded by clicking
 * its header. Empty phases never appear (`buildCasePhaseView` omits them).
 */

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

interface Props {
  view: CasePhaseView;
  onOpenTask: (task: Task) => void;
  /** Optional per-task trailing content. */
  renderTaskActions?: (task: Task) => React.ReactNode;
  /** Replaces the default row entirely (the Tasks tab passes its full task row). The current task is still marked. */
  renderRow?: (task: Task, isCurrent: boolean) => React.ReactNode;
  compact?: boolean;
}

export const PhaseTaskGroups: React.FC<Props> = ({ view, onOpenTask, renderTaskActions, renderRow, compact = false }) => {
  const [open, setOpen] = useState<Set<string>>(() => new Set([view.currentPhaseRef]));

  // When the current phase moves on (a task was completed), follow it.
  useEffect(() => {
    setOpen(prev => (prev.has(view.currentPhaseRef) ? prev : new Set([...prev, view.currentPhaseRef])));
  }, [view.currentPhaseRef]);

  const toggle = (ref: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref); else next.add(ref);
      return next;
    });

  if (view.groups.length === 0) {
    return <p className="text-[12px] text-ink-faint dark:text-plate-ink-faint">No tasks on this case yet.</p>;
  }

  return (
    <div className="space-y-2">
      {view.groups.map(g => {
        const isOpen = open.has(g.ref);
        const pct = g.tasks.length ? (g.doneCount / g.tasks.length) * 100 : 0;
        const panelId = `phase-panel-${g.ref}`;
        return (
          <div
            key={g.ref}
            className={`rounded-xl border overflow-hidden ${
              g.state === 'current' ? 'border-edamame/40 dark:border-edamame/30' : 'border-ink/10 dark:border-plate-ink/15'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(g.ref)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={`focus-ring w-full flex items-center gap-2.5 px-3 ${compact ? 'py-2' : 'py-2.5'} text-left text-[12.5px] font-semibold ${
                g.state === 'current'
                  ? 'bg-edamame/[0.08] dark:bg-edamame/[0.12] text-edamame-800 dark:text-edamame-300'
                  : 'bg-paper dark:bg-plate text-ink-faint dark:text-plate-ink-faint'
              }`}
            >
              {isOpen ? <ChevronDown size={13} className="flex-shrink-0" /> : <ChevronRight size={13} className="flex-shrink-0" />}
              {g.state === 'done' && (
                <span className="w-4 h-4 rounded-full bg-edamame text-white flex items-center justify-center flex-shrink-0" aria-hidden>
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
              <span className={`min-w-0 truncate ${g.state === 'done' ? 'line-through' : ''}`}>{g.name}</span>
              {g.state === 'current' && <span className="sr-only">(current phase)</span>}
              {g.state === 'done' && <span className="sr-only">(complete)</span>}
              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                <span className="w-14 h-1.5 rounded-full bg-ink/10 dark:bg-plate-ink/15 overflow-hidden" aria-hidden>
                  <span className="block h-full bg-edamame rounded-full" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-[11px] font-medium tabular-nums">{g.doneCount}/{g.tasks.length}</span>
              </span>
            </button>
            {isOpen && renderRow && (
              <div id={panelId}>
                {g.tasks.map(task => {
                  const current = view.currentTask?.id === task.id;
                  return (
                    <div
                      key={task.id}
                      className={current ? 'border-l-[3px] border-edamame bg-edamame/[0.05]' : 'border-l-[3px] border-transparent'}
                      aria-current={current ? 'step' : undefined}
                    >
                      {renderRow(task, current)}
                    </div>
                  );
                })}
              </div>
            )}
            {isOpen && !renderRow && (
              <ol id={panelId} className="px-3 py-1.5">
                {g.tasks.map(task => {
                  const done = isTaskClosed(task);
                  const current = view.currentTask?.id === task.id;
                  return (
                    <li key={task.id} className="flex items-start gap-2.5 py-1.5">
                      <span
                        aria-hidden
                        className={`mt-0.5 w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center border-2 ${
                          done
                            ? 'bg-edamame border-edamame text-white'
                            : current
                              ? 'bg-paper-2 dark:bg-plate-card border-edamame ring-4 ring-edamame/15'
                              : 'bg-paper-2 dark:bg-plate-card border-ink/15 dark:border-plate-ink/20'
                        }`}
                      >
                        {done && <Check size={10} strokeWidth={3} />}
                        {current && <span className="w-1.5 h-1.5 rounded-full bg-edamame" />}
                      </span>
                      <button type="button" onClick={() => onOpenTask(task)} className="focus-ring min-w-0 flex-1 text-left group rounded">
                        <div
                          className={`text-[13px] truncate group-hover:text-edamame ${
                            current
                              ? 'font-bold text-ink dark:text-plate-ink'
                              : done
                                ? 'line-through text-ink-faint dark:text-plate-ink-faint'
                                : 'text-ink-soft dark:text-plate-ink-soft'
                          }`}
                        >
                          {task.title}
                          {current && <span className="sr-only"> (current task)</span>}
                        </div>
                        <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                          {done
                            ? `${TASK_STATUS_LABELS[task.status]} · ${fmtDate(task.date)}`
                            : `${task.datePending ? 'Est.' : 'Due'} ${fmtDate(task.date)}${isWaiting(task) ? ` · ${TASK_STATUS_LABELS[task.status]}` : ''}`}
                        </div>
                      </button>
                      {renderTaskActions && <div className="flex-shrink-0">{renderTaskActions(task)}</div>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PhaseTaskGroups;
