import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight, Trash2, CheckCircle2, Circle, CalendarClock, Check } from 'lucide-react';
import type { Task, Case, Client, TaskStatus, TeamMember } from '../types';
import { displayCaseNumber } from '../lib/caseNumber';
import { isTaskClosed, withStatus, statusChipFor, TASK_STATUS_LABELS, TASK_STATUS_ORDER } from '../lib/taskStatus';
import { overdueLabel } from '../lib/overdueLabel';
import { quickMoveDate, QuickMoveOption } from '../lib/quickMoveDate';
import { PersonPicker } from './PersonPicker';
import { useFirm } from '../contexts/FirmContext';
import { firmJobTitleLabel } from '../lib/firmDirectory';
import type { PersonPickerPerson } from '../lib/personPicker';

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
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => void;
  /** When the case link is followed. Lets the host close its own surrounding UI. */
  onNavigateAway?: () => void;
  /** Display name of `task.assignedTo`, if resolvable — shown in the context line under the title. */
  assigneeName?: string;
  /** Active members selectable in the Assignee field's PersonPicker. Field is hidden if omitted/empty. */
  teamMembers?: TeamMember[];
  /** All cases — for the PersonPicker's workload counts. */
  cases?: Case[];
  /** All tasks — for the PersonPicker's workload counts. */
  allTasks?: Task[];
  currentUserId?: string;
}

