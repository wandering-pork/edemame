import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, Trash2, CheckCircle2, Circle } from 'lucide-react';
import type { Task, Case, Client } from '../types';
import { displayCaseNumber } from '../lib/caseNumber';

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
  onMoveTaskDate?: (taskId: string, newDate: string, offsetFuture: boolean) => void;
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

  // Re-seed the draft when a different task is opened from the same mounted modal.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setDate(task.date);
  }, [task.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDirty = title !== task.title || description !== task.description || date !== task.date;

  const handleSave = () => {
    if (!isDirty || !title.trim() || !date) return;
    const textChanged = title.trim() !== task.title || description !== task.description;
    if (textChanged) {
      onUpdateTask?.({ ...task, title: title.trim(), description });
    }
    if (date !== task.date) {
      // Keeps day-ordering consistent with drag-and-drop; see onMoveTaskDate.
      if (onMoveTaskDate) {
        onMoveTaskDate(task.id, date, false);
      } else {
        onUpdateTask?.({ ...task, title: title.trim(), description, date });
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">Task Details</h3>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            aria-label="Close task details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => onUpdateTask?.({ ...task, isCompleted: !task.isCompleted })}
              className="mt-2 text-edamame-500 flex-shrink-0"
              aria-label={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
            >
              {task.isCompleted ? <CheckCircle2 size={20} /> : <Circle size={20} className="text-slate-300 dark:text-slate-600" />}
            </button>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={`w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[15px] font-bold ${
                task.isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''
              }`}
              aria-label="Task title"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none resize-none text-[13.5px]"
              placeholder="Add details..."
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[13.5px]"
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Case
            </label>
            {caseItem ? (
              <div className="text-[13px] text-slate-700 dark:text-slate-300">
                <span className="text-slate-400 dark:text-slate-500">{displayCaseNumber(caseItem)}</span>
                {' · '}
                {caseItem.title}
                {client && ` — ${client.name}`}
              </div>
            ) : (
              <div className="text-[13px] text-slate-400 dark:text-slate-500 italic">Not linked to a case</div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            onClick={() => {
              if (!onDeleteTask) return;
              onDeleteTask(task.id);
              onClose();
            }}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            aria-label="Delete task"
          >
            <Trash2 size={16} />
          </button>
          <div className="flex items-center gap-2">
            {task.caseId && (
              <button
                onClick={() => {
                  navigate(`/cases/${task.caseId}`);
                  onClose();
                  onNavigateAway?.();
                }}
                className="btn-press flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200 border border-gray-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all"
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
};
