import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task, Case, Client, TeamMember, ActivityEvent, DocumentChecklistItem, Deadline, WorkflowTemplate } from '../types';
import {
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  differenceInCalendarDays,
} from 'date-fns';
import { Plus, Sparkles, Calendar as CalendarIcon, X, Link as LinkIcon, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { buildWindow, computeAutoWindowStart, jumpWeek, stepDay } from '../lib/calendarWindow';
import {
  overdueTasksFor, dueTodayTasksFor, waitingTasksFor, buildAttentionItems, deadlineAttentionItemsFor, mergeAttentionItems,
  scopeTasksForAttention, scopeDeadlinesForAttention, AttentionScope,
} from '../lib/attention';
import { allDeadlines } from '../lib/deadlines';
import { isTaskClosed } from '../lib/taskStatus';
import { describePlanSource, buildTaskPlanSummary } from '../lib/planActivity';
import { isCaseClosed } from '../lib/caseStage';
import { TaskDetailModal } from '../components/TaskDetailModal';

interface DashboardProps {
  tasks: Task[];
  cases: Case[];
  clients: Client[];
  /**
   * Optional — used only to name the template in the "Recent activity"
   * panel's fallback wording (see `activity` below) when an old case has no
   * `tasks_planned` `ActivityEvent` to read a name from directly.
   */
  templates?: WorkflowTemplate[];
  /** Optional — App.tsx loads `deadlines` from `repos.deadlines`; when absent, "Needs attention" shows tasks only. */
  deadlines?: Deadline[];
  teamMembers?: TeamMember[];
  currentUserId?: string;
  /** Cloud mode only — shows the Needs Attention scope toggle. Local mode is always single-user, so "mine" and "all" are the same set and the toggle stays hidden. */
  storageMode?: 'local' | 'cloud';
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onMoveTaskOrder: (taskId: string, direction: 'up' | 'down') => void;
  onMoveTaskDate: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => void;
  onAddTask: (task: Task) => void;
  /**
   * Optional — App.tsx's `activity: ActivityEvent[]` state, wired in from the
   * `/dashboard` route. When supplied, "Recent activity" renders real events
   * (including the `tasks_planned` event `handleTasksConfirmed` writes, whose
   * wording already distinguishes an AI-generated plan from one created
   * deterministically from a template — see `lib/planActivity.ts`) with real
   * relative timestamps; when absent (e.g. a case created before that event
   * type existed), it falls back to a best-effort feed built from the case's
   * tasks using the same `lib/planActivity.ts` wording (no timestamps
   * available on `Task`, so no "time ago" is shown there).
   */
  activity?: ActivityEvent[];
  /**
   * Optional — no route currently passes per-case document checklist data to
   * Dashboard (it lives behind `repos.checklist`, scoped to Case Details).
   * When supplied, the "Docs outstanding" stat and its delta are computed
   * from real checklist items; when absent, the card shows a neutral
   * placeholder rather than a fabricated number.
   */
  checklistItems?: DocumentChecklistItem[];
}

type ScopeFilter = 'mine' | 'team' | 'all';

// Note: a task's due date is never labelled "Deadline" here — since Step 1 ·
// 1D, a `Deadline` is a separate, external, consequential date (s56/s57,
// visa/passport expiry — see `lib/deadlines.ts`) shown in the case page's
// Deadlines panel, not something derived from a task. "OVERDUE"/"DUE TODAY"
// describe the task's own due date only.
const EVENT_KIND: Record<'task' | 'filing' | 'overdue' | 'due_today', { label: string; edge: string; bg: string; text: string }> = {
  task: {
    label: 'Task',
    edge: '#3B82F6',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
  },
  filing: {
    label: 'Filing',
    edge: '#29B767',
    bg: 'bg-edamame/10 dark:bg-edamame/15',
    text: 'text-edamame-700 dark:text-edamame-400',
  },
  overdue: {
    label: 'Overdue',
    edge: '#EF4444',
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
  },
  due_today: {
    label: 'Due today',
    edge: '#F59E0B',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
  },
};

/**
 * Task doesn't carry a "kind" (task/filing/overdue/due today) in the data
 * model, so this is a heuristic: an open task past its due date reads as
 * Overdue, one due today reads as Due today, a title suggesting a lodgement
 * reads as Filing, everything else is a plain Task.
 */
const getEventKind = (task: Task): keyof typeof EVENT_KIND => {
  if (!isTaskClosed(task)) {
    const daysUntil = differenceInCalendarDays(startOfDay(new Date(task.date)), startOfDay(new Date()));
    if (daysUntil < 0) return 'overdue';
    if (daysUntil === 0) return 'due_today';
  }
  const t = task.title.toLowerCase();
  if (/\blodge|\bfiling|\bfile\b|\bsubmit|\bsubmission/.test(t)) return 'filing';
  return 'task';
};

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  cases,
  clients,
  templates = [],
  deadlines = [],
  teamMembers = [],
  currentUserId,
  storageMode = 'local',
  activity = [],
  checklistItems,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskDate,
}) => {
  const navigate = useNavigate();
  const [boardScope, setBoardScope] = useState<ScopeFilter>(currentUserId ? 'mine' : 'all');
  // Step 1 · 1G.7 — Needs Attention and the stats below follow this scope,
  // "Mine" by default in cloud mode. Local mode is single-user, so scoping
  // would be a no-op — default straight to 'all' and hide the toggle.
  const [attentionScope, setAttentionScope] = useState<AttentionScope>(storageMode === 'cloud' ? 'mine' : 'all');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), caseId: '' });
  const [caseSearchTerm, setCaseSearchTerm] = useState('');
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  /**
   * `null` = auto mode: the window start is recomputed from TODAY on every
   * render (see computeAutoWindowStart). The first click on any nav arrow
   * pins an explicit start here, suspending auto-calibration until the user
   * clicks "Today" or re-enters the Dashboard.
   */
  const [manualWindowStart, setManualWindowStart] = useState<Date | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dragOverDayKey, setDragOverDayKey] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const currentUser = teamMembers.find(m => m.id === currentUserId);
  const firstName = currentUser?.name.split(' ')[0] || 'there';

  const getClient = (clientId: string) => clients.find(c => c.id === clientId);
  const getCase = (caseId?: string) => (caseId ? cases.find(c => c.id === caseId) : undefined);
  const getCaseAndClient = (caseId?: string) => {
    const c = getCase(caseId);
    return { case: c, client: c ? getClient(c.clientId) : undefined };
  };
  const getClientName = (clientId: string) => getClient(clientId)?.name || 'Unknown Client';

  // ── New Task modal ────────────────────────────────────────────────────
  const filteredCases = useMemo(
    () =>
      cases.filter(c =>
        `${c.title} ${getClientName(c.clientId)}`.toLowerCase().includes(caseSearchTerm.toLowerCase())
      ),
    [cases, caseSearchTerm]
  );

  const handleOpenTaskModal = () => {
    setNewTask({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), caseId: '' });
    setCaseSearchTerm('');
    setIsTaskModalOpen(true);
  };

  const handleSelectCase = (c: Case) => {
    setNewTask({ ...newTask, caseId: c.id });
    setCaseSearchTerm(`${c.title} - ${getClientName(c.clientId)}`);
    setIsCaseDropdownOpen(false);
  };

  const handleSaveTask = () => {
    if (!newTask.title || !newTask.date || !onAddTask) return;
    onAddTask({
      id: uuidv4(),
      title: newTask.title,
      description: newTask.description,
      date: newTask.date,
      caseId: newTask.caseId || undefined,
      status: 'not_started',
      isCompleted: false,
      priorityOrder: 99999,
      generatedByAi: false,
    });
    setIsTaskModalOpen(false);
  };

  // ── Scoped tasks (by owner) — reused for the "This week" board segments ──
  const scopeTasks = (scope: ScopeFilter, list: Task[]) => {
    if (scope === 'all' || !currentUserId) return list;
    if (scope === 'mine') return list.filter(t => t.assignedTo === currentUserId || !t.assignedTo);
    return list.filter(t => t.assignedTo && t.assignedTo !== currentUserId);
  };

  // ── Stat cards ─────────────────────────────────────────────────────────
  const activeCases = useMemo(() => cases.filter(c => !isCaseClosed(c) && !c.onHold), [cases]);
  const newCasesThisMonth = useMemo(
    () => cases.filter(c => c.createdAt && isSameMonth(new Date(c.createdAt), now)).length,
    [cases]
  );

  // Overdue / due-today / waiting / due-this-week all follow attentionScope
  // (Step 1 · 1G.7) — "Mine" is assigned to me or unassigned, same rule as
  // the board's own scope toggle.
  const scopedTasksForStats = useMemo(
    () => scopeTasksForAttention(tasks, attentionScope, currentUserId),
    [tasks, attentionScope, currentUserId]
  );
  const overdueTasks = useMemo(() => overdueTasksFor(scopedTasksForStats, today), [scopedTasksForStats]);
  const dueTodayTasks = useMemo(() => dueTodayTasksFor(scopedTasksForStats, today), [scopedTasksForStats]);
  const waitingTasks = useMemo(() => waitingTasksFor(scopedTasksForStats), [scopedTasksForStats]);
  const dueThisWeekTasks = useMemo(
    () =>
      scopedTasksForStats.filter(t => {
        if (isTaskClosed(t)) return false;
        const d = differenceInCalendarDays(startOfDay(new Date(t.date)), today);
        return d >= 0 && d <= 6;
      }),
    [scopedTasksForStats]
  );

  const docsOutstanding = checklistItems
    ? checklistItems.filter(i => i.status === 'pending' || i.status === 'linked').length
    : null;

  const topOverdue = overdueTasks[0];
  const topOverdueLabel = topOverdue
    ? `${topOverdue.title}${getCaseAndClient(topOverdue.caseId).client ? ` — ${getCaseAndClient(topOverdue.caseId).client!.name}` : ''}`
    : 'All caught up';

  const stats = [
    {
      label: 'Cases in motion',
      value: String(activeCases.length),
      delta: newCasesThisMonth > 0 ? `+${newCasesThisMonth} this month` : 'No new cases this month',
      color: newCasesThisMonth > 0 ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-slate-400 dark:text-slate-500',
    },
    {
      label: 'Tasks due this week',
      value: String(dueThisWeekTasks.length),
      delta: `${dueTodayTasks.length} today`,
      color: 'text-slate-400 dark:text-slate-500',
    },
    {
      label: 'Overdue',
      value: String(overdueTasks.length),
      delta: topOverdueLabel,
      color: overdueTasks.length > 0 ? 'text-[#B91C1C] dark:text-[#F87171]' : 'text-[#047857] dark:text-[#4ADE80]',
    },
    {
      label: 'Docs outstanding',
      value: docsOutstanding !== null ? String(docsOutstanding) : '—',
      delta: docsOutstanding !== null ? 'Across active checklists' : 'Not tracked on this screen',
      color: docsOutstanding !== null ? 'text-[#B45309] dark:text-[#FBBF24]' : 'text-slate-400 dark:text-slate-500',
    },
    {
      label: 'Waiting on client',
      value: String(waitingTasks.length),
      delta: waitingTasks.length > 0 ? 'Not counted as overdue' : 'Nothing blocked',
      color: 'text-slate-400 dark:text-slate-500',
    },
  ];

  const summaryLine = `${dueTodayTasks.length} task${dueTodayTasks.length === 1 ? '' : 's'} due today · ${overdueTasks.length} overdue${
    docsOutstanding !== null ? ` · ${docsOutstanding} documents outstanding` : ''
  }`;

  // ── Needs attention ───────────────────────────────────────────────────
  const [showAllAttention, setShowAllAttention] = useState(false);
  const ATTENTION_VISIBLE_DEFAULT = 5;
  const getClientById = (clientId?: string) => (clientId ? clients.find(c => c.id === clientId) : undefined);
  const taskAttentionItems = useMemo(
    () => buildAttentionItems(overdueTasks, dueTodayTasks, getCaseAndClient, iso => format(new Date(iso), 'd MMM')),
    [overdueTasks, dueTodayTasks, cases, clients]
  );
  const scopedDeadlinesForAttention = useMemo(
    () => scopeDeadlinesForAttention(allDeadlines(deadlines, clients), cases, attentionScope, currentUserId),
    [deadlines, clients, cases, attentionScope, currentUserId]
  );
  const deadlineAttentionItems = useMemo(
    () => deadlineAttentionItemsFor(scopedDeadlinesForAttention, today, getCaseAndClient, getClientById),
    [scopedDeadlinesForAttention, cases, clients, today.getTime()]
  );
  // Deadlines at urgency ≥ soon rank above tasks, ranked by consequence — see plan 1D.
  const allAttentionItems = useMemo(
    () => mergeAttentionItems(deadlineAttentionItems, taskAttentionItems),
    [deadlineAttentionItems, taskAttentionItems]
  );
  const attentionItems = showAllAttention ? allAttentionItems : allAttentionItems.slice(0, ATTENTION_VISIBLE_DEFAULT);
  const hiddenAttentionCount = allAttentionItems.length - attentionItems.length;

  const handleAttentionItemClick = (item: (typeof allAttentionItems)[number]) => {
    if (item.kind === 'deadline') {
      if (item.caseId) {
        navigate(`/cases/${item.caseId}`);
      } else if (item.clientId) {
        navigate('/clients', { state: { focusClientId: item.clientId } });
      }
      return;
    }
    setSelectedTaskId(item.id);
  };

  // ── Recent activity ────────────────────────────────────────────────────
  const activityItems = useMemo(() => {
    if (activity.length > 0) {
      return [...activity]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map(ev => {
          const { case: c, client } = getCaseAndClient(ev.subjectId && cases.some(cc => cc.id === ev.subjectId) ? ev.subjectId : undefined);
          const days = differenceInCalendarDays(today, startOfDay(new Date(ev.createdAt)));
          const time = days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`;
          return {
            id: ev.id,
            title: ev.summary,
            sub: c ? `${c.title}${client ? ` · ${client.name}` : ''}` : '',
            time,
          };
        });
    }

    // Fallback: no ActivityEvent[] wired in (e.g. very old cases from before
    // `tasks_planned` events were recorded) — approximate from the tasks
    // themselves, using the same wording `App.tsx`'s `handleTasksConfirmed`
    // writes for a real event, so a case with a template-only plan doesn't
    // read as AI-generated just because this panel is labelled with a
    // sparkle icon.
    const caseIdsWithTasks: string[] = Array.from(new Set(tasks.filter(t => t.caseId).map(t => t.caseId as string)));
    return caseIdsWithTasks.slice(0, 4).map(caseId => {
      const { case: c, client } = getCaseAndClient(caseId);
      const caseTasks = tasks.filter(t => t.caseId === caseId);
      const template = templates.find(t => t.id === c?.templateId);
      return {
        id: caseId,
        title: buildTaskPlanSummary(caseTasks.length, describePlanSource(caseTasks), template?.title) || 'Task plan created',
        sub: c ? `${c.title}${client ? ` · ${client.name}` : ''}` : '',
        time: '—',
      };
    });
  }, [activity, tasks, cases, clients, templates]);

  // ── This week board ───────────────────────────────────────────────────
  const autoWindowStart = useMemo(() => computeAutoWindowStart(today), [today.getTime()]);
  const windowStart = manualWindowStart ?? autoWindowStart;
  const windowDays = useMemo(() => buildWindow(windowStart), [windowStart.getTime()]);
  const windowContainsToday = windowDays.some(d => isSameDay(d, today));
  const isAutoWindow = manualWindowStart === null;

  const boardTasks = scopeTasks(boardScope, tasks);
  const getTasksForDay = (day: Date) =>
    boardTasks.filter(t => isSameDay(new Date(t.date), day));

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) || null : null;
  const selectedTaskCaseAndClient = getCaseAndClient(selectedTask?.caseId);

  const handleDropOnDay = (day: Date) => {
    setDragOverDayKey(null);
    if (!draggingTaskId || !onMoveTaskDate) {
      setDraggingTaskId(null);
      return;
    }
    const newDate = format(day, 'yyyy-MM-dd');
    // A calendar drag is a manual date edit — see `Task.dateLocked`.
    onMoveTaskDate(draggingTaskId, newDate, false, { dateLocked: true });
    setDraggingTaskId(null);
  };

  const segs: { key: ScopeFilter; label: string }[] = [
    { key: 'mine', label: 'My Tasks' },
    { key: 'team', label: 'Team' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-soft dark:text-plate-ink-soft">
              {format(now, 'EEEE, d MMMM yyyy')}
            </div>
            <h1 className="font-serif text-[29px] font-semibold tracking-[-0.02em] text-ink dark:text-plate-ink mt-1.5">
              {greeting}, {firstName}
            </h1>
            <div className="text-[13.5px] text-ink-soft dark:text-plate-ink-soft mt-1">{summaryLine}</div>
          </div>
          <button
            onClick={handleOpenTaskModal}
            className="btn-press flex items-center justify-center gap-1.5 bg-edamame-500 hover:bg-edamame-600 text-white px-4 py-2.5 rounded-[10px] text-[13px] font-bold transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <Plus size={16} />
            New Task
          </button>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mt-[22px]">
          {stats.map(st => (
            <div
              key={st.label}
              className="stat-card bg-paper-2/70 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl px-[18px] py-4"
            >
              <div className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft">
                {st.label}
              </div>
              <div className="flex items-baseline gap-2 mt-[7px]">
                <span className="font-mono text-[24px] font-medium tracking-[-0.01em] text-ink dark:text-plate-ink">
                  {st.value}
                </span>
                <span className={`text-[11px] font-semibold truncate ${st.color}`}>{st.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Needs attention / Recent activity ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3.5 mt-3.5 items-start">
          {/* Needs attention */}
          <div className="bg-paper-2/70 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-1 gap-2">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft">
                Needs attention
              </span>
              <div className="flex items-center gap-2">
                {storageMode === 'cloud' && (
                  <div className="flex gap-0.5 p-[2px] bg-paper-2 dark:bg-plate rounded-md" role="group" aria-label="Needs attention scope">
                    <button
                      onClick={() => setAttentionScope('mine')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        attentionScope === 'mine'
                          ? 'bg-paper dark:bg-plate-card text-ink dark:text-plate-ink'
                          : 'text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink'
                      }`}
                    >
                      Mine
                    </button>
                    <button
                      onClick={() => setAttentionScope('all')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                        attentionScope === 'all'
                          ? 'bg-paper dark:bg-plate-card text-ink dark:text-plate-ink'
                          : 'text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink'
                      }`}
                    >
                      All
                    </button>
                  </div>
                )}
                <span
                  className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-md whitespace-nowrap ${
                    allAttentionItems.length > 0
                      ? 'bg-red-500/[.13] text-[#B91C1C] dark:text-[#F87171]'
                      : 'bg-edamame/10 text-[#047857] dark:text-[#4ADE80]'
                  }`}
                >
                  {allAttentionItems.length > 0 ? `${allAttentionItems.length} item${allAttentionItems.length === 1 ? '' : 's'}` : 'All clear'}
                </span>
              </div>
            </div>
            <div className="px-5 pb-2.5 text-[10.5px] text-ink-soft/70 dark:text-plate-ink-soft/70">
              {attentionScope === 'mine' ? 'Your tasks' : 'All tasks'} — overdue first, then due today.
            </div>
            {attentionItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-ink-soft dark:text-plate-ink-soft border-t border-ink/10 dark:border-plate-ink/15">
                Nothing needs attention right now.
              </div>
            ) : (
              <>
                {attentionItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleAttentionItemClick(item)}
                    className="flex items-center gap-3 px-5 py-3 border-t border-ink/10 dark:border-plate-ink/15 cursor-pointer transition-colors hover:bg-paper-2 dark:hover:bg-plate/60"
                  >
                    <span
                      className="badge-pulse w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.dot }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold tracking-[-0.01em] text-ink dark:text-plate-ink truncate">
                        {item.title}
                      </div>
                      <div className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5 truncate">{item.sub}</div>
                    </div>
                    <span className="text-xs font-semibold text-edamame-600 dark:text-edamame-400 whitespace-nowrap">
                      {item.kind === 'deadline' ? (item.caseId ? 'View case →' : 'View client →') : 'View task →'}
                    </span>
                  </div>
                ))}
                {hiddenAttentionCount > 0 && (
                  <button
                    onClick={() => setShowAllAttention(true)}
                    className="w-full px-5 py-2.5 border-t border-ink/10 dark:border-plate-ink/15 text-[12px] font-semibold text-edamame-600 dark:text-edamame-400 hover:bg-paper-2 dark:hover:bg-plate/60 transition-colors text-left"
                  >
                    View all {allAttentionItems.length}
                  </button>
                )}
                {showAllAttention && allAttentionItems.length > ATTENTION_VISIBLE_DEFAULT && (
                  <button
                    onClick={() => setShowAllAttention(false)}
                    className="w-full px-5 py-2.5 border-t border-ink/10 dark:border-plate-ink/15 text-[12px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate/60 transition-colors text-left"
                  >
                    Show fewer
                  </button>
                )}
              </>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-paper-2/70 dark:bg-plate-card border border-ink/10 dark:border-plate-ink/15 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-4 pb-2.5">
              <Sparkles size={14} className="text-edamame-500" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-ink-soft dark:text-plate-ink-soft">
                Recent activity
              </span>
            </div>
            {activityItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-ink-soft dark:text-plate-ink-soft border-t border-ink/10 dark:border-plate-ink/15">
                No activity yet.
              </div>
            ) : (
              activityItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-2.5 border-t border-ink/10 dark:border-plate-ink/15"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink dark:text-plate-ink truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-ink-soft dark:text-plate-ink-soft mt-0.5 truncate">{item.sub}</div>
                  </div>
                  <span className="font-mono-ai text-[10.5px] text-edamame-700 dark:text-edamame-400 whitespace-nowrap">{item.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── This week ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-7 mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-serif text-lg font-semibold tracking-[-0.01em] text-ink dark:text-plate-ink">
              {windowContainsToday ? 'This week' : 'Week of'}
            </h3>
            <span className="font-mono text-xs text-ink-soft dark:text-plate-ink-soft">
              {format(windowDays[0], 'MMM d')} – {format(windowDays[windowDays.length - 1], 'MMM d, yyyy')}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setManualWindowStart(jumpWeek(windowStart, -1))}
                aria-label="Previous week"
                title="Previous week"
                className="p-1 rounded-md text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate hover:text-ink dark:hover:text-plate-ink transition-colors"
              >
                <SkipBack size={15} />
              </button>
              <button
                onClick={() => setManualWindowStart(stepDay(windowStart, -1))}
                aria-label="Previous day"
                title="Previous day"
                className="p-1 rounded-md text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate hover:text-ink dark:hover:text-plate-ink transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setManualWindowStart(stepDay(windowStart, 1))}
                aria-label="Next day"
                title="Next day"
                className="p-1 rounded-md text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate hover:text-ink dark:hover:text-plate-ink transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setManualWindowStart(jumpWeek(windowStart, 1))}
                aria-label="Next week"
                title="Next week"
                className="p-1 rounded-md text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate hover:text-ink dark:hover:text-plate-ink transition-colors"
              >
                <SkipForward size={15} />
              </button>
              {!isAutoWindow && (
                <button
                  onClick={() => setManualWindowStart(null)}
                  className="ml-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase text-edamame-600 dark:text-edamame-400 hover:bg-edamame/10 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-0.5 p-[3px] bg-paper-2 dark:bg-plate rounded-[9px]">
            {segs.map(sg => (
              <button
                key={sg.key}
                onClick={() => setBoardScope(sg.key)}
                className={`px-3.5 py-1.5 rounded-[7px] text-xs font-semibold transition-all ${
                  boardScope === sg.key
                    ? 'bg-paper dark:bg-plate-card text-ink dark:text-plate-ink'
                    : 'text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink'
                }`}
              >
                {sg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="grid grid-cols-5 gap-2.5 items-stretch min-w-[700px]">
            {windowDays.map(day => {
              const isToday = isSameDay(day, today);
              const dayTasks = getTasksForDay(day);
              const dayKey = day.toISOString();
              const isDragOver = dragOverDayKey === dayKey;

              return (
                <div
                  key={dayKey}
                  onDragOver={e => {
                    if (!draggingTaskId) return;
                    e.preventDefault();
                    if (dragOverDayKey !== dayKey) setDragOverDayKey(dayKey);
                  }}
                  onDragLeave={() => {
                    if (dragOverDayKey === dayKey) setDragOverDayKey(null);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    handleDropOnDay(day);
                  }}
                  className={`min-w-0 rounded-xl border p-3 min-h-[170px] flex flex-col gap-2 box-border transition-colors ${
                    isDragOver
                      ? 'bg-edamame/[.15] border-edamame-500 border-dashed'
                      : isToday
                      ? 'bg-edamame/[.07] border-edamame/45'
                      : 'bg-paper-2/50 dark:bg-plate-card border-ink/10 dark:border-plate-ink/15'
                  }`}
                >
                  <div className="flex items-baseline justify-between pb-2 border-b border-ink/10 dark:border-plate-ink/15">
                    <div className="font-mono">
                      <span
                        className={`text-[9px] font-medium uppercase tracking-[0.11em] ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-ink-soft dark:text-plate-ink-soft'
                        }`}
                      >
                        {format(day, 'EEE')}
                      </span>
                      <span
                        className={`text-[17px] font-medium tracking-[-0.01em] ml-1.5 ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-ink dark:text-plate-ink'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    {dayTasks.length > 0 && (
                      <span
                        className={`font-mono text-[10px] font-medium ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-ink-soft dark:text-plate-ink-soft'
                        }`}
                      >
                        {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {dayTasks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-ink-soft/40 dark:text-plate-ink-soft/40 opacity-70">
                      <CalendarIcon size={20} />
                      <span className="text-[10.5px]">No tasks</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar">
                      {dayTasks.map(task => {
                        const kind = EVENT_KIND[getEventKind(task)];
                        const { case: c, client } = getCaseAndClient(task.caseId);
                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={e => {
                              setDraggingTaskId(task.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggingTaskId(null);
                              setDragOverDayKey(null);
                            }}
                            onClick={() => setSelectedTaskId(task.id)}
                            className={`task-card rounded-md py-1.5 px-2.5 cursor-pointer transition-transform hover:-translate-y-0.5 ${kind.bg} ${
                              draggingTaskId === task.id ? 'opacity-40' : ''
                            }`}
                            style={{ borderLeft: `3px solid ${kind.edge}` }}
                          >
                            <div className={`text-[9px] font-bold uppercase tracking-[0.08em] ${kind.text}`}>
                              {kind.label}
                            </div>
                            <div className="text-[11.5px] font-semibold leading-tight mt-0.5 text-ink dark:text-plate-ink break-words">
                              {task.title}
                            </div>
                            {c && (
                              <div className="text-[10px] text-ink-soft dark:text-plate-ink-soft mt-0.5 break-words">
                                {client?.name || 'Unknown client'} · {c.title}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── New Task modal ────────────────────────────────────────────── */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-paper dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15">
            <div className="px-6 py-4 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between">
              <h3 className="font-serif font-semibold text-[16px] text-ink dark:text-plate-ink">Create New Task</h3>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink-soft mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13.5px]"
                  placeholder="e.g. Call client regarding documents"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink-soft mb-1">
                  Due Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newTask.date}
                    onChange={e => setNewTask({ ...newTask, date: e.target.value })}
                    className="flex-1 px-3 py-2 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13.5px] font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNewTask({ ...newTask, date: format(new Date(), 'yyyy-MM-dd') })}
                    className="px-3 py-2 bg-paper-2 dark:bg-plate text-ink-soft dark:text-plate-ink-soft rounded-lg hover:bg-paper-2/70 dark:hover:bg-plate-card transition-colors text-[10.5px] font-bold uppercase"
                  >
                    Today
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink-soft mb-1">
                  Case <span className="text-ink-soft dark:text-plate-ink-soft font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-2.5 text-ink-soft dark:text-plate-ink-soft" size={16} />
                    <input
                      type="text"
                      value={caseSearchTerm}
                      onChange={e => {
                        setCaseSearchTerm(e.target.value);
                        setIsCaseDropdownOpen(true);
                        if (newTask.caseId && !e.target.value) {
                          setNewTask({ ...newTask, caseId: '' });
                        }
                      }}
                      onFocus={() => setIsCaseDropdownOpen(true)}
                      className="w-full pl-10 pr-3 py-2 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none text-[13.5px]"
                      placeholder="Search case..."
                    />
                  </div>
                  {isCaseDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsCaseDropdownOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredCases.length === 0 ? (
                          <div className="p-3 text-[12.5px] text-ink-soft dark:text-plate-ink-soft italic">No cases found.</div>
                        ) : (
                          filteredCases.map(c => (
                            <div
                              key={c.id}
                              onClick={() => handleSelectCase(c)}
                              className="p-2 hover:bg-edamame/10 dark:hover:bg-plate-card cursor-pointer border-b border-ink/10 dark:border-plate-ink/15 last:border-0"
                            >
                              <div className="text-[13px] font-semibold text-ink dark:text-plate-ink">{c.title}</div>
                              <div className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft">{getClientName(c.clientId)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink-soft mb-1">
                  Description <span className="text-ink-soft dark:text-plate-ink-soft font-normal">(optional)</span>
                </label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-ink dark:text-plate-ink outline-none resize-none text-[13.5px]"
                  placeholder="Add details..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-paper-2/70 dark:bg-plate/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-2">
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="px-4 py-2 text-[13px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate border border-transparent hover:border-ink/15 dark:hover:border-plate-ink/20 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                disabled={!newTask.title || !newTask.date}
                className="btn-press px-4 py-2 text-[13px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task detail popup — shared with the global search bar ─────── */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          caseItem={selectedTaskCaseAndClient.case}
          client={selectedTaskCaseAndClient.client}
          onClose={() => setSelectedTaskId(null)}
          onUpdateTask={onUpdateTask}
          onDeleteTask={onDeleteTask}
          onMoveTaskDate={onMoveTaskDate}
        />
      )}
    </div>
  );
};
