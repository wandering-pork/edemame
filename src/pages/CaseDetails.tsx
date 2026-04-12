import React, { useState, useMemo, useEffect } from 'react';
import { Case, Client, Task, CaseStatus, DocumentChecklistItem, ChecklistItemStatus } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { CaseNotes } from '../components/CaseNotes';
import { DocumentUpload } from '../components/DocumentUpload';
import { DocumentList } from '../components/DocumentList';
import { generateChecklist } from '../lib/checklistTemplates';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  User,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Check,
  RotateCcw,
  Triangle,
  X,
  Save,
  Zap,
  FolderOpen,
  Users,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';

interface CaseDetailsProps {
  caseItem: Case;
  client: Client;
  applicant?: Client;
  visaSubclass?: string;
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTask: (task: Task) => void;
  onMoveTaskDate: (taskId: string, newDate: string, offsetFuture: boolean) => void;
  onBack: () => void;
}

export const CaseDetails: React.FC<CaseDetailsProps> = ({
  caseItem,
  client,
  applicant,
  visaSubclass,
  tasks,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  onMoveTaskDate,
  onBack
}) => {
  const repos = useRepositories();
  const navigate = useNavigate();
  const [offsetModal, setOffsetModal] = useState<{ taskId: string, newDate: string } | null>(null);
  const [editingDate, setEditingDate] = useState<{ taskId: string, date: string } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  // Case edit/delete state
  const [currentCase, setCurrentCase] = useState<Case>(caseItem);
  const [isEditingCase, setIsEditingCase] = useState(false);
  const [caseEditForm, setCaseEditForm] = useState({ title: caseItem.title, description: caseItem.description });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docRefreshKey, setDocRefreshKey] = useState(0);

  // Tab state
  const [activeTab, setActiveTab] = useState<'tasks' | 'documents' | 'notes'>('tasks');

  // Document checklist state (localStorage-backed)
  const checklistKey = `edamame_checklist_${caseItem.id}`;
  const [checklist, setChecklist] = useState<DocumentChecklistItem[]>(() => {
    try {
      const raw = localStorage.getItem(`edamame_checklist_${caseItem.id}`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return visaSubclass ? generateChecklist(caseItem.id, visaSubclass) : [];
  });

  // Persist checklist changes
  useEffect(() => {
    if (checklist.length > 0) {
      localStorage.setItem(checklistKey, JSON.stringify(checklist));
    }
  }, [checklist, checklistKey]);

  // Generate checklist lazily if none exists and we learn the subclass
  useEffect(() => {
    if (checklist.length === 0 && visaSubclass) {
      const generated = generateChecklist(caseItem.id, visaSubclass);
      setChecklist(generated);
    }
  }, [visaSubclass, caseItem.id, checklist.length]);

  const updateChecklistStatus = (id: string, status: ChecklistItemStatus) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  // Keep currentCase in sync if caseItem prop changes
  React.useEffect(() => {
    setCurrentCase(caseItem);
  }, [caseItem]);

  const statusConfig: Record<CaseStatus, { label: string; color: string; bg: string }> = {
    open: { label: 'Open', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    in_progress: { label: 'In Progress', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    on_hold: { label: 'On Hold', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    closed: { label: 'Closed', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
  };

  const handleStatusChange = async (newStatus: CaseStatus) => {
    const updated = { ...currentCase, status: newStatus };
    await repos.cases.update(updated);
    setCurrentCase(updated);
  };

  const handleSaveCase = async () => {
    if (!caseEditForm.title.trim()) return;
    const updated = { ...currentCase, title: caseEditForm.title.trim(), description: caseEditForm.description.trim() };
    await repos.cases.update(updated);
    setCurrentCase(updated);
    setIsEditingCase(false);
  };

  const handleDeleteCase = async () => {
    await repos.cases.delete(currentCase.id);
    onBack();
  };

  const caseTasks = useMemo(() => {
    return tasks
      .filter(t => t.caseId === caseItem.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.priorityOrder - b.priorityOrder);
  }, [tasks, caseItem.id]);

  const completedTasks = caseTasks.filter(t => t.isCompleted);
  const pendingTasks = caseTasks.filter(t => !t.isCompleted);

  const handleDateChange = (taskId: string, newDate: string) => {
    setEditingDate({ taskId, date: newDate });
  };

  const handleDateBlur = (taskId: string) => {
    if (!editingDate || editingDate.taskId !== taskId) return;
    
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
      setEditingDate(null);
      return;
    }

    if (editingDate.date === task.date) {
      setEditingDate(null);
      return;
    }

    // If there are future pending tasks, ask for offset
    const futureTasks = pendingTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));
    
    if (futureTasks.length > 0) {
      setOffsetModal({ taskId, newDate: editingDate.date });
    } else {
      onMoveTaskDate(taskId, editingDate.date, false);
    }
    setEditingDate(null);
  };

  const handleSetToday = (taskId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.date === today || task.isCompleted) return;

    const futureTasks = pendingTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));
    if (futureTasks.length > 0) {
      setOffsetModal({ taskId, newDate: today });
    } else {
      onMoveTaskDate(taskId, today, false);
    }
  };

  const handleOpenTaskModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setTaskForm({ title: task.title, description: task.description, date: task.date });
    } else {
      setEditingTask(null);
      setTaskForm({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });
    }
    setIsTaskModalOpen(true);
    setActiveDropdown(null);
  };

  const handleSaveTask = () => {
    if (!taskForm.title) return;

    if (editingTask) {
      onUpdateTask({
        ...editingTask,
        title: taskForm.title,
        description: taskForm.description,
        date: taskForm.date
      });
    } else {
      onAddTask({
        id: Math.random().toString(36).substr(2, 9),
        caseId: caseItem.id,
        title: taskForm.title,
        description: taskForm.description,
        date: taskForm.date,
        isCompleted: false,
        priorityOrder: 999, // App.tsx will handle normalization
        generatedByAi: false
      });
    }
    setIsTaskModalOpen(false);
  };

  const confirmOffset = (offset: boolean) => {
    if (offsetModal) {
      onMoveTaskDate(offsetModal.taskId, offsetModal.newDate, offset);
      setOffsetModal(null);
    }
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-gray-50 dark:bg-slate-950 min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="group flex items-center gap-2 text-sm text-gray-400 hover:text-edamame dark:hover:text-edamame-400 transition-colors mb-5 font-medium"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to Case Manager
          </button>
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                <span className="px-2.5 py-1 bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 text-xs font-bold rounded-lg uppercase tracking-wider font-mono">
                  #{currentCase.id.slice(0, 8).toUpperCase()}
                </span>
                <span className={`px-2.5 py-1 ${statusConfig[currentCase.status].bg} ${statusConfig[currentCase.status].color} text-xs font-bold rounded-lg uppercase tracking-wider`}>
                  {statusConfig[currentCase.status].label}
                </span>
                <span className="text-gray-400 dark:text-slate-600 text-xs">
                  Created {format(new Date(currentCase.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white font-ibm-serif tracking-tight">
                {currentCase.title}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={currentCase.status}
                onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 focus:border-edamame/50 outline-none cursor-pointer transition-colors"
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="closed">Closed</option>
              </select>
              <button
                onClick={() => { setCaseEditForm({ title: currentCase.title, description: currentCase.description }); setIsEditingCase(true); }}
                className="btn-press flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all text-sm"
              >
                <Edit2 size={15} />
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn-press flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm"
              >
                <Trash2 size={15} />
                Delete
              </button>
              <button
                onClick={() => navigate(`/focus?caseId=${currentCase.id}`)}
                className="btn-press flex items-center gap-2 px-3.5 py-2 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-xl shadow-lg shadow-edamame/20 transition-all text-sm"
                title="Open in Focus Mode"
              >
                <Zap size={15} />
                Focus
              </button>
              <button
                onClick={() => handleOpenTaskModal()}
                className="btn-press flex items-center gap-2 px-4 py-2 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-xl shadow-lg shadow-edamame/20 transition-all text-sm"
              >
                <Plus size={16} />
                Add Task
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-slate-800">
          {[
            { id: 'tasks', label: 'Tasks', icon: ClipboardList },
            { id: 'documents', label: 'Documents', icon: FolderOpen },
            { id: 'notes', label: 'Notes', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-edamame-500 text-edamame-600 dark:text-edamame-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
              {tab.id === 'documents' && checklist.length > 0 && (
                <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                  {checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length}/{checklist.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Client Info & Case Summary */}
          <div className="space-y-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="h-1 w-full bg-edamame" />
              <div className="p-5">
                <h2 className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <User size={13} />
                  {applicant && applicant.id !== client.id ? 'Parties' : 'Client Information'}
                </h2>
                <div className="space-y-3.5">
                  <div>
                    {applicant && applicant.id !== client.id ? (
                      <div className="space-y-2">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-0.5">Client</div>
                          <div className="text-base font-bold text-gray-900 dark:text-white">{client.name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">DOB: {client.dob}</div>
                        </div>
                        <div className="pt-2 border-t border-gray-100 dark:border-slate-800">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-edamame-600 dark:text-edamame-400 mb-0.5">Applicant</div>
                          <div className="text-base font-bold text-gray-900 dark:text-white">{applicant.name}</div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">DOB: {applicant.dob}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-base font-bold text-gray-900 dark:text-white">{client.name}</div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">DOB: {client.dob}</div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2 pt-3 border-t border-gray-50 dark:border-slate-800">
                    <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-slate-300">
                      <Mail size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-slate-300">
                      <Phone size={14} className="text-gray-400 flex-shrink-0" />
                      {client.phone}
                    </div>
                    <div className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-slate-300">
                      <MapPin size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{client.address}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-5">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <FileText size={13} />
                Case Description
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">
                {currentCase.description}
              </p>
            </div>
          </div>

          {/* Right Column: Tasks */}
          <div className="lg:col-span-2 space-y-8">
            {/* Pending Tasks */}
            <section>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="text-edamame" size={20} />
                Pending Tasks
                <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-xs rounded-full">
                  {pendingTasks.length}
                </span>
              </h2>
              <div className="space-y-3">
                {pendingTasks.length === 0 ? (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-800 p-8 text-center text-gray-500 dark:text-slate-500 italic">
                    All tasks completed!
                  </div>
                ) : (
                  pendingTasks.map(task => (
                    <div key={task.id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 hover:border-edamame/50 transition-colors group relative">
                      <div className="flex items-start gap-4">
                        <div className="relative mt-1">
                          <button 
                            onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
                            className="p-1.5 text-gray-400 hover:text-edamame hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Triangle size={18} className="rotate-180 fill-current" />
                          </button>
                          
                          {activeDropdown === task.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setActiveDropdown(null)}
                              />
                              <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-20 overflow-hidden">
                                <button 
                                  onClick={() => { onUpdateTask({ ...task, isCompleted: true }); setActiveDropdown(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Check size={16} className="text-green-500" />
                                  Mark as Complete
                                </button>
                                <button 
                                  disabled
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 dark:text-slate-600 cursor-not-allowed"
                                >
                                  <RotateCcw size={16} />
                                  Revert to Pending
                                </button>
                                <button 
                                  onClick={() => { handleSetToday(task.id); setActiveDropdown(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Calendar size={16} className="text-edamame" />
                                  Set to Today
                                </button>
                                <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                                <button 
                                  onClick={() => handleOpenTaskModal(task)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <Edit2 size={16} className="text-blue-500" />
                                  Edit
                                </button>
                                <button 
                                  onClick={() => { onDeleteTask(task.id); setActiveDropdown(null); }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 size={16} />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-edamame transition-colors">{task.title}</h3>
                              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{task.description}</p>
                            </div>
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                  <Calendar size={12} />
                                  Planned Date
                                </div>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="date"
                                    value={editingDate?.taskId === task.id ? editingDate.date : task.date}
                                    onChange={(e) => handleDateChange(task.id, e.target.value)}
                                    onBlur={() => handleDateBlur(task.id)}
                                    className="text-sm font-medium bg-gray-50 dark:bg-slate-800 border-none rounded-lg px-2 py-1 focus:ring-2 focus:ring-edamame text-gray-900 dark:text-white outline-none"
                                  />
                                </div>
                              </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Completed Tasks */}
            <section>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-green-500" size={20} />
                Completed Tasks
                <span className="ml-2 px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 text-xs rounded-full">
                  {completedTasks.length}
                </span>
              </h2>
              <div className="space-y-3 opacity-70">
                {completedTasks.map(task => (
                  <div key={task.id} className="bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800 p-4 relative">
                    <div className="flex items-start gap-4">
                      <div className="relative mt-1">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
                          className="p-1.5 text-gray-400 hover:text-edamame hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Triangle size={18} className="rotate-180 fill-current" />
                        </button>
                        
                        {activeDropdown === task.id && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveDropdown(null)}
                            />
                            <div className="absolute left-0 top-full mt-1 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-20 overflow-hidden">
                              <button 
                                disabled
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 dark:text-slate-600 cursor-not-allowed"
                              >
                                <Check size={16} />
                                Mark as Complete
                              </button>
                              <button 
                                onClick={() => { onUpdateTask({ ...task, isCompleted: false }); setActiveDropdown(null); }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <RotateCcw size={16} className="text-orange-500" />
                                Revert to Pending
                              </button>
                              <button 
                                disabled
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 dark:text-slate-600 cursor-not-allowed"
                              >
                                <Calendar size={16} />
                                Set to Today
                              </button>
                              <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                              <button 
                                onClick={() => handleOpenTaskModal(task)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Edit2 size={16} className="text-blue-500" />
                                Edit
                              </button>
                              <button 
                                onClick={() => { onDeleteTask(task.id); setActiveDropdown(null); }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-bold text-gray-900 dark:text-white line-through">{task.title}</h3>
                            <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">{task.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-600 uppercase tracking-wider mb-1">Actioned Date</div>
                            <div className="text-sm font-medium text-gray-500 dark:text-slate-500">{format(new Date(task.date), 'MMM d, yyyy')}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
        )} {/* end tasks tab */}

        {activeTab === 'documents' && (
        <div className="space-y-6">
          {/* Document Checklist */}
          {checklist.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="p-5">
                <h2 className="text-[11px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                  <ClipboardList size={13} />
                  Document Checklist
                  <span className="ml-auto font-normal text-gray-500 dark:text-slate-400">
                    {checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length} / {checklist.length} done
                  </span>
                </h2>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
                  <div
                    className="h-1.5 bg-edamame rounded-full transition-all duration-300"
                    style={{ width: `${checklist.length > 0 ? (checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length / checklist.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="space-y-2">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{item.label}</div>
                        {item.description && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.description}</div>}
                      </div>
                      <select
                        value={item.status}
                        onChange={(e) => updateChecklistStatus(item.id, e.target.value as ChecklistItemStatus)}
                        className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer flex-shrink-0 ${
                          item.status === 'verified' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                          item.status === 'uploaded' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                          item.status === 'waived' ? 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400' :
                          'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        <option value="pending">Pending</option>
                        <option value="uploaded">Uploaded</option>
                        <option value="verified">Verified</option>
                        <option value="waived">Waived</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Document upload */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Upload Documents</h2>
            <DocumentUpload caseId={currentCase.id} onUpload={() => setDocRefreshKey(k => k + 1)} />
          </div>
          <DocumentList caseId={currentCase.id} refreshKey={docRefreshKey} />
        </div>
        )}

        {activeTab === 'notes' && (
          <CaseNotes caseId={currentCase.id} />
        )}
      </div>

      {/* Edit Case Modal */}
      {isEditingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Edit Case</h3>
              <button onClick={() => setIsEditingCase(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Case Title</label>
                <input
                  type="text"
                  value={caseEditForm.title}
                  onChange={(e) => setCaseEditForm({ ...caseEditForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={caseEditForm.description}
                  onChange={(e) => setCaseEditForm({ ...caseEditForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white resize-none"
                  rows={4}
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setIsEditingCase(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCase}
                className="flex items-center gap-2 px-6 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
              >
                <Save size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Delete Case?</h3>
              <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
                Are you sure you want to delete <strong>"{currentCase.title}"</strong>? This action cannot be undone. All tasks associated with this case will remain but will no longer be linked.
              </p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCase}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all"
              >
                <Trash2 size={16} />
                Delete Case
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Modal (Add/Edit) */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'Add New Task'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Task Title</label>
                <input 
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white"
                  placeholder="e.g., Review Documents"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Description</label>
                <textarea 
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white resize-none"
                  rows={3}
                  placeholder="Add more details..."
                />
              </div>
              {!editingTask?.isCompleted && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Planned Date</label>
                  <div className="flex gap-2">
                    <input 
                      type="date"
                      value={taskForm.date}
                      onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white"
                    />
                    <button 
                      type="button"
                      onClick={() => setTaskForm({ ...taskForm, date: format(new Date(), 'yyyy-MM-dd') })}
                      className="px-4 py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-xs font-bold uppercase"
                    >
                      Today
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => setIsTaskModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveTask}
                className="px-6 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
              >
                Save Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offset Modal */}
      {offsetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-edamame/10 rounded-full flex items-center justify-center text-edamame mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Adjust Future Tasks?</h3>
              <p className="text-gray-600 dark:text-slate-400 leading-relaxed">
                You've changed the date for this task. Would you like to automatically offset all future pending tasks in this case by the same number of days?
              </p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-2">
              <button 
                onClick={() => confirmOffset(true)}
                className="w-full py-3 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
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
                Cancel Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
