import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Case, Client, Task, CaseStatus, DocumentChecklistItem, ChecklistItemStatus, FocusChatMessage, FocusConversation, FileTreeNode } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { CaseNotes } from '../components/CaseNotes';
import { DocumentUpload } from '../components/DocumentUpload';
import { DocumentList } from '../components/DocumentList';
import { PdfPackager } from '../components/PdfPackager';
import { generateChecklist, SUPPORTED_SUBCLASSES } from '../lib/checklistTemplates';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
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
  FolderOpen,
  Users,
  ClipboardList,
  MessageSquare,
  Send,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  Brain,
  Package,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Document } from '../types';

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

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

const InsightRow: React.FC<{ icon: React.ReactNode; color: string; text: string }> = ({ icon, color, text }) => {
  const colorMap: Record<string, string> = {
    red: 'text-red-500 dark:text-red-400',
    amber: 'text-amber-500 dark:text-amber-400',
    blue: 'text-blue-500 dark:text-blue-400',
    green: 'text-green-500 dark:text-green-400',
    gray: 'text-gray-400 dark:text-slate-500',
  };
  return (
    <div className={`flex items-start gap-2 text-xs ${colorMap[color] || colorMap.gray}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span>
      <span className="text-gray-600 dark:text-slate-300">{text}</span>
    </div>
  );
};

const ChatBubble: React.FC<{ message: FocusChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
        isUser
          ? 'bg-edamame text-white rounded-br-sm'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p className={`text-[10px] mt-1 ${isUser ? 'text-white/50' : 'text-gray-400 dark:text-gray-600'}`}>
          {format(new Date(message.createdAt), 'HH:mm')}
        </p>
      </div>
    </div>
  );
};

const FileTreeView: React.FC<{ nodes: FileTreeNode[]; depth?: number }> = ({ nodes, depth = 0 }) => {
  return (
    <div className={depth > 0 ? 'pl-3 border-l border-gray-200 dark:border-gray-800 ml-1.5' : ''}>
      {nodes.map((node, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
            {node.kind === 'directory' ? (
              <FolderOpen size={11} className="text-amber-500 flex-shrink-0" />
            ) : (
              <FileText size={11} className="text-gray-400 dark:text-gray-600 flex-shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.size && <span className="ml-auto text-gray-400 dark:text-gray-600 text-[10px] flex-shrink-0">{Math.round(node.size / 1024)}KB</span>}
          </div>
          {node.children && node.children.length > 0 && (
            <FileTreeView nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
};

async function buildFileTree(handle: FileSystemDirectoryHandle, depth = 0): Promise<FileTreeNode[]> {
  if (depth > 3) return [];
  const nodes: FileTreeNode[] = [];
  for await (const [, entry] of (handle as any).entries()) {
    if (entry.kind === 'directory') {
      const children = await buildFileTree(entry as FileSystemDirectoryHandle, depth + 1);
      nodes.push({ name: entry.name, kind: 'directory', children });
    } else {
      const file = await (entry as FileSystemFileHandle).getFile();
      nodes.push({ name: entry.name, kind: 'file', handle: entry as FileSystemFileHandle, size: file.size });
    }
  }
  return nodes.sort((a, b) => (a.kind === 'directory' ? -1 : 1) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // ---- Task state ----
  const [offsetModal, setOffsetModal] = useState<{ taskId: string, newDate: string } | null>(null);
  const [editingDate, setEditingDate] = useState<{ taskId: string, date: string } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });

  // ---- Case edit/delete state ----
  const [currentCase, setCurrentCase] = useState<Case>(caseItem);
  const [isEditingCase, setIsEditingCase] = useState(false);
  const [caseEditForm, setCaseEditForm] = useState({ title: caseItem.title, description: caseItem.description });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [docRefreshKey, setDocRefreshKey] = useState(0);

  // ---- Tab state ----
  const [activeTab, setActiveTab] = useState<'tasks' | 'documents' | 'notes'>('tasks');

  // ---- Left panel collapse state ----
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);

  // ---- Right panel (chat) state ----
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // ---- Document checklist state (localStorage-backed) ----
  const checklistKey = `edamame_checklist_${caseItem.id}`;
  const [checklist, setChecklist] = useState<DocumentChecklistItem[]>(() => {
    try {
      const raw = localStorage.getItem(`edamame_checklist_${caseItem.id}`);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return visaSubclass ? generateChecklist(caseItem.id, visaSubclass) : [];
  });
  const [checklistOpen, setChecklistOpen] = useState(false);

  // ---- Documents state ----
  const [documents, setDocuments] = useState<Document[]>([]);

  // ---- File explorer state ----
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirTree, setDirTree] = useState<FileTreeNode[] | null>(null);
  const DIR_KEY = `edamame_workspace_${caseItem.id}`;

  // ---- PdfPackager state ----
  const [showPackager, setShowPackager] = useState(false);

  // ---- Chat state ----
  const CHAT_STORAGE_KEY = `edamame_chat_${caseItem.id}`;
  const LEGACY_CHAT_KEY = `edamame_focus_chat_${caseItem.id}`;

  const [conversations, setConversations] = useState<FocusConversation[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY) || localStorage.getItem(LEGACY_CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [activeConvId, setActiveConvId] = useState<string | null>(
    () => conversations[0]?.id ?? null
  );
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations.find(c => c.id === activeConvId);

  // ---- Derived values ----
  const caseTasks = useMemo(() => {
    return tasks
      .filter(t => t.caseId === caseItem.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.priorityOrder - b.priorityOrder);
  }, [tasks, caseItem.id]);

  const completedTasks = caseTasks.filter(t => t.isCompleted);
  const pendingTasks = caseTasks.filter(t => !t.isCompleted);
  const progress = caseTasks.length > 0 ? Math.round((completedTasks.length / caseTasks.length) * 100) : 0;

  const hasOverdue = pendingTasks.some(t => new Date(t.date) < new Date());
  const passportExpiry = client.passportExpiry ? new Date(client.passportExpiry) : null;
  const daysToPassportExpiry = passportExpiry ? Math.floor((passportExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const uploadedCount = checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length;

  const statusConfig: Record<CaseStatus, { label: string; color: string; bg: string }> = {
    open: { label: 'Open', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    in_progress: { label: 'In Progress', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    on_hold: { label: 'On Hold', color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    closed: { label: 'Closed', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
  };

  // ---- Effects ----

  // Keep currentCase in sync if caseItem prop changes
  React.useEffect(() => {
    setCurrentCase(caseItem);
  }, [caseItem]);

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

  // Load documents on mount
  useEffect(() => {
    repos.documents.getByCaseId(caseItem.id)
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [caseItem.id, repos.documents, docRefreshKey]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  // ---- Checklist handlers ----
  const updateChecklistStatus = (id: string, status: ChecklistItemStatus) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  // Cycle checklist status on click: pending → uploaded → verified → pending
  const cycleChecklistStatus = (id: string, currentStatus: ChecklistItemStatus) => {
    const cycle: Record<ChecklistItemStatus, ChecklistItemStatus> = {
      pending: 'uploaded',
      uploaded: 'verified',
      verified: 'pending',
      waived: 'pending',
    };
    updateChecklistStatus(id, cycle[currentStatus]);
  };

  // ---- Case handlers ----
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

  // ---- Task handlers ----
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
        priorityOrder: 999,
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

  // ---- File explorer handlers ----
  const pickDirectory = async () => {
    if (!('showDirectoryPicker' in window)) return;
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setDirHandle(handle);
      localStorage.setItem(DIR_KEY, handle.name);
      const tree = await buildFileTree(handle);
      setDirTree(tree);
    } catch { /* user cancelled */ }
  };

  // ---- Chat handlers ----
  const persistConvs = (convs: FocusConversation[]) => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(convs));
  };

  const createConversation = () => {
    const conv: FocusConversation = {
      id: uuidv4(),
      caseId: caseItem.id,
      title: `Chat ${conversations.length + 1}`,
      messages: [],
      createdAt: new Date().toISOString(),
    };
    const next = [conv, ...conversations];
    setConversations(next);
    persistConvs(next);
    setActiveConvId(conv.id);
  };

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim() || isSending) return;

    const convId = activeConvId || (() => {
      const id = uuidv4();
      const conv: FocusConversation = {
        id,
        caseId: caseItem.id,
        title: chatInput.slice(0, 40),
        messages: [],
        createdAt: new Date().toISOString(),
      };
      const next = [conv, ...conversations];
      setConversations(next);
      persistConvs(next);
      setActiveConvId(id);
      return id;
    })();

    const userMsg: FocusChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: chatInput.trim(),
      createdAt: new Date().toISOString(),
    };

    setConversations(prev => {
      const next = prev.map(c => {
        if (c.id !== convId) return c;
        const updated = { ...c, messages: [...c.messages, userMsg] };
        if (c.messages.length === 0) updated.title = userMsg.content.slice(0, 40);
        return updated;
      });
      persistConvs(next);
      return next;
    });
    setChatInput('');
    setIsSending(true);

    try {
      const caseContext = [
        `Case: ${caseItem.title}`,
        `Client: ${client.name}`,
        applicant && applicant.id !== client.id ? `Applicant: ${applicant.name}` : null,
        visaSubclass ? `Visa Type: Subclass ${visaSubclass}` : null,
        `Status: ${caseItem.status}`,
        `Progress: ${completedTasks.length}/${caseTasks.length} tasks completed (${progress}%)`,
        pendingTasks.length > 0 ? `Next task: ${pendingTasks[0]?.title}` : null,
        checklist.length > 0 ? `Documents: ${uploadedCount}/${checklist.length} collected` : null,
      ].filter(Boolean).join('\n');

      const currentConv = conversations.find(c => c.id === convId);
      const historyMessages = [...(currentConv?.messages || []), userMsg];

      const response = await fetch('/api/focus-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          caseContext,
        }),
      });

      const data = await response.json();
      const replyText = data.reply || 'Sorry, I could not generate a response.';

      const assistantMsg: FocusChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: replyText,
        createdAt: new Date().toISOString(),
      };

      setConversations(prev => {
        const next = prev.map(c => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, assistantMsg] };
        });
        persistConvs(next);
        return next;
      });
    } catch {
      const errMsg: FocusChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Connection error. Please check your API key and try again.',
        createdAt: new Date().toISOString(),
      };
      setConversations(prev => {
        const next = prev.map(c => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, errMsg] };
        });
        persistConvs(next);
        return next;
      });
    } finally {
      setIsSending(false);
    }
  }, [chatInput, isSending, activeConvId, conversations, caseItem, client, applicant, visaSubclass, completedTasks, caseTasks, pendingTasks, checklist, progress, uploadedCount]);

  const handleSkillAction = (msg: string) => {
    setChatInput(msg);
    if (!rightPanelOpen) setRightPanelOpen(true);
  };

  // ---- Render ----
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">

      {/* ══════════════════════════════════════════
          PAGE HEADER — spans full width
      ══════════════════════════════════════════ */}
      <header className="flex-shrink-0 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 z-10">
        {/* Top row: breadcrumb + title + actions */}
        <div className="flex items-center gap-3 pl-5 pr-14 py-3">
          {/* Back */}
          <button
            onClick={onBack}
            className="group flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">Cases</span>
          </button>

          <span className="text-gray-200 dark:text-slate-700 select-none">/</span>

          {/* Case title + ID */}
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
              {currentCase.title}
            </h1>
            <span className="hidden sm:inline-flex flex-shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 tracking-wider">
              #{currentCase.id.slice(0, 8).toUpperCase()}
            </span>
            {visaSubclass && (
              <span className="hidden md:inline-flex flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 tracking-wide">
                SC-{visaSubclass}
              </span>
            )}
          </div>

          {/* Status selector */}
          <select
            value={currentCase.status}
            onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
            className={`flex-shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border-0 outline-none cursor-pointer transition-colors ${
              currentCase.status === 'open' ? 'bg-blue-100 dark:bg-blue-800/70 text-blue-700 dark:text-blue-200' :
              currentCase.status === 'in_progress' ? 'bg-amber-100 dark:bg-amber-800/70 text-amber-700 dark:text-amber-200' :
              currentCase.status === 'on_hold' ? 'bg-orange-100 dark:bg-orange-800/70 text-orange-700 dark:text-orange-200' :
              'bg-green-100 dark:bg-green-800/70 text-green-700 dark:text-green-200'
            }`}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
          </select>

          {/* AI tool buttons */}
          <div className="flex items-center gap-1 border-l border-gray-100 dark:border-slate-800 pl-3 ml-0.5">
            <button
              onClick={() => handleSkillAction('Please help me draft a cover letter for this immigration case.')}
              title="Draft Document"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-800/60 text-blue-600 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-700/70 transition-colors"
            >
              <FileText size={12} />
              <span className="hidden lg:inline">Draft</span>
            </button>
            <button
              onClick={() => handleSkillAction('Please analyse the current eligibility position for this case and flag any risks.')}
              title="Check Eligibility"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-violet-50 dark:bg-violet-800/60 text-violet-600 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-700/70 transition-colors"
            >
              <Brain size={12} />
              <span className="hidden lg:inline">Eligibility</span>
            </button>
            <button
              onClick={() => handleSkillAction(`Which documents are still outstanding for this ${visaSubclass ? `Subclass ${visaSubclass}` : 'visa'} case?`)}
              title="Check Documents"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-800/60 text-amber-600 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-700/70 transition-colors"
            >
              <ClipboardList size={12} />
              <span className="hidden lg:inline">Docs</span>
            </button>
            <button
              onClick={() => { if (SUPPORTED_SUBCLASSES.includes(visaSubclass || '')) setShowPackager(true); }}
              disabled={!SUPPORTED_SUBCLASSES.includes(visaSubclass || '')}
              title="5MB Crusher"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                SUPPORTED_SUBCLASSES.includes(visaSubclass || '')
                  ? 'bg-edamame/10 dark:bg-edamame/25 text-edamame-700 dark:text-edamame-200 hover:bg-edamame/20 dark:hover:bg-edamame/35'
                  : 'bg-gray-50 dark:bg-slate-800/50 text-gray-300 dark:text-slate-700 cursor-not-allowed'
              }`}
            >
              <Package size={12} />
              {SUPPORTED_SUBCLASSES.includes(visaSubclass || '') && <span className="hidden lg:inline">Crusher</span>}
            </button>
          </div>

          {/* Add Task + Agent toggle */}
          <button
            onClick={() => handleOpenTaskModal()}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-lg text-xs shadow-sm shadow-edamame/20 transition-all"
          >
            <Plus size={13} />
            Add Task
          </button>
          <button
            onClick={() => setRightPanelOpen(v => !v)}
            title={rightPanelOpen ? 'Close agent' : 'Open agent'}
            className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${rightPanelOpen ? 'bg-edamame/10 text-edamame dark:text-edamame-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
          >
            {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          BODY — three columns
      ══════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT PANEL ── */}
        <div className={`flex-shrink-0 border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden transition-[width] duration-300 ease-in-out hidden lg:flex ${leftPanelCollapsed ? 'w-12' : 'w-64'}`}>
          {leftPanelCollapsed ? (
            /* Icon rail */
            <div className="flex flex-col items-center pt-3 gap-1 h-full">
              <button onClick={() => setLeftPanelCollapsed(false)} title="Expand" className="p-2 text-gray-300 dark:text-slate-700 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <ChevronRight size={14} />
              </button>
              <div className="w-7 h-7 rounded-full bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center text-edamame text-[10px] font-black flex-shrink-0 mt-1" title={client.name}>
                {client.name.charAt(0)}
              </div>
              <button onClick={() => setLeftPanelCollapsed(false)} title={`Progress: ${progress}%`} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors mt-1 relative">
                <svg width="22" height="22" viewBox="0 0 22 22">
                  <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-200 dark:text-gray-700" />
                  <circle cx="11" cy="11" r="8" fill="none" stroke="#29B767" strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={`${(progress / 100) * 50.3} 50.3`} transform="rotate(-90 11 11)"
                    style={{ transition: 'stroke-dasharray 0.5s ease' }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-gray-500 dark:text-slate-400 pointer-events-none">{progress}%</span>
              </button>
              {(hasOverdue || (daysToPassportExpiry !== null && daysToPassportExpiry < 90)) && (
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-0.5" title="Alerts" />
              )}
              <div className="flex-1" />
              <button onClick={() => { setCaseEditForm({ title: currentCase.title, description: currentCase.description }); setIsEditingCase(true); }} title="Edit Case" className="p-2 text-gray-300 dark:text-slate-700 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors mb-1">
                <Edit2 size={13} />
              </button>
              <button onClick={() => setShowDeleteConfirm(true)} title="Delete" className="p-2 text-red-300 dark:text-red-900 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mb-2">
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            /* Full panel */
            <div className="flex flex-col h-full overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Case Info</span>
                <button onClick={() => setLeftPanelCollapsed(true)} className="p-1 text-gray-300 dark:text-slate-700 hover:text-gray-500 dark:hover:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  <ChevronLeft size={13} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Client block */}
                <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center text-edamame font-black text-sm flex-shrink-0">
                      {client.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{client.name}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB: {client.dob}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                      <Mail size={10} className="flex-shrink-0 text-gray-300 dark:text-slate-600" />{client.email}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
                      <Phone size={10} className="flex-shrink-0 text-gray-300 dark:text-slate-600" />{client.phone}
                    </div>
                  </div>
                  {applicant && applicant.id !== client.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-edamame-500 dark:text-edamame-400 mb-1.5">Applicant</div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center text-violet-600 dark:text-violet-400 font-black text-[10px] flex-shrink-0">
                          {applicant.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{applicant.name}</div>
                          <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB: {applicant.dob}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500">Progress</span>
                    <span className="text-xs font-bold text-edamame-600 dark:text-edamame-400">{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-edamame rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] text-gray-400 dark:text-slate-600">
                    <span>{completedTasks.length} done</span>
                    <span>{pendingTasks.length} pending</span>
                  </div>
                </div>

                {/* AI Insights — compact alert list */}
                {(hasOverdue || (daysToPassportExpiry !== null && daysToPassportExpiry < 90) || (checklist.length > 0 && uploadedCount < checklist.length)) && (
                  <div className="px-4 py-4 border-b border-gray-100 dark:border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2.5 flex items-center gap-1.5">
                      <Brain size={10} />
                      Alerts
                    </div>
                    <div className="space-y-1.5">
                      {daysToPassportExpiry !== null && daysToPassportExpiry < 90 && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <AlertCircle size={10} className="text-red-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 dark:text-slate-400 leading-snug">Passport expires in {daysToPassportExpiry}d</span>
                        </div>
                      )}
                      {hasOverdue && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <Clock size={10} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 dark:text-slate-400 leading-snug">{pendingTasks.filter(t => new Date(t.date) < new Date()).length} overdue task(s)</span>
                        </div>
                      )}
                      {checklist.length > 0 && uploadedCount < checklist.length && (
                        <div className="flex items-start gap-2 text-[11px]">
                          <ClipboardList size={10} className="text-blue-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 dark:text-slate-400 leading-snug">{checklist.length - uploadedCount} doc(s) outstanding</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Expandable: Checklist */}
                {checklist.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
                    <button
                      onClick={() => setChecklistOpen(v => !v)}
                      className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                    >
                      <span className="flex items-center gap-1.5"><ClipboardList size={10} />Docs {uploadedCount}/{checklist.length}</span>
                      {checklistOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    {checklistOpen && (
                      <div className="mt-2.5 space-y-1.5">
                        {checklist.map(item => (
                          <div key={item.id} className="flex items-center gap-2">
                            <button onClick={() => cycleChecklistStatus(item.id, item.status)} className="flex-shrink-0">
                              {item.status === 'uploaded' || item.status === 'verified'
                                ? <CheckCircle2 size={12} className="text-green-500" />
                                : <Circle size={12} className="text-gray-300 dark:text-gray-700" />}
                            </button>
                            <span className={`text-[11px] truncate leading-snug ${item.status === 'uploaded' || item.status === 'verified' ? 'text-gray-400 line-through' : 'text-gray-600 dark:text-slate-400'}`}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Workspace */}
                <div className="px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                    <FolderOpen size={10} />Workspace
                  </div>
                  {dirTree ? <FileTreeView nodes={dirTree} /> : (
                    <button onClick={pickDirectory} className="w-full text-[11px] text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 border border-dashed border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 transition-colors hover:border-gray-300 dark:hover:border-slate-600 text-left">
                      {('showDirectoryPicker' in window) ? '+ Link local folder' : 'Not supported'}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit / Delete */}
              <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 flex gap-2 flex-shrink-0">
                <button
                  onClick={() => { setCaseEditForm({ title: currentCase.title, description: currentCase.description }); setIsEditingCase(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Edit2 size={12} />Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 size={12} />Delete
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER PANEL ── */}
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">

          {/* Tab bar */}
          <div className="flex-shrink-0 px-6 bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800">
            <div className="flex gap-0">
              {[
                { id: 'tasks', label: 'Tasks', icon: ClipboardList, count: pendingTasks.length },
                { id: 'documents', label: 'Documents', icon: FolderOpen, count: checklist.length > 0 ? checklist.length - uploadedCount : 0 },
                { id: 'notes', label: 'Notes', icon: FileText, count: 0 },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-edamame text-gray-900 dark:text-white'
                      : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">

            {activeTab === 'tasks' && (
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">

                {/* Pending Tasks */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Pending</h2>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{pendingTasks.length} tasks</span>
                    {hasOverdue && (
                      <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                        {pendingTasks.filter(t => new Date(t.date) < new Date()).length} overdue
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {pendingTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-800 p-10 text-center">
                        <CheckCircle2 size={28} className="mx-auto mb-2 text-gray-200 dark:text-slate-700" />
                        <p className="text-sm text-gray-400 dark:text-slate-500">All tasks completed</p>
                      </div>
                    ) : (
                      pendingTasks.map(task => {
                        const isOverdue = new Date(task.date) < new Date();
                        return (
                          <div
                            key={task.id}
                            className={`group relative bg-white dark:bg-slate-900 rounded-xl border transition-all hover:shadow-sm ${
                              isOverdue
                                ? 'border-red-200 dark:border-red-900/40 hover:border-red-300 dark:hover:border-red-800'
                                : 'border-gray-100 dark:border-slate-800 hover:border-gray-200 dark:hover:border-slate-700'
                            }`}
                          >
                            {/* Left accent stripe */}
                            <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${isOverdue ? 'bg-red-400' : 'bg-gray-200 dark:bg-slate-700 group-hover:bg-edamame/50'} transition-colors`} />

                            <div className="flex items-center gap-3 px-4 py-3.5 pl-5">
                              {/* Action button */}
                              <div className="relative flex-shrink-0">
                                <button
                                  onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
                                  className="w-5 h-5 rounded-full border-2 border-gray-200 dark:border-slate-600 hover:border-edamame dark:hover:border-edamame transition-colors flex items-center justify-center group/check"
                                >
                                  <Check size={10} className="text-transparent group-hover/check:text-edamame transition-colors" />
                                </button>
                                {activeDropdown === task.id && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
                                    <div className="absolute left-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-20">
                                      <button onClick={() => { onUpdateTask({ ...task, isCompleted: true }); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                        <Check size={14} className="text-green-500" />Mark Complete
                                      </button>
                                      <button onClick={() => { handleSetToday(task.id); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                        <Calendar size={14} className="text-edamame" />Set to Today
                                      </button>
                                      <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                                      <button onClick={() => handleOpenTaskModal(task)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                        <Edit2 size={14} className="text-blue-400" />Edit
                                      </button>
                                      <button onClick={() => { onDeleteTask(task.id); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                        <Trash2 size={14} />Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{task.title}</div>
                                {task.description && (
                                  <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">{task.description}</div>
                                )}
                              </div>

                              {/* Date */}
                              <div className="flex-shrink-0 text-right">
                                <input
                                  type="date"
                                  value={editingDate?.taskId === task.id ? editingDate.date : task.date}
                                  onChange={(e) => handleDateChange(task.id, e.target.value)}
                                  onBlur={() => handleDateBlur(task.id)}
                                  className={`text-xs font-medium bg-transparent border-none rounded-lg px-2 py-1 focus:ring-2 focus:ring-edamame outline-none transition-colors ${isOverdue ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-slate-400'}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <section>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-sm font-bold text-gray-500 dark:text-slate-500">Completed</h2>
                      <span className="text-xs text-gray-300 dark:text-slate-600">{completedTasks.length} tasks</span>
                    </div>
                    <div className="space-y-1.5 opacity-60">
                      {completedTasks.map(task => (
                        <div key={task.id} className="group relative bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-800/50">
                          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-green-400/50" />
                          <div className="flex items-center gap-3 px-4 py-3 pl-5">
                            <div className="relative flex-shrink-0">
                              <button
                                onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
                                className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700 flex items-center justify-center"
                              >
                                <Check size={10} className="text-green-500 dark:text-green-400" />
                              </button>
                              {activeDropdown === task.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
                                  <div className="absolute left-0 top-full mt-1.5 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 py-1 z-20">
                                    <button onClick={() => { onUpdateTask({ ...task, isCompleted: false }); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                      <RotateCcw size={14} className="text-orange-400" />Revert to Pending
                                    </button>
                                    <button onClick={() => handleOpenTaskModal(task)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                      <Edit2 size={14} className="text-blue-400" />Edit
                                    </button>
                                    <button onClick={() => { onDeleteTask(task.id); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                      <Trash2 size={14} />Delete
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-400 dark:text-slate-500 line-through leading-snug">{task.title}</div>
                            </div>
                            <div className="flex-shrink-0 text-xs text-gray-300 dark:text-slate-600">
                              {format(new Date(task.date), 'MMM d')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
                {checklist.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden">
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <ClipboardList size={14} className="text-gray-400" />
                          Document Checklist
                        </h2>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length}/{checklist.length}</span>
                      </div>
                      <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full mb-4">
                        <div className="h-1 bg-edamame rounded-full transition-all duration-300" style={{ width: `${checklist.length > 0 ? (checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length / checklist.length) * 100 : 0}%` }} />
                      </div>
                      <div className="space-y-1.5">
                        {checklist.map(item => (
                          <div key={item.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 dark:text-slate-200">{item.label}</div>
                              {item.description && <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{item.description}</div>}
                            </div>
                            <select
                              value={item.status}
                              onChange={(e) => updateChecklistStatus(item.id, e.target.value as ChecklistItemStatus)}
                              className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 outline-none cursor-pointer flex-shrink-0 ${
                                item.status === 'verified' ? 'bg-green-100 dark:bg-green-800/70 text-green-700 dark:text-green-200' :
                                item.status === 'uploaded' ? 'bg-blue-100 dark:bg-blue-800/70 text-blue-700 dark:text-blue-200' :
                                item.status === 'waived' ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300' :
                                'bg-amber-100 dark:bg-amber-800/70 text-amber-700 dark:text-amber-200'
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
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Upload Documents</h2>
                  <DocumentUpload caseId={currentCase.id} onUpload={() => setDocRefreshKey(k => k + 1)} />
                </div>
                <DocumentList caseId={currentCase.id} refreshKey={docRefreshKey} />
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="max-w-3xl mx-auto px-6 py-6">
                <CaseNotes caseId={currentCase.id} />
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL (chat) ── */}
        <div className={`${rightPanelOpen ? 'w-80 xl:w-96' : 'w-0'} flex-shrink-0 border-l border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 flex flex-col overflow-hidden transition-[width] duration-200 hidden lg:flex`}>
          {rightPanelOpen && (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-edamame flex items-center justify-center">
                    <Brain size={11} className="text-white" />
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Agent</span>
                  {conversations.length > 0 && (
                    <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500">{conversations.length} chat{conversations.length !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <button
                  onClick={createConversation}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <Plus size={11} />
                  New
                </button>
              </div>

              {/* Conversation tabs */}
              {conversations.length > 1 && (
                <div className="flex gap-1 px-3 py-2 border-b border-gray-100 dark:border-slate-800 overflow-x-auto">
                  {conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors truncate max-w-[90px] ${
                        activeConvId === conv.id
                          ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400'
                          : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                      }`}
                    >{conv.title || 'Chat'}</button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
                {!activeConv || activeConv.messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 pb-8">
                    <div className="w-10 h-10 rounded-2xl bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center mb-3">
                      <Brain size={18} className="text-edamame dark:text-edamame-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">Edamame Agent</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 leading-relaxed">Ask anything about this case — I already know the context, client details, and outstanding tasks.</p>
                  </div>
                ) : (
                  activeConv.messages.map(msg => (
                    <ChatBubble key={msg.id} message={msg} />
                  ))
                )}
                {isSending && (
                  <div className="flex items-center gap-2 pl-1">
                    <div className="flex gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '120ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-600 animate-bounce" style={{ animationDelay: '240ms' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-gray-100 dark:border-slate-800 flex-shrink-0">
                <div className="relative">
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                    }}
                    placeholder="Ask about this case…"
                    rows={2}
                    className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 resize-none outline-none focus:border-edamame/50 focus:ring-1 focus:ring-edamame/20 transition-all"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!chatInput.trim() || isSending}
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-edamame hover:bg-edamame-600 text-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Send size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── MODALS ── */}

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

      {/* PdfPackager modal */}
      {showPackager && (
        <PdfPackager
          caseId={caseItem.id}
          documents={documents}
          visaSubclass={visaSubclass || ''}
          onClose={() => setShowPackager(false)}
        />
      )}

    </div>
  );
};
