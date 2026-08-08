import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task, Case, Client, TeamMember, ActivityEvent, DocumentChecklistItem } from '../types';
import {
  format,
  addDays,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  startOfWeek,
  differenceInCalendarDays,
} from 'date-fns';
import { Plus, Sparkles, Calendar as CalendarIcon, X, Link as LinkIcon, ChevronLeft, ChevronRight, ArrowRight, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DashboardProps {
  tasks: Task[];
  cases: Case[];
  clients: Client[];
  teamMembers?: TeamMember[];
  currentUserId?: string;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onMoveTaskOrder: (taskId: string, direction: 'up' | 'down') => void;
  onMoveTaskDate: (taskId: string, newDate: string, offsetFuture: boolean) => void;
  onAddTask: (task: Task) => void;
  /**
   * Optional — App.tsx already tracks an `activity: ActivityEvent[]` state (see
   * the `/team` route) but does not currently pass it to Dashboard. When
   * supplied, "Agent activity" renders real events with real relative
   * timestamps; when absent, it falls back to a best-effort feed derived from
   * AI-generated tasks (no timestamps available on `Task`, so no "time ago"
   * is shown). Wiring `activity={activity}` from App.tsx is a one-line follow-up.
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

const EVENT_KIND: Record<'task' | 'filing' | 'deadline', { label: string; edge: string; bg: string; text: string }> = {
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
  deadline: {
    label: 'Deadline',
    edge: '#EF4444',
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
  },
};

/**
 * Task doesn't carry a "kind" (task/filing/deadline) in the data model, so
 * this is a heuristic: overdue/due-today tasks read as Deadline, tasks whose
 * title suggests a lodgement read as Filing, everything else is a plain Task.
 */
const getEventKind = (task: Task): keyof typeof EVENT_KIND => {
  if (!task.isCompleted) {
    const daysUntil = differenceInCalendarDays(startOfDay(new Date(task.date)), startOfDay(new Date()));
    if (daysUntil <= 0) return 'deadline';
  }
  const t = task.title.toLowerCase();
  if (/\blodge|\bfiling|\bfile\b|\bsubmit|\bsubmission/.test(t)) return 'filing';
  return 'task';
};

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  cases,
  clients,
  teamMembers = [],
  currentUserId,
  activity = [],
  checklistItems,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskDate,
}) => {
  const navigate = useNavigate();
  const [boardScope, setBoardScope] = useState<ScopeFilter>(currentUserId ? 'mine' : 'all');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd'), caseId: '' });
  const [caseSearchTerm, setCaseSearchTerm] = useState('');
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
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
  const activeCases = useMemo(() => cases.filter(c => c.status === 'open' || c.status === 'in_progress'), [cases]);
  const newCasesThisMonth = useMemo(
    () => cases.filter(c => c.createdAt && isSameMonth(new Date(c.createdAt), now)).length,
    [cases]
  );

  const overdueTasks = useMemo(
    () =>
      tasks
        .filter(t => !t.isCompleted && isBefore(startOfDay(new Date(t.date)), today))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [tasks]
  );
  const dueTodayTasks = useMemo(
    () => tasks.filter(t => !t.isCompleted && isSameDay(new Date(t.date), today)),
    [tasks]
  );
  const dueThisWeekTasks = useMemo(
    () =>
      tasks.filter(t => {
        if (t.isCompleted) return false;
        const d = differenceInCalendarDays(startOfDay(new Date(t.date)), today);
        return d >= 0 && d <= 6;
      }),
    [tasks]
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
  ];

  const summaryLine = `${dueTodayTasks.length} task${dueTodayTasks.length === 1 ? '' : 's'} due today · ${overdueTasks.length} overdue${
    docsOutstanding !== null ? ` · ${docsOutstanding} documents outstanding` : ''
  }`;

  // ── Needs attention ───────────────────────────────────────────────────
  const attentionItems = useMemo(() => {
    const items: { id: string; dot: string; title: string; sub: string; caseId?: string }[] = [];

    overdueTasks.forEach(t => {
      const { case: c, client } = getCaseAndClient(t.caseId);
      items.push({
        id: t.id,
        dot: '#EF4444',
        title: `${t.title} overdue`,
        sub: c
          ? `${client?.name || 'Unknown client'} · ${c.title} · was due ${format(new Date(t.date), 'd MMM')}`
          : `No linked case · was due ${format(new Date(t.date), 'd MMM')}`,
        caseId: c?.id,
      });
    });

    dueTodayTasks.forEach(t => {
      const { case: c, client } = getCaseAndClient(t.caseId);
      items.push({
        id: t.id,
        dot: '#F59E0B',
        title: `${t.title} due today`,
        sub: c ? `${client?.name || 'Unknown client'} · ${c.title}` : 'No linked case',
        caseId: c?.id,
      });
    });

    return items.slice(0, 5);
  }, [overdueTasks, dueTodayTasks, cases, clients]);

  // ── Agent activity ────────────────────────────────────────────────────
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

    // Fallback: no ActivityEvent[] wired in — approximate from AI-generated tasks.
    const aiCaseIds: string[] = Array.from(new Set(tasks.filter(t => t.generatedByAi && t.caseId).map(t => t.caseId as string)));
    return aiCaseIds.slice(0, 4).map(caseId => {
      const { case: c, client } = getCaseAndClient(caseId);
      const count = tasks.filter(t => t.caseId === caseId && t.generatedByAi).length;
      return {
        id: caseId,
        title: `Generated ${count}-task plan`,
        sub: c ? `${c.title}${client ? ` · ${client.name}` : ''}` : '',
        time: '—',
      };
    });
  }, [activity, tasks, cases, clients]);

  // ── This week board ───────────────────────────────────────────────────
  const weekStart = startOfWeek(weekAnchor, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(now, { weekStartsOn: 1 }));

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
    onMoveTaskDate(draggingTaskId, newDate, false);
    setDraggingTaskId(null);
  };

  const segs: { key: ScopeFilter; label: string }[] = [
    { key: 'mine', label: 'My Tasks' },
    { key: 'team', label: 'Team' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-[1440px] mx-auto">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
              {format(now, 'EEEE, d MMMM yyyy')}
            </div>
            <h1 className="text-[27px] font-extrabold tracking-[-0.035em] text-slate-900 dark:text-white mt-1.5">
              {greeting}, {firstName}
            </h1>
            <div className="text-[13.5px] text-slate-600 dark:text-slate-400 mt-1">{summaryLine}</div>
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-[22px]">
          {stats.map(st => (
            <div
              key={st.label}
              className="stat-card bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl px-[18px] py-4 shadow-sm"
            >
              <div className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-slate-400 dark:text-slate-500">
                {st.label}
              </div>
              <div className="flex items-baseline gap-2 mt-[7px]">
                <span className="text-[25px] font-extrabold tracking-[-0.03em] text-slate-900 dark:text-white">
                  {st.value}
                </span>
                <span className={`text-[11px] font-semibold truncate ${st.color}`}>{st.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Needs attention / Agent activity ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-3.5 mt-3.5 items-start">
          {/* Needs attention */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-slate-400 dark:text-slate-500">
                Needs attention
              </span>
              <span
                className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-md ${
                  attentionItems.length > 0
                    ? 'bg-red-500/[.13] text-[#B91C1C] dark:text-[#F87171]'
                    : 'bg-edamame/10 text-[#047857] dark:text-[#4ADE80]'
                }`}
              >
                {attentionItems.length > 0 ? `${attentionItems.length} item${attentionItems.length === 1 ? '' : 's'}` : 'All clear'}
              </span>
            </div>
            {attentionItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-slate-400 dark:text-slate-500 border-t border-gray-100 dark:border-slate-800">
                Nothing needs attention right now.
              </div>
            ) : (
              attentionItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => (item.caseId ? navigate(`/cases/${item.caseId}`) : setSelectedTaskId(item.id))}
                  className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 dark:border-slate-800 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span
                    className="badge-pulse w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.dot }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </div>
                    <div className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{item.sub}</div>
                  </div>
                  <span className="text-xs font-semibold text-edamame-600 dark:text-edamame-400 whitespace-nowrap">
                    {item.caseId ? 'Open case →' : 'View task →'}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Agent activity */}
          <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 pt-4 pb-2.5">
              <Sparkles size={14} className="text-edamame-500" />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-slate-400 dark:text-slate-500">
                Agent activity
              </span>
            </div>
            {activityItems.length === 0 ? (
              <div className="px-5 py-8 text-center text-[12.5px] text-slate-400 dark:text-slate-500 border-t border-gray-100 dark:border-slate-800">
                No AI activity yet.
              </div>
            ) : (
              activityItems.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-100 dark:border-slate-800"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-slate-100 truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{item.sub}</div>
                  </div>
                  <span className="text-[10.5px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{item.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── This week ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-7 mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold tracking-[-0.015em] text-slate-900 dark:text-white">
              {isCurrentWeek ? 'This week' : 'Week of'}
            </h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {format(weekDays[0], 'MMM d')} – {format(weekDays[4], 'MMM d, yyyy')}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setWeekAnchor(d => addDays(d, -7))}
                aria-label="Previous week"
                className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setWeekAnchor(d => addDays(d, 7))}
                aria-label="Next week"
                className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
              {!isCurrentWeek && (
                <button
                  onClick={() => setWeekAnchor(new Date())}
                  className="ml-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase text-edamame-600 dark:text-edamame-400 hover:bg-edamame/10 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-0.5 p-[3px] bg-slate-100 dark:bg-slate-800 rounded-[9px]">
            {segs.map(sg => (
              <button
                key={sg.key}
                onClick={() => setBoardScope(sg.key)}
                className={`px-3.5 py-1.5 rounded-[7px] text-xs font-semibold transition-all ${
                  boardScope === sg.key
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {sg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="grid grid-cols-5 gap-2.5 items-stretch min-w-[700px]">
            {weekDays.map(day => {
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
                      : 'bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-baseline justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                    <div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-[0.11em] ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {format(day, 'EEE')}
                      </span>
                      <span
                        className={`text-[17px] font-extrabold tracking-[-0.03em] ml-1.5 ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>
                    {dayTasks.length > 0 && (
                      <span
                        className={`text-[10px] font-bold ${
                          isToday ? 'text-[#047857] dark:text-[#4ADE80]' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {dayTasks.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-slate-300 dark:text-slate-700 opacity-70">
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
                            <div className="text-[11.5px] font-semibold leading-tight mt-0.5 text-slate-900 dark:text-slate-100 break-words">
                              {task.title}
                            </div>
                            {c && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 break-words">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">Create New Task</h3>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[13.5px]"
                  placeholder="e.g. Call client regarding documents"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Due Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newTask.date}
                    onChange={e => setNewTask({ ...newTask, date: e.target.value })}
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[13.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => setNewTask({ ...newTask, date: format(new Date(), 'yyyy-MM-dd') })}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-[10.5px] font-bold uppercase"
                  >
                    Today
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Case <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" size={16} />
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
                      className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[13.5px]"
                      placeholder="Search case..."
                    />
                  </div>
                  {isCaseDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsCaseDropdownOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredCases.length === 0 ? (
                          <div className="p-3 text-[12.5px] text-slate-500 dark:text-slate-500 italic">No cases found.</div>
                        ) : (
                          filteredCases.map(c => (
                            <div
                              key={c.id}
                              onClick={() => handleSelectCase(c)}
                              className="p-2 hover:bg-edamame/10 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0"
                            >
                              <div className="text-[13px] font-semibold text-slate-900 dark:text-white">{c.title}</div>
                              <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{getClientName(c.clientId)}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none resize-none text-[13.5px]"
                  placeholder="Add details..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="px-4 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-700 rounded-lg transition-all"
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

      {/* ── Task detail modal ─────────────────────────────────────────── */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">Task Details</h3>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => onUpdateTask?.({ ...selectedTask, isCompleted: !selectedTask.isCompleted })}
                  className="mt-0.5 text-edamame-500 flex-shrink-0"
                  aria-label={selectedTask.isCompleted ? 'Mark incomplete' : 'Mark complete'}
                >
                  {selectedTask.isCompleted ? <CheckCircle2 size={20} /> : <Circle size={20} className="text-slate-300 dark:text-slate-600" />}
                </button>
                <div
                  className={`text-[15px] font-bold text-slate-900 dark:text-white ${
                    selectedTask.isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : ''
                  }`}
                >
                  {selectedTask.title}
                </div>
              </div>

              {selectedTask.description && (
                <div className="text-[13px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {selectedTask.description}
                </div>
              )}

              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={selectedTask.date}
                  onChange={e => onMoveTaskDate?.(selectedTask.id, e.target.value, false)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-edamame-500 focus:border-edamame-500 text-slate-900 dark:text-white outline-none text-[13.5px]"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Case
                </label>
                {selectedTaskCaseAndClient.case ? (
                  <div className="text-[13px] text-slate-700 dark:text-slate-300">
                    {selectedTaskCaseAndClient.case.title}
                    {selectedTaskCaseAndClient.client && ` — ${selectedTaskCaseAndClient.client.name}`}
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
                  onDeleteTask(selectedTask.id);
                  setSelectedTaskId(null);
                }}
                className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                aria-label="Delete task"
              >
                <Trash2 size={16} />
              </button>
              <div className="flex items-center gap-2">
                {selectedTask.caseId && (
                  <button
                    onClick={() => {
                      navigate(`/cases/${selectedTask.caseId}`);
                      setSelectedTaskId(null);
                    }}
                    className="btn-press flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg shadow-sm transition-all"
                  >
                    Go to Case
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
