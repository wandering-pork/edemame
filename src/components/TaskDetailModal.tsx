import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, Trash2, CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import type { Task, Case, Client, TaskStatus } from '../types';
import { displayCaseNumber } from '../lib/caseNumber';
import { isTaskClosed, isWaiting, withStatus, TASK_STATUS_LABELS, TASK_STATUS_ORDER } from '../lib/taskStatus';

interface TaskDetailModalProps {
  task: Task;
  /** Case the task belongs to, if any. */
  caseItem?: Case;
  /** Client on that case, if resolvable. */
  client?: Client;
  onClose: () => void;
  onUpdateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  /**
   * Date changes route through here rather than `onUpdateTask` so the task is
   * re-sequenced against the other tasks on the destination day — the same
   * path drag-and-drop uses. Saving the date via `onUpdateTask` would carry
   * the old day's `priorityOrder` across and scramble ordering on the new day.
   */
  onMoveTaskDate?: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string },
  ) => void;
  /** When the case link is followed. Lets the host close its own surrounding UI. */
  onNavigateAway?: () => void;
}

/**
 * Task view/edit popup, shared by the Dashboard board and the global search
 * results so a task opens identically from either surface — and, from search,
 * without navigating away from the current module.
 */
export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  caseItem,
  client,
  onClose,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskDate,
  onNavigateAway,
}) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [date, setDate] = useState(task.date);
  // When the status menu picks "Not applicable", a reason must be entered and
  // confirmed before the status change is applied — never via window.prompt.
  const [pendingNaReason, setPendingNaReason] = useState<string | null>(null);

  // Re-seed the draft when a different task is opened from the same mounted modal.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setDate(task.date);
    setPendingNaReason(null);
  }, [task.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDirty = title !== task.title || description !== task.description || date !== task.date;
  const closed = isTaskClosed(task);
  const waiting = isWaiting(task);

  const applyStatus = (status: TaskStatus, reason?: string) => {
    if (!onUpdateTask) return;
    onUpdateTask(withStatus(task, status, reason));
  };

  const handleStatusSelect = (status: TaskStatus) => {
    if (status === 'not_applicable') {
      setPendingNaReason(task.statusReason ?? '');
      return;
    }
    setPendingNaReason(null);
    applyStatus(status);
  };

  const handleConfirmNa = () => {
    if (!pendingNaReason?.trim()) return;
    applyStatus('not_applicable', pendingNaReason);
    setPendingNaReason(null);
  };

  const handleMarkDone = () => {
    setPendingNaReason(null);
    applyStatus(closed ? 'not_started' : 'done');
  };

  const handleSave = () => {
    if (!isDirty || !title.trim() || !date) return;
    const trimmedTitle = title.trim();
    const textChanged = trimmedTitle !== task.title || description !== task.description;
    const dateChanged = date !== task.date;
    if (dateChanged && onMoveTaskDate) {
      // Keeps day-ordering consistent with drag-and-drop; see onMoveTaskDate.
      onMoveTaskDate(
        task.id,
        date,
        false,
        textChanged ? { title: trimmedTitle, description } : undefined,
      );
    } else if (textChanged || dateChanged) {
      onUpdateTask?.({ ...task, title: trimmedTitle, description, date });
    }
    onClose();
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15">
        <div className="px-6 py-4 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between">
          <h3 className="font-bold text-[15px] text-ink dark:text-plate-ink">Task Details</h3>
          <button
            onClick={onClose}
            className="text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft"
            aria-label="Close task details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5">
            <button
              onClick={handleMarkDone}
              className="mt-2 text-edamame-500 flex-shrink-0"
              aria-label={closed ? 'Reopen task' : 'Mark done'}
              title={closed ? 'Reopen task' : 'Mark done'}
            >
              {closed ? <CheckCircle2 size={20} /> : <Circle size={20} className="text-ink-soft/40 dark:text-plate-ink-soft/40" />}
            </button>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={`w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[15px] font-bold ${
                closed ? 'line-through text-ink-faint dark:text-plate-ink-faint' : ''
              }`}
              aria-label="Task title"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1">
              Status
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <select
                  value={task.status}
                  onChange={e => handleStatusSelect(e.target.value as TaskStatus)}
                  className="appearance-none pl-3 pr-8 py-1.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13px] font-semibold"
                  aria-label="Task status"
                >
                  {TASK_STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft dark:text-plate-ink-soft" />
              </div>
              {waiting && (
                <span className="text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {TASK_STATUS_LABELS[task.status]}
                </span>
              )}
            </div>
            {pendingNaReason !== null ? (
              <div className="mt-2 flex items-start gap-2">
                <input
                  type="text"
                  autoFocus
                  value={pendingNaReason}
                  onChange={e => setPendingNaReason(e.target.value)}
                  placeholder="Why is this task not applicable?"
                  className="flex-1 px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13px]"
                  aria-label="Reason task is not applicable"
                />
                <button
                  onClick={handleConfirmNa}
                  disabled={!pendingNaReason.trim()}
                  className="px-3 py-2 text-[12.5px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setPendingNaReason(null)}
                  className="px-2 py-2 text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink"
                >
                  Cancel
                </button>
              </div>
            ) : task.status === 'not_applicable' && task.statusReason ? (
              <div className="mt-1.5 text-[12.5px] text-ink-soft dark:text-plate-ink-soft italic">{task.statusReason}</div>
            ) : null}
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none resize-none text-[13.5px]"
              placeholder="Add details..."
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13.5px]"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1">
              Case
            </label>
            {caseItem ? (
              <div className="text-[13px] text-ink-soft dark:text-plate-ink-soft">
                <span className="text-ink-faint dark:text-plate-ink-faint">{displayCaseNumber(caseItem)}</span>
                {' · '}
                {caseItem.title}
                {client && ` — ${client.name}`}
              </div>
            ) : (
              <div className="text-[13px] text-ink-faint dark:text-plate-ink-faint italic">Not linked to a case</div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              if (!onDeleteTask) return;
              onDeleteTask(task.id);
              onClose();
            }}
            className="p-2 text-ink-faint dark:text-plate-ink-faint hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            aria-label="Delete task"
          >
            <Trash2 size={16} />
          </button>
          <div className="flex items-center gap-2">
            {task.caseId && (
              <button
                onClick={() => {
                  if (isDirty && !window.confirm('You have unsaved changes to this task. Discard them and go to the case?')) {
                    return;
                  }
                  navigate(`/cases/${task.caseId}`);
                  onClose();
                  onNavigateAway?.();
                }}
                className="btn-press flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft border border-ink/15 dark:border-plate-ink/20 hover:bg-white dark:hover:bg-plate-card rounded-lg transition-all"
              >
                Go to Case
                <ArrowRight size={14} />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || !title.trim() || !date}
              className="btn-press px-4 py-2 text-[13px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
