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
  Circle,
  Brain,
  Package,
  Sparkles,
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

const ActionCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  color: string;
  badge?: string;
  disabled?: boolean;
  tooltip?: string;
  onClick: () => void;
}> = ({ icon, label, sublabel, color, badge, disabled, tooltip, onClick }) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400',
    violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-500 dark:text-violet-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-500 dark:text-amber-400',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-500 dark:text-green-400',
    gray: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600',
  };

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      title={tooltip}
      className={`group relative flex flex-col items-start p-3 rounded-xl border transition-all duration-150 text-left w-full ${
        disabled
          ? 'border-gray-200 dark:border-gray-800 opacity-40 cursor-not-allowed bg-white dark:bg-slate-900'
          : 'border-gray-200 dark:border-slate-700 hover:border-edamame/50 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer'
      }`}
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 transition-colors ${colorMap[color] || colorMap.gray}`}>
        {icon}
      </div>
      <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 leading-tight">{label}</div>
      <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 leading-tight">{sublabel}</div>
      {badge && (
        <span className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400">
          {badge}
        </span>
      )}
    </button>
  );
};

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
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-950">

      {/* ── LEFT PANEL (w-72) ── */}
      <div className="w-72 flex-shrink-0 bg-gray-50 dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 flex flex-col overflow-y-auto custom-scrollbar hidden lg:flex">
        <div className="p-4 space-y-5">

          {/* Back nav */}
          <button
            onClick={onBack}
            className="group flex items-center gap-2 text-xs text-gray-400 hover:text-edamame dark:hover:text-edamame-400 transition-colors font-medium"
          >
            <ArrowLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
            Case Manager
          </button>

          {/* Case title + badges */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className="px-2 py-0.5 bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400 text-[10px] font-bold rounded-md uppercase tracking-wider font-mono">
                #{currentCase.id.slice(0, 8).toUpperCase()}
              </span>
              <span className={`px-2 py-0.5 ${statusConfig[currentCase.status].bg} ${statusConfig[currentCase.status].color} text-[10px] font-bold rounded-md uppercase tracking-wider`}>
                {statusConfig[currentCase.status].label}
              </span>
            </div>
            <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
              {currentCase.title}
            </h1>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
              Created {format(new Date(currentCase.createdAt), 'MMM d, yyyy')}
            </div>
          </div>

          {/* Client / Applicant */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <User size={10} />
              {applicant && applicant.id !== client.id ? 'Parties' : 'Client'}
            </div>
            {applicant && applicant.id !== client.id ? (
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500 mb-0.5">Client</div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">{client.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB: {client.dob}</div>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-edamame-600 dark:text-edamame-400 mb-0.5">Applicant</div>
                  <div className="text-xs font-semibold text-gray-900 dark:text-white">{applicant.name}</div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB: {applicant.dob}</div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white">{client.name}</div>
                <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">DOB: {client.dob}</div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-slate-400">
                    <Mail size={10} className="flex-shrink-0" />{client.email}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-slate-400">
                    <Phone size={10} className="flex-shrink-0" />{client.phone}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="text-gray-400 dark:text-slate-500 font-semibold uppercase tracking-wider">Progress</span>
              <span className="text-edamame-600 dark:text-edamame-400 font-bold">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full">
              <div className="h-1.5 bg-edamame rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">{completedTasks.length}/{caseTasks.length} tasks done</div>
          </div>

          {/* AI Insights */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Brain size={10} />
              AI Insights
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-3 space-y-2">
              {daysToPassportExpiry !== null && (
                <InsightRow
                  icon={<AlertCircle size={11} />}
                  color={daysToPassportExpiry < 90 ? 'red' : 'gray'}
                  text={`Passport expires in ${daysToPassportExpiry} days (${format(passportExpiry!, 'dd MMM yyyy')})`}
                />
              )}
              {hasOverdue && (
                <InsightRow
                  icon={<Clock size={11} />}
                  color="amber"
                  text={`${pendingTasks.filter(t => new Date(t.date) < new Date()).length} overdue task(s) require attention`}
                />
              )}
              {checklist.length > 0 && uploadedCount < checklist.length && (
                <InsightRow
                  icon={<ClipboardList size={11} />}
                  color="blue"
                  text={`${checklist.length - uploadedCount} document(s) outstanding`}
                />
              )}
              {pendingTasks.length > 0 && (
                <InsightRow
                  icon={<Circle size={11} />}
                  color="gray"
                  text={`Next: ${pendingTasks[0].title} — due ${format(new Date(pendingTasks[0].date), 'MMM d')}`}
                />
              )}
              {!hasOverdue && checklist.length === 0 && pendingTasks.length === 0 && (
                <InsightRow icon={<CheckCircle2 size={11} />} color="green" text="All tasks and documents on track" />
              )}
            </div>
          </div>

          {/* Document checklist compact */}
          {checklist.length > 0 && (
            <div>
              <button
                onClick={() => setChecklistOpen(v => !v)}
                className="w-full flex items-center justify-between text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              >
                <span className="flex items-center gap-1">
                  <ClipboardList size={10} />
                  Docs {uploadedCount}/{checklist.length}
                </span>
                {checklistOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800 rounded-full mb-2">
                <div
                  className="h-1 bg-green-500 rounded-full"
                  style={{ width: `${checklist.length > 0 ? (uploadedCount / checklist.length) * 100 : 0}%` }}
                />
              </div>
              {checklistOpen && (
                <div className="space-y-1.5">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => cycleChecklistStatus(item.id, item.status)}
                        className="flex-shrink-0"
                      >
                        {item.status === 'uploaded' || item.status === 'verified'
                          ? <CheckCircle2 size={13} className="text-green-500" />
                          : <Circle size={13} className="text-gray-300 dark:text-gray-700" />
                        }
                      </button>
                      <span className={`truncate text-[11px] ${item.status === 'uploaded' || item.status === 'verified' ? 'text-gray-400 line-through' : 'text-gray-600 dark:text-slate-400'}`}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File explorer */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <FolderOpen size={10} />
              Workspace
            </div>
            {dirTree ? (
              <FileTreeView nodes={dirTree} />
            ) : (
              <button
                onClick={pickDirectory}
                className="w-full text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 transition-colors hover:border-gray-400 dark:hover:border-gray-500"
              >
                {('showDirectoryPicker' in window)
                  ? '+ Link local folder'
                  : 'File picker not supported in this browser'
                }
              </button>
            )}
          </div>

          {/* Edit / Delete buttons */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-slate-800">
            <button
              onClick={() => { setCaseEditForm({ title: currentCase.title, description: currentCase.description }); setIsEditingCase(true); }}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700 transition-all text-xs"
            >
              <Edit2 size={13} />
              Edit Case
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 font-semibold rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-xs"
            >
              <Trash2 size={13} />
              Delete Case
            </button>
          </div>

        </div>
      </div>

      {/* ── CENTER PANEL (flex-1) ── */}
      <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative">

        {/* Mobile header (shown only below lg) */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{currentCase.title}</div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500">#{currentCase.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <select
            value={currentCase.status}
            onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
            className="text-xs px-2 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 outline-none"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {/* Desktop header bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <select
              value={currentCase.status}
              onChange={(e) => handleStatusChange(e.target.value as CaseStatus)}
              className="px-3 py-1.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 focus:border-edamame/50 outline-none cursor-pointer transition-colors"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="on_hold">On Hold</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenTaskModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-edamame hover:bg-edamame-600 text-white font-semibold rounded-lg shadow-sm shadow-edamame/20 transition-all text-xs"
            >
              <Plus size={13} />
              Add Task
            </button>
            <button
              onClick={() => setRightPanelOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-400 font-semibold rounded-lg transition-all text-xs"
              title={rightPanelOpen ? 'Collapse Agent panel' : 'Open Agent panel'}
            >
              {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              Agent
            </button>
          </div>
        </div>

        {/* Tab bar + skill actions */}
        <div className="flex-shrink-0 px-4 lg:px-6 pt-3 bg-white dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-transparent -mb-px">
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
                <tab.icon size={14} />
                {tab.label}
                {tab.id === 'documents' && checklist.length > 0 && (
                  <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                    {checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length}/{checklist.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Skill Actions row */}
          <div className="py-3">
            <div className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Sparkles size={10} className="text-edamame-500" />
              Skill Actions
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ActionCard
                icon={<FileText size={14} />}
                label="Draft Document"
                sublabel="AI-assisted drafting"
                color="blue"
                onClick={() => handleSkillAction('Please help me draft a cover letter for this immigration case.')}
              />
              <ActionCard
                icon={<Brain size={14} />}
                label="Check Eligibility"
                sublabel="Analyse current position"
                color="violet"
                onClick={() => handleSkillAction('Please analyse the current eligibility position for this case and flag any risks.')}
              />
              <ActionCard
                icon={<ClipboardList size={14} />}
                label="Verify Documents"
                sublabel="Document checklist review"
                color="amber"
                onClick={() => handleSkillAction(`Which documents are still outstanding for this ${visaSubclass ? `Subclass ${visaSubclass}` : 'visa'} case?`)}
              />
              <ActionCard
                icon={<Package size={14} />}
                label="5MB Crusher"
                sublabel="Bundle PDFs for ImmiAccount"
                color={SUPPORTED_SUBCLASSES.includes(visaSubclass || '') ? 'green' : 'gray'}
                badge={SUPPORTED_SUBCLASSES.includes(visaSubclass || '') ? 'Ready' : undefined}
                disabled={!SUPPORTED_SUBCLASSES.includes(visaSubclass || '')}
                tooltip={!SUPPORTED_SUBCLASSES.includes(visaSubclass || '') ? 'Not required for this visa type' : undefined}
                onClick={() => setShowPackager(true)}
              />
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6">

          {activeTab === 'tasks' && (
            <div className="space-y-8">
              {/* Pending Tasks */}
              <section>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Clock className="text-edamame" size={18} />
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
                                <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
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
                    ))
                  )}
                </div>
              </section>

              {/* Completed Tasks */}
              <section>
                <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <CheckCircle2 className="text-green-500" size={18} />
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
                              <div className="fixed inset-0 z-10" onClick={() => setActiveDropdown(null)} />
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
          )}

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
      </div>

      {/* ── RIGHT PANEL (chat, collapsible) ── */}
      <div className={`${rightPanelOpen ? 'w-96' : 'w-0'} flex-shrink-0 bg-gray-50 dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 flex flex-col overflow-hidden transition-all duration-200 hidden lg:flex`}>
        {rightPanelOpen && (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-edamame-500" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">Edamame Agent</span>
              </div>
              <button
                onClick={createConversation}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <Plus size={12} />
                New chat
              </button>
            </div>

            {/* Conversation tabs (if multiple) */}
            {conversations.length > 1 && (
              <div className="flex gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-slate-800 overflow-x-auto">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConvId(conv.id)}
                    className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors truncate max-w-[100px] ${
                      activeConvId === conv.id
                        ? 'bg-edamame/10 text-edamame-600 dark:text-edamame-400'
                        : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {conv.title || 'Chat'}
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
              {!activeConv || activeConv.messages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-700" />
                  <p className="text-xs text-gray-400 dark:text-slate-600">Ask anything about this case.</p>
                  <p className="text-[10px] text-gray-300 dark:text-slate-700 mt-1">I know your case context.</p>
                </div>
              ) : (
                activeConv.messages.map(msg => (
                  <ChatBubble key={msg.id} message={msg} />
                ))
              )}
              {isSending && (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                  <Loader2 size={13} className="animate-spin" />
                  Thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 dark:border-slate-800 flex-shrink-0">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask about this case... (Enter to send)"
                  rows={2}
                  className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 resize-none outline-none focus:border-edamame/50 focus:ring-1 focus:ring-edamame/30 transition-all"
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim() || isSending}
                  className="self-end p-2.5 bg-edamame hover:bg-edamame-600 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
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