const ROLE_LABEL: Record<TeamMember['role'], string> = {
  partner: 'Partner',
  lawyer: 'Lawyer',
  assistant: 'Assistant',
};

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
  assigneeName,
  teamMembers = [],
  cases = [],
  allTasks = [],
  currentUserId,
}) => {
  const navigate = useNavigate();
  const { allMembers } = useFirm();
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [date, setDate] = useState(task.date);
  // When the status menu picks "Not applicable", a reason must be entered and
  // confirmed before the status change is applied — never via window.prompt.
  const [pendingNaReason, setPendingNaReason] = useState<string | null>(null);
  const [moveDateOpen, setMoveDateOpen] = useState(false);
  const [customDateOpen, setCustomDateOpen] = useState(false);
  // Inline confirm for leaving with unsaved edits — never window.confirm.
  const [confirmDiscardNav, setConfirmDiscardNav] = useState(false);

  // Status and quick "Move date" actions apply immediately (no Save) — this
  // tracks the last-known-saved title/description/date so `isDirty` reflects
  // only the Save-gated text/date form below, not the async round-trip delay
  // between an immediate action firing and the updated `task` prop arriving.
  const committedRef = useRef({ title: task.title, description: task.description, date: task.date });

  // Re-seed the draft when a different task is opened from the same mounted modal.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setDate(task.date);
    setPendingNaReason(null);
    setMoveDateOpen(false);
    setCustomDateOpen(false);
    setConfirmDiscardNav(false);
    committedRef.current = { title: task.title, description: task.description, date: task.date };
  }, [task.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isDirty = title !== committedRef.current.title || description !== committedRef.current.description || date !== committedRef.current.date;
  const closed = isTaskClosed(task);
  const context = overdueLabel(task);

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

  const handleWaitingOnClient = () => {
    setPendingNaReason(null);
    applyStatus(task.status === 'waiting_client' ? 'not_started' : 'waiting_client');
  };

  // Quick "Move date" actions apply immediately — same dateLocked-on-manual-
  // edit rule as the Due Date field below (see `Task.dateLocked`), just
  // without needing Save first.
  const commitDate = (newDate: string) => {
    committedRef.current = { ...committedRef.current, date: newDate };
    setDate(newDate);
    if (onMoveTaskDate) {
      onMoveTaskDate(task.id, newDate, false, { dateLocked: true });
    } else {
      onUpdateTask?.({ ...task, date: newDate, dateLocked: true });
    }
  };

  const handleQuickMove = (option: QuickMoveOption) => {
    commitDate(quickMoveDate(task.date, option));
    setMoveDateOpen(false);
  };

  const handleCustomDatePick = (newDate: string) => {
    if (!newDate) return;
    commitDate(newDate);
    setMoveDateOpen(false);
    setCustomDateOpen(false);
  };

  // Context line under the title — whichever of these apply, in priority order.
  const contextParts: string[] = [];
  if (task.datePending) {
    contextParts.push('Estimated date — firms up when the previous step is done');
  } else if (context) {
    contextParts.push(context);
  }
  if (assigneeName) contextParts.push(`Assigned to ${assigneeName}`);
  const contextLine = contextParts.join(' · ');

  const goToCase = () => {
    navigate(`/cases/${task.caseId}`);
    onClose();
    onNavigateAway?.();
  };

  const handleGoToCaseClick = () => {
    if (isDirty) {
      setConfirmDiscardNav(true);
      return;
    }
    goToCase();
  };

  const applyAssignee = (personId: string | undefined) => {
    if (!onUpdateTask) return;
    onUpdateTask({ ...task, assignedTo: personId });
    setAssigneePickerOpen(false);
  };

  const assigneePeople: PersonPickerPerson[] = teamMembers.map(m => {
    const row = allMembers.find(r => r.userId === m.id);
    const jobTitle = (row && firmJobTitleLabel(row.jobTitle)) || ROLE_LABEL[m.role];
    return { id: m.id, name: m.name, email: m.email, avatar: m.avatar, jobTitle, status: m.status };
  });

  const handleSave = () => {
    if (!isDirty || !title.trim() || !date) return;
    const trimmedTitle = title.trim();
    const textChanged = trimmedTitle !== task.title || description !== task.description;
    const dateChanged = date !== task.date;
    if (dateChanged && onMoveTaskDate) {
      // Keeps day-ordering consistent with drag-and-drop; see onMoveTaskDate.
      // A manual date edit locks the date so `reschedule()` never overwrites
      // it again — see `Task.dateLocked`.
      onMoveTaskDate(
        task.id,
        date,
        false,
        { ...(textChanged ? { title: trimmedTitle, description } : {}), dateLocked: true },
      );
    } else if (textChanged || dateChanged) {
      onUpdateTask?.({ ...task, title: trimmedTitle, description, date, dateLocked: dateChanged ? true : task.dateLocked });
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
          <div>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={`w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[15px] font-bold ${
                closed ? 'line-through text-ink-faint dark:text-plate-ink-faint' : ''
              }`}
              aria-label="Task title"
            />
            {contextLine && (
              <div className="mt-1 text-[11.5px] text-ink-soft dark:text-plate-ink-soft">{contextLine}</div>
            )}
          </div>

          {/* One-click actions — apply immediately, no Save needed */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={handleMarkDone}
              className={`btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border transition-colors ${
                closed
                  ? 'border-edamame bg-edamame/10 text-edamame-700 dark:text-edamame-400'
                  : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame'
              }`}
            >
              {closed ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {closed ? 'Reopen' : 'Mark done'}
            </button>
            <button
              onClick={handleWaitingOnClient}
              className={`btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border transition-colors ${
                task.status === 'waiting_client'
                  ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                  : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-400'
              }`}
            >
              Waiting on client
            </button>
            <div className="relative">
              <button
                onClick={() => setMoveDateOpen(o => !o)}
                className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-bold rounded-lg border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
                aria-haspopup="menu"
                aria-expanded={moveDateOpen}
              >
                <CalendarClock size={13} />
                Move date
              </button>
              {moveDateOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => { setMoveDateOpen(false); setCustomDateOpen(false); }} />
                  <div role="menu" className="absolute left-0 top-full mt-1 z-40 w-44 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1">
                    <button
                      role="menuitem"
                      onClick={() => handleQuickMove('+1d')}
                      className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate transition-colors"
                    >
                      +1 day
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleQuickMove('+1w')}
                      className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate transition-colors"
                    >
                      +1 week
                    </button>
                    {customDateOpen ? (
                      <input
                        type="date"
                        autoFocus
                        defaultValue={task.date}
                        onChange={e => handleCustomDatePick(e.target.value)}
                        className="w-full mt-0.5 px-2.5 py-1.5 text-[12px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg outline-none focus:border-edamame text-ink dark:text-plate-ink"
                      />
                    ) : (
                      <button
                        role="menuitem"
                        onClick={() => setCustomDateOpen(true)}
                        className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate transition-colors"
                      >
                        Pick a date…
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1.5">
              Status
            </label>
            {/* Segmented status control — the one source of truth for a task's status. Applies immediately. */}
            <div role="group" aria-label="Task status" className="flex items-center gap-1.5 flex-wrap">
              {TASK_STATUS_ORDER.map(s => {
                const selected = task.status === s;
                const optionChip = statusChipFor(s);
                const selectedClass = optionChip
                  ? optionChip.className
                  : 'bg-edamame/10 text-edamame-700 dark:text-edamame-400';
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleStatusSelect(s)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-semibold rounded-lg border transition-colors ${
                      selected
                        ? `border-transparent ${selectedClass}`
                        : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame'
                    }`}
                  >
                    {selected && <Check size={11} />}
                    {TASK_STATUS_LABELS[s]}
                  </button>
                );
              })}
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

          {teamMembers.length > 0 && (
            <div>
              <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1">
                Assignee
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAssigneePickerOpen(o => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={assigneePickerOpen}
                  className="w-full flex items-center justify-between px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-left text-[13.5px] text-ink dark:text-plate-ink outline-none hover:border-edamame-500 focus-ring transition-colors"
                >
                  <span className={assigneeName ? '' : 'text-ink-faint dark:text-plate-ink-faint italic'}>
                    {assigneeName || 'Unassigned'}
                  </span>
                  <span className="text-ink-faint dark:text-plate-ink-faint text-[11px]">Change</span>
                </button>
                {assigneePickerOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setAssigneePickerOpen(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-2">
                      <PersonPicker
                        people={assigneePeople}
                        cases={cases}
                        tasks={allTasks}
                        value={task.assignedTo}
                        onChange={applyAssignee}
                        currentUserId={currentUserId}
                        allowUnassigned
                        autoFocus
                        onEscape={() => setAssigneePickerOpen(false)}
                        aria-label="Assign task to"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

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
            <label className="block text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft mb-1 flex items-center gap-1.5">
              Due Date
              {task.datePending && date === task.date && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                  title="Computed from a duration estimate — will firm up once the real anchor is known."
                >
                  Estimated
                </span>
              )}
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

        <div className="px-6 pt-2 text-[11px] text-ink-faint dark:text-plate-ink-faint">
          Status and date quick-actions above apply immediately. Save below applies edits to the title, description or the Due Date field.
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
              confirmDiscardNav ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-ink-soft dark:text-plate-ink-soft">Discard unsaved edits?</span>
                  <button
                    onClick={goToCase}
                    className="px-2.5 py-1.5 text-[12px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors"
                  >
                    Discard &amp; go
                  </button>
                  <button
                    onClick={() => setConfirmDiscardNav(false)}
                    className="px-2 py-1.5 text-[12px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGoToCaseClick}
                  className="btn-press flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft border border-ink/15 dark:border-plate-ink/20 hover:bg-white dark:hover:bg-plate-card rounded-lg transition-all"
                >
                  Go to Case
                  <ArrowRight size={14} />
                </button>
              )
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
