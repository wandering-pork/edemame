import React, { useState, useMemo } from 'react';
import { Task, Case, Client, TeamMember } from '../types';
import { format, addDays, isSameDay, differenceInDays, isBefore, startOfDay } from 'date-fns';
import {
  CheckCircle2,
  Trash2,
  Calendar as CalendarIcon,
  CalendarDays,
  LayoutList,
  Edit2,
  Plus,
  X,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Check,
  RotateCcw,
  Calendar,
  Link,
  MoreHorizontal,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TaskPriority, getPriorityType } from '../components/TaskPriority';

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
}

type ScopeFilter = 'mine' | 'team' | 'all';
type TaskGroup = 'overdue' | 'today' | 'upcoming';
type ViewMode = 'calendar' | 'list';

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  cases,
  clients,
  teamMembers = [],
  currentUserId,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskOrder,
  onMoveTaskDate,
  onAddTask,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', date: '', caseId: '' });
  const [offsetModal, setOffsetModal] = useState<{ taskId: string; newDate: string } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  const [caseSearchTerm, setCaseSearchTerm] = useState('');
  const [scope, setScope] = useState<ScopeFilter>(currentUserId ? 'mine' : 'all');

  // ── Derived data ───────────────────────────────────────────────────────────

  const scopedTasks = useMemo(() => {
    if (scope === 'all' || !currentUserId) return tasks;
    if (scope === 'mine') return tasks.filter(t => t.assignedTo === currentUserId || !t.assignedTo);
    return tasks.filter(t => t.assignedTo && t.assignedTo !== currentUserId);
  }, [tasks, scope, currentUserId]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 5; i++) {
      days.push(addDays(selectedDate, i));
    }
    return days;
  }, [selectedDate]);

  const getTasksForDate = (date: Date): Task[] => {
    return scopedTasks
      .filter(t => isSameDay(new Date(t.date), date))
      .sort((a, b) => {
        if (a.isCompleted === b.isCompleted) return a.priorityOrder - b.priorityOrder;
        return a.isCompleted ? 1 : -1;
      });
  };

  const getClientName = (clientId: string) =>
    clients.find(c => c.id === clientId)?.name || 'Unknown Client';

  const getCaseClient = (caseId?: string) => {
    if (!caseId) return null;
    const caseItem = cases.find(c => c.id === caseId);
    return caseItem ? clients.find(c => c.id === caseItem.clientId) : null;
  };

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const clientName = getClientName(c.clientId).toLowerCase();
      const term = caseSearchTerm.toLowerCase();
      return clientName.includes(term) || c.title.toLowerCase().includes(term) || c.id.toLowerCase().includes(term);
    });
  }, [cases, clients, caseSearchTerm]);

  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    const nextWeek = addDays(today, 7);
    const groups: Record<TaskGroup, Task[]> = { overdue: [], today: [], upcoming: [] };

    scopedTasks.forEach(task => {
      if (task.isCompleted) return;
      const taskDate = startOfDay(new Date(task.date));
      const diffDays = differenceInDays(taskDate, today);
      if (diffDays < 0) groups.overdue.push(task);
      else if (diffDays === 0) groups.today.push(task);
      else if (isBefore(taskDate, nextWeek)) groups.upcoming.push(task);
    });

    return groups;
  }, [scopedTasks]);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const caseTasks = tasks.filter(t => t.caseId === task.caseId && !t.isCompleted);
    const futureTasks = caseTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));

    if (futureTasks.length > 0) {
      setOffsetModal({ taskId, newDate: targetDateStr });
    } else {
      onMoveTaskDate(taskId, targetDateStr, false);
    }
  };

  const confirmOffset = (offset: boolean) => {
    if (offsetModal) {
      onMoveTaskDate(offsetModal.taskId, offsetModal.newDate, offset);
      setOffsetModal(null);
    }
  };

  const handleSetToday = (taskId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.date === today || task.isCompleted) return;

    const caseTasks = tasks.filter(t => t.caseId === task.caseId && !t.isCompleted);
    const futureTasks = caseTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));

    if (futureTasks.length > 0) {
      setOffsetModal({ taskId, newDate: today });
    } else {
      onMoveTaskDate(taskId, today, false);
    }
  };

  // ── Modal handlers ─────────────────────────────────────────────────────────

  const handleOpenModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setNewTask({
        title: task.title,
        description: task.description || '',
        date: task.date,
        caseId: task.caseId || '',
      });
      const linkedCase = cases.find(c => c.id === task.caseId);
      if (linkedCase) setCaseSearchTerm(`${linkedCase.title} - ${getClientName(linkedCase.clientId)}`);
      else setCaseSearchTerm('');
    } else {
      setEditingTask(null);
      setNewTask({
        title: '',
        description: '',
        date: format(viewMode === 'calendar' ? selectedDate : new Date(), 'yyyy-MM-dd'),
        caseId: '',
      });
      setCaseSearchTerm('');
    }
    setIsModalOpen(true);
    setActiveDropdown(null);
  };

  const handleSaveTask = () => {
    if (!newTask.title || !newTask.date) return;

    if (editingTask) {
      onUpdateTask({
        ...editingTask,
        title: newTask.title,
        description: newTask.description,
        date: newTask.date,
        caseId: newTask.caseId || undefined,
      });
    } else {
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
    }

    setIsModalOpen(false);
    setEditingTask(null);
  };

  const handleSelectCase = (c: Case) => {
    setNewTask({ ...newTask, caseId: c.id });
    setCaseSearchTerm(`${c.title} - ${getClientName(c.clientId)}`);
    setIsCaseDropdownOpen(false);
  };

  // ── List view task card ────────────────────────────────────────────────────

  const ListTaskCard: React.FC<{ task: Task; group: TaskGroup }> = ({ task, group }) => {
    const linkedCase = cases.find(c => c.id === task.caseId);
    const linkedClient = linkedCase ? clients.find(c => c.id === linkedCase.clientId) : null;
    const assignee = teamMembers.find(m => m.id === task.assignedTo);
    const daysUntil = differenceInDays(startOfDay(new Date(task.date)), startOfDay(new Date()));
    const priority = getPriorityType(daysUntil, false);

    return (
      <div className="group relative flex items-start gap-3 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all">
        <div className="flex-shrink-0 mt-0.5">
          <TaskPriority priority={priority} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-edamame-500 transition-colors">
              {task.title}
            </h4>
            {assignee && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[8px] font-bold">
                  {assignee.avatar || assignee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
                {assignee.name.split(' ')[0]}
              </span>
            )}
          </div>
          {linkedCase && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {linkedCase.title}{linkedClient && ` • ${linkedClient.name}`}
            </p>
          )}
          {task.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{task.description}</p>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => handleOpenModal(task)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Edit task">
            <Edit2 className="w-4 h-4 text-slate-500" />
          </button>
          <button onClick={() => onUpdateTask({ ...task, isCompleted: !task.isCompleted })} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Toggle completion">
            <CheckCircle2 className="w-4 h-4 text-edamame-500" />
          </button>
          <button onClick={() => onDeleteTask(task.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Delete task">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    );
  };

  // ── Summary counts ─────────────────────────────────────────────────────────

  const overdue = groupedTasks.overdue;
  const today = groupedTasks.today;
  const upcoming = groupedTasks.upcoming;
  const totalPending = overdue.length + today.length + upcoming.length;

  const calendarWindowContainsToday = weekDays.some(d => isSameDay(d, new Date()));

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-1">
              Task Dashboard
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Stay on top of your immigration workflows
            </p>
            {teamMembers.length > 0 && (
              <div className="mt-3 inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                {(['mine', 'team', 'all'] as ScopeFilter[]).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setScope(opt)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all capitalize ${
                      scope === opt
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt === 'mine' ? 'My Tasks' : opt === 'team' ? 'Team Tasks' : 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* View toggle */}
            <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'calendar'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <CalendarDays size={13} />
                Calendar
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <LayoutList size={13} />
                List
              </button>
            </div>

            <button
              onClick={() => handleOpenModal()}
              className="btn-press flex items-center justify-center gap-2 bg-edamame-500 hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame-500/30 text-sm whitespace-nowrap"
            >
              <Plus size={16} />
              New Task
            </button>
          </div>
        </div>

        {/* ── Calendar navigation ─────────────────────────────────────────────── */}
        {viewMode === 'calendar' && (
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, -5))}
                className="px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors border-r border-slate-100 dark:border-slate-700"
                aria-label="Previous 5 days"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-semibold px-4 text-slate-800 dark:text-white text-sm min-w-[180px] text-center">
                {format(selectedDate, 'MMM d')} – {format(addDays(selectedDate, 4), 'MMM d, yyyy')}
              </span>
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, 5))}
                className="px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors border-l border-r border-slate-100 dark:border-slate-700"
                aria-label="Next 5 days"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                disabled={calendarWindowContainsToday}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold uppercase transition-colors ${
                  calendarWindowContainsToday
                    ? 'text-edamame-500 dark:text-edamame-400 cursor-default'
                    : 'text-edamame-600 dark:text-edamame-400 hover:bg-edamame/5 dark:hover:bg-edamame/10'
                }`}
              >
                <CalendarIcon size={13} />
                Today
              </button>
            </div>

            {/* Quick stats inline */}
            <div className="hidden md:flex items-center gap-2 ml-auto">
              {overdue.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-semibold border border-red-100 dark:border-red-900/30">
                  <AlertCircle size={12} />
                  {overdue.length} overdue
                </span>
              )}
              {today.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-100 dark:border-amber-900/30">
                  <Clock size={12} />
                  {today.length} today
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── List view stats ──────────────────────────────────────────────────── */}
        {viewMode === 'list' && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-3xl font-bold text-red-600 dark:text-red-400 font-ibm-serif">{overdue.length}</p>
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1 uppercase tracking-wide">Overdue</p>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 font-ibm-serif">{today.length}</p>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1 uppercase tracking-wide">Today</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 font-ibm-serif">{upcoming.length}</p>
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mt-1 uppercase tracking-wide">Upcoming</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Calendar view ───────────────────────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <div className="overflow-x-auto pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 min-w-[1200px] lg:min-w-0">
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isToday = isSameDay(day, new Date());
              const dayTasks = getTasksForDate(day);
              const pending = dayTasks.filter(t => !t.isCompleted).length;

              return (
                <div
                  key={dateStr}
                  onDrop={(e) => handleDrop(e, dateStr)}
                  onDragOver={allowDrop}
                  className={`flex-shrink-0 w-full min-w-[230px] rounded-2xl border flex flex-col h-[70vh] transition-all duration-200 ${
                    isToday
                      ? 'bg-white dark:bg-slate-900 border-edamame/40 dark:border-edamame/30 shadow-lg shadow-edamame/8'
                      : 'bg-white/70 dark:bg-slate-900/70 border-slate-200 dark:border-slate-800 shadow-sm'
                  }`}
                >
                  {/* Column header */}
                  <div className={`px-4 py-3 border-b rounded-t-2xl flex items-center justify-between ${
                    isToday
                      ? 'bg-edamame/5 dark:bg-edamame/10 border-edamame/15 dark:border-edamame/20'
                      : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800'
                  }`}>
                    <div>
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-edamame-700 dark:text-edamame-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {format(day, 'EEE')}
                      </h3>
                      <p className={`text-lg font-bold leading-none mt-0.5 ${isToday ? 'text-edamame-600 dark:text-edamame-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {format(day, 'd')}
                      </p>
                      <p className={`text-[10px] mt-0.5 ${isToday ? 'text-edamame-500 dark:text-edamame-500' : 'text-slate-400 dark:text-slate-500'}`}>
                        {format(day, 'MMM')}
                      </p>
                    </div>
                    {pending > 0 && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isToday
                          ? 'bg-edamame text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {pending}
                      </span>
                    )}
                  </div>

                  {/* Task list */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2 custom-scrollbar">
                    {dayTasks.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full py-8 text-slate-200 dark:text-slate-700">
                        <CalendarIcon size={24} className="mb-2 opacity-40" />
                        <span className="text-xs text-slate-400 dark:text-slate-600">No tasks</span>
                      </div>
                    )}

                    {dayTasks.map((task, index) => {
                      const linkedCase = cases.find(c => c.id === task.caseId);
                      const linkedClient = linkedCase ? clients.find(c => c.id === linkedCase.clientId) : null;

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onDoubleClick={() => setViewingTask(task)}
                          className={`task-card group relative rounded-xl border cursor-default select-none transition-all ${
                            task.isCompleted
                              ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/60 opacity-55'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-2 p-2.5">
                            {/* Left controls */}
                            <div className="flex flex-col items-center gap-1.5 mt-0.5 flex-shrink-0">
                              <div className="text-slate-200 dark:text-slate-700 cursor-grab active:cursor-grabbing hover:text-slate-400 dark:hover:text-slate-500 transition-colors">
                                <GripVertical size={13} />
                              </div>
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === task.id ? null : task.id); }}
                                  className="p-0.5 text-slate-300 dark:text-slate-600 hover:text-edamame-600 dark:hover:text-edamame-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                                >
                                  <MoreHorizontal size={13} />
                                </button>

                                {activeDropdown === task.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }} />
                                    <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1 z-20 overflow-hidden">
                                      <button
                                        disabled={task.isCompleted}
                                        onClick={(e) => { e.stopPropagation(); onUpdateTask({ ...task, isCompleted: true }); setActiveDropdown(null); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${task.isCompleted ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                      >
                                        <Check size={14} className={task.isCompleted ? 'text-slate-300' : 'text-edamame-500'} />
                                        Mark as Complete
                                      </button>
                                      <button
                                        disabled={!task.isCompleted}
                                        onClick={(e) => { e.stopPropagation(); onUpdateTask({ ...task, isCompleted: false }); setActiveDropdown(null); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${!task.isCompleted ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                      >
                                        <RotateCcw size={14} className={!task.isCompleted ? 'text-slate-300' : 'text-orange-500'} />
                                        Revert to Pending
                                      </button>
                                      <button
                                        disabled={task.isCompleted}
                                        onClick={(e) => { e.stopPropagation(); handleSetToday(task.id); setActiveDropdown(null); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${task.isCompleted ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                      >
                                        <Calendar size={14} className={task.isCompleted ? 'text-slate-300' : 'text-edamame-600'} />
                                        Set to Today
                                      </button>
                                      <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenModal(task); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                      >
                                        <Edit2 size={14} className="text-blue-500" />
                                        Edit
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); setActiveDropdown(null); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                      >
                                        <Trash2 size={14} />
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                              {linkedClient && (
                                <span className="inline-block text-[9px] font-bold bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 px-1.5 py-0.5 rounded mb-1 leading-none">
                                  {linkedClient.name}
                                </span>
                              )}
                              <h4 className={`text-xs font-semibold leading-snug ${task.isCompleted ? 'line-through text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-slate-100'}`}>
                                {task.title}
                              </h4>
                              {task.description && (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                  {task.description}
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-50 dark:border-slate-700/40">
                                <span className={`flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide ${task.isCompleted ? 'text-edamame-600 dark:text-edamame-500' : 'text-slate-400 dark:text-slate-600'}`}>
                                  {task.isCompleted ? <><CheckCircle2 size={9} /> Done</> : <><Clock size={9} /> Pending</>}
                                </span>
                                {!task.isCompleted && (
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => onMoveTaskOrder(task.id, 'up')} disabled={index === 0} className="text-[9px] text-slate-300 dark:text-slate-700 hover:text-slate-500 dark:hover:text-slate-400 disabled:opacity-25 px-0.5 transition-colors">▲</button>
                                    <button onClick={() => onMoveTaskOrder(task.id, 'down')} disabled={index === dayTasks.length - 1} className="text-[9px] text-slate-300 dark:text-slate-700 hover:text-slate-500 dark:hover:text-slate-400 disabled:opacity-25 px-0.5 transition-colors">▼</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List view ───────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="max-w-4xl mx-auto space-y-8">
          {overdue.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Overdue Tasks</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-semibold">{overdue.length}</span>
              </div>
              <div className="space-y-3">
                {overdue.map(task => <ListTaskCard key={task.id} task={task} group="overdue" />)}
              </div>
            </section>
          )}

          {today.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Today</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-semibold">{today.length}</span>
              </div>
              <div className="space-y-3">
                {today.map(task => <ListTaskCard key={task.id} task={task} group="today" />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <CalendarIcon className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Upcoming</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold">{upcoming.length}</span>
              </div>
              <div className="space-y-3">
                {upcoming.map(task => <ListTaskCard key={task.id} task={task} group="upcoming" />)}
              </div>
            </section>
          )}

          {totalPending === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">All caught up!</h3>
              <p className="text-slate-600 dark:text-slate-400">You have no pending tasks</p>
            </div>
          )}
        </div>
      )}

      {/* ── Offset Modal ─────────────────────────────────────────────────────── */}
      {offsetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-700">
            <div className="p-6">
              <div className="w-12 h-12 bg-edamame/10 dark:bg-edamame/20 rounded-full flex items-center justify-center text-edamame-600 dark:text-edamame-400 mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Adjust Future Tasks?</h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
                You've moved this task. Would you like to automatically offset all future pending tasks in this case by the same number of days?
              </p>
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-2">
              <button onClick={() => confirmOffset(true)} className="w-full py-3 bg-edamame-500 hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all text-sm">
                Yes, Offset Future Tasks
              </button>
              <button onClick={() => confirmOffset(false)} className="w-full py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-sm">
                No, Only This Task
              </button>
              <button onClick={() => setOffsetModal(null)} className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                Cancel Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Detail Modal ────────────────────────────────────────────────── */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-700">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-edamame-500" size={18} />
                Task Details
              </h3>
              <button onClick={() => setViewingTask(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Task</label>
                <div className="text-base font-bold text-slate-900 dark:text-white">{viewingTask.title}</div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Description</label>
                <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                  {viewingTask.description || <span className="italic opacity-50">No description.</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Date</label>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <Calendar size={14} className="text-edamame-500" />
                    {format(new Date(viewingTask.date), 'MMM d, yyyy')}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Status</label>
                  <div className={`flex items-center gap-1.5 text-sm font-bold ${viewingTask.isCompleted ? 'text-edamame-600 dark:text-edamame-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {viewingTask.isCompleted ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {viewingTask.isCompleted ? 'Completed' : 'Pending'}
                  </div>
                </div>
              </div>
              {viewingTask.caseId && (() => {
                const linkedCase = cases.find(c => c.id === viewingTask.caseId);
                return linkedCase ? (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Linked Case</label>
                    <div className="flex items-center gap-3 p-3 bg-edamame/5 dark:bg-edamame/10 rounded-xl border border-edamame/15 dark:border-edamame/20">
                      <div className="w-8 h-8 bg-edamame/15 dark:bg-edamame/20 rounded-lg flex items-center justify-center text-edamame-600 dark:text-edamame-400 flex-shrink-0">
                        <FileText size={14} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{linkedCase.title}</div>
                        <div className="text-[10px] text-edamame-700 dark:text-edamame-400 font-medium">{getClientName(linkedCase.clientId)}</div>
                      </div>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="p-5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex gap-2">
              <button onClick={() => { setViewingTask(null); handleOpenModal(viewingTask); }} className="flex-1 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
                Edit
              </button>
              <button onClick={() => setViewingTask(null)} className="flex-1 py-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New / Edit Task Modal ────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content border border-slate-100 dark:border-slate-700">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'New Task'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); setEditingTask(null); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="Task title..."
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Due Date</label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newTask.date}
                    onChange={e => setNewTask({ ...newTask, date: e.target.value })}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setNewTask({ ...newTask, date: format(new Date(), 'yyyy-MM-dd') })}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-xs font-bold uppercase"
                  >
                    Today
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Link Case <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Link className="absolute left-3 top-3 text-slate-400 dark:text-slate-500" size={15} />
                  <input
                    type="text"
                    value={caseSearchTerm}
                    onChange={e => { setCaseSearchTerm(e.target.value); setIsCaseDropdownOpen(true); if (newTask.caseId && !e.target.value) setNewTask({ ...newTask, caseId: '' }); }}
                    onFocus={() => setIsCaseDropdownOpen(true)}
                    placeholder="Search cases..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                  />
                  {isCaseDropdownOpen && filteredCases.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setIsCaseDropdownOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto">
                        {filteredCases.map(c => (
                          <button key={c.id} onClick={() => handleSelectCase(c)} className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm border-b border-slate-50 dark:border-slate-700 last:border-0">
                            <div className="font-medium text-slate-900 dark:text-white">{c.title}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{getClientName(c.clientId)}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span></label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => { setIsModalOpen(false); setEditingTask(null); }} className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                disabled={!newTask.title || !newTask.date}
                className="ml-auto px-5 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {editingTask ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
