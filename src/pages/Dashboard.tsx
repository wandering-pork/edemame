import React, { useState, useMemo } from 'react';
import { Task, Case, Client } from '../types';
import { format, addDays, isSameDay, differenceInDays, isBefore, startOfDay } from 'date-fns';
import {
  CheckCircle2,
  Trash2,
  Calendar as CalendarIcon,
  Edit2,
  Plus,
  X,
  AlertCircle,
  Clock,
  FileText,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TaskPriority, getPriorityType } from '../components/TaskPriority';

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

type TaskGroup = 'overdue' | 'today' | 'upcoming';

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  cases,
  clients,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskOrder,
  onMoveTaskDate,
  onAddTask,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', date: '', caseId: '' });
  const [offsetModal, setOffsetModal] = useState<{ taskId: string; newDate: string } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCaseDropdownOpen, setIsCaseDropdownOpen] = useState(false);
  const [caseSearchTerm, setCaseSearchTerm] = useState('');

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Unknown Client';
  };

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

  // Group tasks
  const groupedTasks = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const nextWeek = addDays(today, 7);

    const groups: Record<TaskGroup, Task[]> = {
      overdue: [],
      today: [],
      upcoming: [],
    };

    tasks.forEach(task => {
      if (task.isCompleted) return;

      const taskDate = startOfDay(new Date(task.date));
      const diffDays = differenceInDays(taskDate, today);

      if (diffDays < 0) {
        groups.overdue.push(task);
      } else if (diffDays === 0) {
        groups.today.push(task);
      } else if (isBefore(taskDate, nextWeek)) {
        groups.upcoming.push(task);
      }
    });

    return groups;
  }, [tasks]);

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
        date: format(new Date(), 'yyyy-MM-dd'),
        caseId: '',
      });
      setCaseSearchTerm('');
    }
    setIsModalOpen(true);
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

  const TaskCard: React.FC<{ task: Task; group: TaskGroup }> = ({ task, group }) => {
    const linkedCase = cases.find(c => c.id === task.caseId);
    const linkedClient = linkedCase ? clients.find(c => c.id === linkedCase.clientId) : null;
    const daysUntil = differenceInDays(startOfDay(new Date(task.date)), startOfDay(new Date()));
    const priority = getPriorityType(daysUntil, false);

    return (
      <div
        className="group relative flex items-start gap-3 p-4 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all"
      >
        {/* Priority indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <TaskPriority priority={priority} size="md" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-900 dark:text-white text-sm group-hover:text-edamame-500 transition-colors">
            {task.title}
          </h4>
          {linkedCase && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {linkedCase.title}
              {linkedClient && ` • ${linkedClient.name}`}
            </p>
          )}
          {task.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">{task.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => handleOpenModal(task)}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit task"
          >
            <Edit2 className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => onUpdateTask({ ...task, isCompleted: !task.isCompleted })}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Toggle completion"
          >
            <CheckCircle2 className="w-4 h-4 text-edamame-500" />
          </button>
          <button
            onClick={() => onDeleteTask(task.id)}
            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    );
  };

  const overdue = groupedTasks.overdue;
  const today = groupedTasks.today;
  const upcoming = groupedTasks.upcoming;
  const totalPending = overdue.length + today.length + upcoming.length;

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-white dark:bg-slate-900 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-ibm-serif font-bold text-slate-900 dark:text-white mb-2">
              Task Dashboard
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-400">
              Stay on top of your immigration workflows
            </p>
          </div>
          <button
            onClick={() => {
              setEditingTask(null);
              setNewTask({
                title: '',
                description: '',
                date: format(new Date(), 'yyyy-MM-dd'),
                caseId: '',
              });
              setIsModalOpen(true);
            }}
            className="btn-press flex items-center justify-center gap-2 bg-edamame-500 hover:bg-edamame-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-edamame-500/30 text-sm whitespace-nowrap"
          >
            <Plus size={18} />
            New Task
          </button>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
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

        {/* Task sections */}
        <div className="space-y-8">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Overdue Tasks</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-semibold">
                  {overdue.length}
                </span>
              </div>
              <div className="space-y-3">
                {overdue.map(task => (
                  <TaskCard key={task.id} task={task} group="overdue" />
                ))}
              </div>
            </section>
          )}

          {/* Today section */}
          {today.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-amber-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Today</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-semibold">
                  {today.length}
                </span>
              </div>
              <div className="space-y-3">
                {today.map(task => (
                  <TaskCard key={task.id} task={task} group="today" />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming section */}
          {upcoming.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <CalendarIcon className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white">Upcoming</h2>
                <span className="ml-auto px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-semibold">
                  {upcoming.length}
                </span>
              </div>
              <div className="space-y-3">
                {upcoming.map(task => (
                  <TaskCard key={task.id} task={task} group="upcoming" />
                ))}
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
      </div>

      {/* Task modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 flex items-center justify-center p-4 z-50 modal-backdrop">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full modal-content">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-ibm-serif font-bold text-slate-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'New Task'}
              </h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingTask(null);
                }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
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
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Description</label>
                <textarea
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add notes..."
                  rows={3}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Due Date</label>
                <input
                  type="date"
                  value={newTask.date}
                  onChange={e => setNewTask({ ...newTask, date: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Link Case</label>
                <input
                  type="text"
                  value={caseSearchTerm}
                  onChange={e => {
                    setCaseSearchTerm(e.target.value);
                    setIsCaseDropdownOpen(true);
                  }}
                  onFocus={() => setIsCaseDropdownOpen(true)}
                  placeholder="Search cases..."
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-edamame-500 focus:ring-2 focus:ring-edamame-500/20 transition-all"
                />

                {isCaseDropdownOpen && filteredCases.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                    {filteredCases.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleSelectCase(c)}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors text-sm text-slate-900 dark:text-white"
                      >
                        <div className="font-medium">{c.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{getClientName(c.clientId)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingTask(null);
                }}
                className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTask}
                disabled={!newTask.title || !newTask.date}
                className="ml-auto px-4 py-2 text-sm font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
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
