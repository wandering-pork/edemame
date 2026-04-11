
import React, { useState, useMemo } from 'react';
import { Task, Case, Client } from '../types';
// Fixed: parseISO is not exported from date-fns in some versions or environments, using new Date() instead.
import { format, addDays, isSameDay, differenceInDays, isBefore, startOfDay } from 'date-fns';
import {
  CheckCircle2,
  Circle,
  GripVertical,
  Trash2,
  Calendar as CalendarIcon,
  Edit2,
  Plus,
  X,
  Link,
  Search,
  Triangle,
  Check,
  RotateCcw,
  Calendar,
  AlertCircle,
  Clock,
  FileText,
  User,
  Briefcase,
  TrendingUp,
  Activity,
  PauseCircle,
  XCircle,
  ChevronRight
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DashboardProps {
  tasks: Task[];
  cases: Case[];
  clients: Client[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (id: string) => void;
  onMoveTaskOrder: (taskId: string, direction: 'up' | 'down') => void;
  onMoveTaskDate: (taskId: string, newDate: string, offsetFuture: boolean) => void;
  onAddTask: (task: Task) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  tasks, 
  cases,
  clients,
  onUpdateTask, 
  onDeleteTask,
  onMoveTaskOrder,
  onMoveTaskDate,
  onAddTask
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', date: '', caseId: '' });
  const [offsetModal, setOffsetModal] = useState<{ taskId: string, newDate: string } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  // Case search state in modal
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  const [caseSearchTerm, setCaseSearchTerm] = useState('');

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      days.push(addDays(selectedDate, i));
    }
    return days;
  }, [selectedDate]);

  const getTasksForDate = (date: Date) => {
    return tasks
      // Fixed: Using new Date() to parse date strings since parseISO import failed.
      .filter(t => isSameDay(new Date(t.date), date))
      .sort((a, b) => {
        if (a.isCompleted === b.isCompleted) {
          return a.priorityOrder - b.priorityOrder;
        }
        return a.isCompleted ? 1 : -1;
      });
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client';
  };

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const clientName = getClientName(c.clientId).toLowerCase();
      const term = caseSearchTerm.toLowerCase();
      return (
        clientName.includes(term) ||
        c.title.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term)
      );
    });
  }, [cases, clients, caseSearchTerm]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      // Check if we should ask for offset
      const caseTasks = tasks.filter(t => t.caseId === task.caseId && !t.isCompleted);
      const futureTasks = caseTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));

      if (futureTasks.length > 0) {
        setOffsetModal({ taskId, newDate: targetDateStr });
      } else {
        onMoveTaskDate(taskId, targetDateStr, false);
      }
    }
  };

  const confirmOffset = (offset: boolean) => {
    if (offsetModal) {
      onMoveTaskDate(offsetModal.taskId, offsetModal.newDate, offset);
      setOffsetModal(null);
    }
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleOpenModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setNewTask({
        title: task.title,
        description: task.description || '',
        date: task.date,
        caseId: task.caseId || ''
      });
      const linkedCase = cases.find(c => c.id === task.caseId);
      if (linkedCase) {
        setCaseSearchTerm(`${linkedCase.title} - ${getClientName(linkedCase.clientId)}`);
      } else {
        setCaseSearchTerm('');
      }
    } else {
      setEditingTask(null);
      setNewTask({
        title: '',
        description: '',
        date: format(selectedDate, 'yyyy-MM-dd'),
        caseId: ''
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
        caseId: newTask.caseId || undefined
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
        generatedByAi: false
      });
    }
    
    setIsModalOpen(false);
    setEditingTask(null);
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

  const handleSelectCase = (c: Case) => {
    setNewTask({ ...newTask, caseId: c.id });
    setCaseSearchTerm(`${c.title} - ${getClientName(c.clientId)}`);
    setIsCaseDropdownOpen(false);
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen relative transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-fredoka tracking-tight">
              Task Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              Manage your daily client follow-ups
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleOpenModal}
              className="btn-press flex items-center justify-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm"
            >
              <Plus size={16} />
              New Task
            </button>

            <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors text-sm font-medium border-r border-gray-100 dark:border-slate-800"
              aria-label="Previous day"
            >
              ←
            </button>
            <span className="font-semibold px-4 min-w-[130px] text-center text-gray-800 dark:text-white text-sm">
              {format(selectedDate, 'MMM d, yyyy')}
            </span>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-colors text-sm font-medium border-l border-r border-gray-100 dark:border-slate-800"
              aria-label="Next day"
            >
              →
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="flex items-center gap-1.5 px-3 py-2.5 text-edamame-600 dark:text-edamame-400 text-xs font-bold uppercase hover:bg-edamame/5 dark:hover:bg-edamame/10 transition-colors"
            >
              <CalendarIcon size={13} />
              Today
            </button>
          </div>
        </div>
      </div>

      {/* ── Case Status Overview Cards ─────────────────────────────────── */}
      {(() => {
        const statusCards = [
          {
            key: 'open' as const,
            label: 'Open Cases',
            icon: <Briefcase size={19} />,
            count: cases.filter(c => c.status === 'open').length,
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-gray-200 dark:border-slate-800',
            leftBar: 'bg-edamame',
            iconBg: 'bg-edamame/10 text-edamame-600 dark:text-edamame-400',
            countColor: 'text-gray-900 dark:text-white',
            labelColor: 'text-gray-500 dark:text-slate-400',
          },
          {
            key: 'in_progress' as const,
            label: 'In Progress',
            icon: <TrendingUp size={19} />,
            count: cases.filter(c => c.status === 'in_progress').length,
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-gray-200 dark:border-slate-800',
            leftBar: 'bg-blue-500',
            iconBg: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            countColor: 'text-gray-900 dark:text-white',
            labelColor: 'text-gray-500 dark:text-slate-400',
          },
          {
            key: 'on_hold' as const,
            label: 'On Hold',
            icon: <PauseCircle size={19} />,
            count: cases.filter(c => c.status === 'on_hold').length,
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-gray-200 dark:border-slate-800',
            leftBar: 'bg-amber-500',
            iconBg: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            countColor: 'text-gray-900 dark:text-white',
            labelColor: 'text-gray-500 dark:text-slate-400',
          },
          {
            key: 'closed' as const,
            label: 'Closed',
            icon: <XCircle size={19} />,
            count: cases.filter(c => c.status === 'closed').length,
            bg: 'bg-white dark:bg-slate-900',
            border: 'border-gray-200 dark:border-slate-800',
            leftBar: 'bg-gray-400 dark:bg-slate-600',
            iconBg: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400',
            countColor: 'text-gray-900 dark:text-white',
            labelColor: 'text-gray-500 dark:text-slate-400',
          },
        ];

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {statusCards.map(card => (
              <div
                key={card.key}
                className={`stat-card rounded-xl border ${card.bg} ${card.border} shadow-sm overflow-hidden`}
              >
                <div className={`h-1 w-full ${card.leftBar}`} />
                <div className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.iconBg}`}>
                    {card.icon}
                  </div>
                  <div>
                    <div className={`text-2xl font-bold leading-none tabular-nums ${card.countColor}`}>{card.count}</div>
                    <div className={`text-xs font-medium mt-1 ${card.labelColor}`}>{card.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Upcoming Deadlines + Recent Activity ───────────────────────── */}
      {(() => {
        const today = startOfDay(new Date());
        const sevenDaysOut = addDays(today, 7);

        // Build upcoming list: overdue first, then within 7 days, max 5 total
        const relevantTasks = tasks
          .filter(t => !t.isCompleted)
          .map(t => {
            const taskDate = startOfDay(new Date(t.date));
            const diff = differenceInDays(taskDate, today);
            return { task: t, taskDate, diff };
          })
          .filter(({ taskDate }) => isBefore(taskDate, sevenDaysOut) || differenceInDays(taskDate, today) <= 0)
          .sort((a, b) => a.diff - b.diff); // overdue first, soonest first

        const upcoming = relevantTasks.slice(0, 5);

        const getRelativeLabel = (diff: number) => {
          if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`;
          if (diff === 0) return 'Today';
          if (diff === 1) return 'Tomorrow';
          return `In ${diff} days`;
        };

        // Recent activity: last 5 cases sorted by createdAt desc
        const recentCases = [...cases]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);

        const getActivityAge = (dateStr: string) => {
          const diff = differenceInDays(today, startOfDay(new Date(dateStr)));
          if (diff === 0) return 'Today';
          if (diff === 1) return 'Yesterday';
          if (diff < 30) return `${diff} days ago`;
          return format(new Date(dateStr), 'MMM d, yyyy');
        };

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Upcoming Deadlines */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-green-600 dark:text-green-400" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Upcoming Deadlines</h2>
                <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">Next 7 days</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500 italic">
                  No pending deadlines in the next 7 days
                </div>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                  {upcoming.map(({ task, diff }) => {
                    const linkedCase = cases.find(c => c.id === task.caseId);
                    const isOverdue = diff < 0;
                    const isToday = diff === 0;
                    return (
                      <li
                        key={task.id}
                        className={`px-5 py-3 flex items-start gap-3 ${
                          isOverdue
                            ? 'bg-red-50/60 dark:bg-red-900/10'
                            : isToday
                            ? 'bg-amber-50/60 dark:bg-amber-900/10'
                            : ''
                        }`}
                      >
                        <div className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                          isOverdue ? 'bg-red-500' : isToday ? 'bg-amber-500' : 'bg-green-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${
                            isOverdue
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-gray-900 dark:text-slate-200'
                          }`}>
                            {task.title}
                          </p>
                          {linkedCase && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 truncate mt-0.5">
                              {linkedCase.title}
                            </p>
                          )}
                        </div>
                        <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          isOverdue
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                            : isToday
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                        }`}>
                          {getRelativeLabel(diff)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Recent Activity Feed */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
                <Activity size={16} className="text-green-600 dark:text-green-400" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Recent Activity</h2>
              </div>
              {recentCases.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-slate-500 italic">
                  No cases yet
                </div>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                  {recentCases.map(c => {
                    const client = clients.find(cl => cl.id === c.clientId);
                    return (
                      <li key={c.id} className="px-5 py-3 flex items-start gap-3">
                        <div className="mt-0.5 w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0">
                          <FileText size={14} className="text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-200 truncate">{c.title}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-500 truncate mt-0.5">
                            Case opened{client ? ` · ${client.name}` : ''}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-xs text-gray-400 dark:text-slate-500">
                          {getActivityAge(c.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-x-auto pb-4">
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
              className={`flex-shrink-0 w-full min-w-[260px] rounded-2xl border flex flex-col h-[68vh] transition-all duration-200
                ${isToday
                  ? 'bg-white dark:bg-slate-900 border-edamame/40 dark:border-edamame/30 shadow-lg shadow-edamame/8'
                  : 'bg-white/60 dark:bg-slate-900/60 border-gray-200 dark:border-slate-800 shadow-sm'
                }`}
            >
              {/* Column header */}
              <div className={`px-4 py-3.5 border-b rounded-t-2xl flex items-center justify-between
                ${isToday
                  ? 'bg-edamame/5 dark:bg-edamame/10 border-edamame/15 dark:border-edamame/20'
                  : 'bg-gray-50/80 dark:bg-slate-800/60 border-gray-100 dark:border-slate-800'
                }`}>
                <div>
                  <h3 className={`text-sm font-bold ${isToday ? 'text-edamame-700 dark:text-edamame-400' : 'text-gray-700 dark:text-slate-300'}`}>
                    {format(day, 'EEEE')}
                  </h3>
                  <p className={`text-xs mt-0.5 ${isToday ? 'text-edamame-600 dark:text-edamame-500' : 'text-gray-400 dark:text-slate-500'}`}>
                    {format(day, 'MMM d')}
                  </p>
                </div>
                {pending > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isToday
                      ? 'bg-edamame text-white'
                      : 'bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-400'
                  }`}>
                    {pending}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                {dayTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full py-8 text-gray-300 dark:text-slate-700">
                    <CalendarIcon size={28} className="mb-2 opacity-40" />
                    <span className="text-xs">No tasks</span>
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
                      className={`task-card group relative rounded-xl border cursor-default select-none
                        ${task.isCompleted
                          ? 'bg-gray-50 dark:bg-slate-900/40 border-gray-100 dark:border-slate-800/60 opacity-55'
                          : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700/80 shadow-sm'
                        }`}
                    >
                      <div className="flex items-start gap-2.5 p-3">
                        <div className="flex flex-col items-center gap-2 mt-0.5">
                          <div className="text-gray-200 dark:text-slate-700 cursor-grab active:cursor-grabbing hover:text-gray-400 dark:hover:text-slate-500 transition-colors">
                            <GripVertical size={14} />
                          </div>
                          
                          <div className="relative">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === task.id ? null : task.id); }}
                              className="p-1 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                            >
                              <Triangle size={14} className="rotate-180 fill-current" />
                            </button>

                            {activeDropdown === task.id && (
                              <>
                                <div 
                                  className="fixed inset-0 z-10" 
                                  onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }}
                                />
                                <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-20 overflow-hidden">
                                  <button 
                                    disabled={task.isCompleted}
                                    onClick={(e) => { e.stopPropagation(); onUpdateTask({ ...task, isCompleted: true }); setActiveDropdown(null); }}
                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${task.isCompleted ? 'text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                                  >
                                    <Check size={16} className={task.isCompleted ? 'text-gray-300' : 'text-green-500'} />
                                    Mark as Complete
                                  </button>
                                  <button 
                                    disabled={!task.isCompleted}
                                    onClick={(e) => { e.stopPropagation(); onUpdateTask({ ...task, isCompleted: false }); setActiveDropdown(null); }}
                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${!task.isCompleted ? 'text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                                  >
                                    <RotateCcw size={16} className={!task.isCompleted ? 'text-gray-300' : 'text-orange-500'} />
                                    Revert to Pending
                                  </button>
                                  <button 
                                    disabled={task.isCompleted}
                                    onClick={(e) => { e.stopPropagation(); handleSetToday(task.id); setActiveDropdown(null); }}
                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${task.isCompleted ? 'text-gray-400 dark:text-slate-600 cursor-not-allowed' : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                                  >
                                    <Calendar size={16} className={task.isCompleted ? 'text-gray-300' : 'text-green-600'} />
                                    Set to Today
                                  </button>
                                  <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleOpenModal(task); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <Edit2 size={16} className="text-blue-500" />
                                    Edit
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); setActiveDropdown(null); }}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  >
                                    <Trash2 size={16} />
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Client tag */}
                          {linkedClient && (
                            <span className="inline-block text-[10px] font-bold bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 px-1.5 py-0.5 rounded-md mb-1.5 leading-none">
                              {linkedClient.name}
                            </span>
                          )}

                          <h4 className={`text-sm font-semibold leading-snug ${task.isCompleted ? 'line-through text-gray-400 dark:text-slate-600' : 'text-gray-900 dark:text-slate-100'}`}>
                            {task.title}
                          </h4>

                          {task.description && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50 dark:border-slate-700/40">
                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
                              {task.isCompleted ? (
                                <span className="flex items-center gap-1 text-edamame-600 dark:text-edamame-500">
                                  <CheckCircle2 size={11} />
                                  Done
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-gray-400 dark:text-slate-600">
                                  <Clock size={11} />
                                  Pending
                                </span>
                              )}
                            </div>

                            {!task.isCompleted && (
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => onMoveTaskOrder(task.id, 'up')}
                                  disabled={index === 0}
                                  className="text-[10px] text-gray-300 dark:text-slate-700 hover:text-gray-500 dark:hover:text-slate-400 disabled:opacity-25 px-0.5 transition-colors"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => onMoveTaskOrder(task.id, 'down')}
                                  disabled={index === dayTasks.length - 1}
                                  className="text-[10px] text-gray-300 dark:text-slate-700 hover:text-gray-500 dark:hover:text-slate-400 disabled:opacity-25 px-0.5 transition-colors"
                                >
                                  ▼
                                </button>
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

      {/* Offset Modal */}
      {offsetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="p-6">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Adjust Future Tasks?</h3>
              <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
                You've moved this task. Would you like to automatically offset all future pending tasks in this case by the same number of days?
              </p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-2">
              <button 
                onClick={() => confirmOffset(true)}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-900/20 transition-all"
              >
                Yes, Offset Future Tasks
              </button>
              <button 
                onClick={() => confirmOffset(false)}
                className="w-full py-3 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              >
                No, Only This Task
              </button>
              <button 
                onClick={() => setOffsetModal(null)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-slate-500 transition-colors"
              >
                Cancel Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Read-only Task Detail Modal */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 backdrop-blur-sm p-4">
          <div className="modal-content bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="text-green-600" size={20} />
                Task Details
              </h3>
              <button 
                onClick={() => setViewingTask(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Task Title</label>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{viewingTask.title}</div>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Description</label>
                <div className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-100 dark:border-slate-800">
                  {viewingTask.description || <span className="italic opacity-50">No description provided.</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Planned Date</label>
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
                    <Calendar size={16} className="text-green-600" />
                    {format(new Date(viewingTask.date), 'MMMM d, yyyy')}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Status</label>
                  <div className={`flex items-center gap-2 text-sm font-bold ${viewingTask.isCompleted ? 'text-green-600' : 'text-orange-500'}`}>
                    {viewingTask.isCompleted ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    {viewingTask.isCompleted ? 'Completed' : 'Pending'}
                  </div>
                </div>
              </div>

              {viewingTask.caseId && (
                <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Linked Case</label>
                  <div className="flex items-center gap-3 p-3 bg-green-50/50 dark:bg-green-900/10 rounded-xl border border-green-100/50 dark:border-green-900/20">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                      <FileText size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white">
                        {cases.find(c => c.id === viewingTask.caseId)?.title}
                      </div>
                      <div className="text-[10px] text-green-700 dark:text-green-500 font-medium">
                        {getClientName(cases.find(c => c.id === viewingTask.caseId)?.clientId || '')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800">
              <button 
                onClick={() => setViewingTask(null)}
                className="w-full py-3 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-bold rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/50 dark:bg-black/70 p-4 backdrop-blur-sm">
          <div className="modal-content bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h3>
              <button 
                onClick={() => { setIsModalOpen(false); setEditingTask(null); }}
                className="text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Task Title</label>
                <input 
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none"
                  placeholder="e.g. Call client regarding documents"
                  autoFocus
                />
              </div>

              {!editingTask?.isCompleted && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Due Date</label>
                  <div className="flex gap-2">
                    <input 
                      type="date"
                      value={newTask.date}
                      onChange={(e) => setNewTask({...newTask, date: e.target.value})}
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none"
                    />
                    <button 
                      type="button"
                      onClick={() => setNewTask({...newTask, date: format(new Date(), 'yyyy-MM-dd')})}
                      className="px-3 py-2 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold uppercase"
                    >
                      Today
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Linked Case <span className="text-gray-400 dark:text-slate-500 font-normal">(Optional)</span></label>
                <div className="relative">
                   <div 
                     className="relative"
                     onClick={() => setIsCaseDropdownOpen(true)}
                   >
                     <Link className="absolute left-3 top-2.5 text-gray-400 dark:text-slate-500" size={16} />
                     <input 
                       type="text"
                       value={caseSearchTerm}
                       onChange={(e) => {
                         setCaseSearchTerm(e.target.value);
                         setIsCaseDropdownOpen(true);
                         if (newTask.caseId && !e.target.value) {
                           setNewTask({...newTask, caseId: ''});
                         }
                       }}
                       onFocus={() => setIsCaseDropdownOpen(true)}
                       className="w-full pl-10 pr-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none"
                       placeholder="Search case..."
                     />
                   </div>
                   {isCaseDropdownOpen && (
                     <>
                       <div className="fixed inset-0 z-10" onClick={() => setIsCaseDropdownOpen(false)}></div>
                       <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                         {filteredCases.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 dark:text-slate-500 italic">No cases found.</div>
                         ) : (
                            filteredCases.map(c => (
                              <div 
                                key={c.id}
                                onClick={() => handleSelectCase(c)}
                                className="p-2 hover:bg-green-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-100 dark:border-slate-700 last:border-0"
                              >
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{c.title}</div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">{getClientName(c.clientId)}</div>
                              </div>
                            ))
                         )}
                       </div>
                     </>
                   )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Description <span className="text-gray-400 dark:text-slate-500 font-normal">(Optional)</span></label>
                <textarea 
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:focus:ring-green-600 focus:border-green-500 dark:focus:border-green-600 text-gray-900 dark:text-white outline-none resize-none"
                  placeholder="Add details..."
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-gray-200 dark:hover:border-slate-700 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTask}
                disabled={!newTask.title || !newTask.date}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:hover:bg-green-500 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
