import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Zap, X, Search, ArrowRight, Loader2, Send, Plus, Trash2, FolderOpen,
  FileText, CheckCircle2, Circle, ChevronDown, ChevronUp, Clock,
  MessageSquare, Package, Sparkles, Brain, LayoutGrid, AlertCircle,
  ClipboardList, User, Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { Case, Client, Task, WorkflowTemplate, FocusChatMessage, FocusConversation, DocumentChecklistItem, ChecklistItemStatus, FileTreeNode } from '../types';
import { PdfPackager } from '../components/PdfPackager';
import { useRepositories } from '../contexts/RepositoryContext';
import { generateChecklist, SUPPORTED_SUBCLASSES } from '../lib/checklistTemplates';
import type { Document } from '../types';

interface FocusProps {
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  templates: WorkflowTemplate[];
}

// ---------------------------------------------------------------------------
// Case Selection Screen
// ---------------------------------------------------------------------------

const CaseSelectionScreen: React.FC<{
  cases: Case[];
  clients: Client[];
  tasks: Task[];
  onSelect: (c: Case) => void;
}> = ({ cases, clients, tasks, onSelect }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showOverlay, setShowOverlay] = useState<string | null>(null);

  const filtered = cases.filter(c => {
    const client = clients.find(cl => cl.id === c.clientId);
    const q = search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      client?.name.toLowerCase().includes(q) ||
      c.status.includes(q)
    );
  });

  const handleMouseEnter = (id: string) => {
    setHovered(id);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setShowOverlay(id), 500);
  };

  const handleMouseLeave = () => {
    setHovered(null);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowOverlay(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-edamame flex items-center justify-center">
                <Zap size={16} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Focus Mode</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Select a case to enter your distraction-free workspace.
            </p>
          </div>
          <button
            onClick={() => navigate('/cases')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-3 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-edamame/50 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
          />
        </div>

        {/* Case grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const client = clients.find(cl => cl.id === c.clientId);
            const caseTasks = tasks.filter(t => t.caseId === c.id);
            const completed = caseTasks.filter(t => t.isCompleted).length;
            const total = caseTasks.length;
            const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
            const isActive = showOverlay === c.id;

            return (
              <div
                key={c.id}
                className="relative group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden cursor-pointer hover:border-edamame/50 hover:shadow-lg transition-all duration-200"
                onMouseEnter={() => handleMouseEnter(c.id)}
                onMouseLeave={handleMouseLeave}
                onClick={() => isActive && onSelect(c)}
              >
                <div className="h-1 w-full bg-edamame" />
                <div className="p-4">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm mb-1 leading-snug line-clamp-2">{c.title}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{client?.name}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500">
                    <span>{completed}/{total} tasks</span>
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      c.status === 'closed' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                      c.status === 'in_progress' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                      c.status === 'on_hold' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    }`}>{c.status.replace('_', ' ')}</span>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2.5 w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full">
                    <div className="h-1 bg-edamame rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Hover overlay — appears after 500ms */}
                {isActive && (
                  <div
                    className="absolute inset-0 bg-edamame/90 flex items-center justify-center gap-2 text-white font-bold text-sm"
                    onClick={() => onSelect(c)}
                  >
                    <Zap size={16} />
                    Start Focusing
                    <ArrowRight size={16} />
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400 dark:text-slate-600">
              <LayoutGrid size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No cases found.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const CHAT_STORAGE_PREFIX = 'edamame_focus_chat_';

interface WorkspaceProps {
  caseItem: Case;
  client: Client;
  applicant?: Client;
  tasks: Task[];
  template?: WorkflowTemplate;
  documents: Document[];
  checklist: DocumentChecklistItem[];
  onChecklistUpdate: (id: string, status: ChecklistItemStatus) => void;
  onExit: () => void;
}

const Workspace: React.FC<WorkspaceProps> = ({
  caseItem,
  client,
  applicant,
  tasks,
  template,
  documents,
  checklist,
  onChecklistUpdate,
  onExit,
}) => {
  const repos = useRepositories();
  const caseTasks = tasks.filter(t => t.caseId === caseItem.id);
  const completedTasks = caseTasks.filter(t => t.isCompleted);
  const pendingTasks = caseTasks.filter(t => !t.isCompleted);
  const activeTasks = pendingTasks.slice(0, 3);
  const progress = caseTasks.length > 0 ? Math.round((completedTasks.length / caseTasks.length) * 100) : 0;

  // ---- Chat state ----
  const [conversations, setConversations] = useState<FocusConversation[]>(() => {
    try {
      const raw = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${caseItem.id}`);
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

  const persistConvs = (convs: FocusConversation[]) => {
    localStorage.setItem(`${CHAT_STORAGE_PREFIX}${caseItem.id}`, JSON.stringify(convs));
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
      // Build case context for system prompt
      const caseContext = [
        `Case: ${caseItem.title}`,
        `Client: ${client.name}`,
        applicant && applicant.id !== client.id ? `Applicant: ${applicant.name}` : null,
        template ? `Visa Type: Subclass ${template.visaSubclass} — ${template.title}` : null,
        `Status: ${caseItem.status}`,
        `Progress: ${completedTasks.length}/${caseTasks.length} tasks completed (${progress}%)`,
        pendingTasks.length > 0 ? `Next task: ${pendingTasks[0]?.title}` : null,
        checklist.length > 0 ? `Documents: ${checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length}/${checklist.length} collected` : null,
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
  }, [chatInput, isSending, activeConvId, conversations, caseItem, client, applicant, template, completedTasks, caseTasks, pendingTasks, checklist, progress]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  // ---- File explorer state ----
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirTree, setDirTree] = useState<FileTreeNode[] | null>(null);
  const DIR_KEY = `edamame_focus_workspace_${caseItem.id}`;

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

  // ---- PdfPackager state ----
  const [showPackager, setShowPackager] = useState(false);

  // ---- Checklist panel ----
  const [checklistOpen, setChecklistOpen] = useState(false);
  const uploadedCount = checklist.filter(c => c.status === 'uploaded' || c.status === 'verified').length;

  // AI Insights
  const hasOverdue = pendingTasks.some(t => new Date(t.date) < new Date());
  const passportExpiry = client.passportExpiry ? new Date(client.passportExpiry) : null;
  const daysToPassportExpiry = passportExpiry ? Math.floor((passportExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-edamame flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="text-xs font-bold text-white uppercase tracking-widest">Focus Mode</span>
          <span className="text-gray-600 text-xs">•</span>
          <span className="text-sm text-gray-300 font-medium truncate max-w-xs">{caseItem.title}</span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X size={13} />
          Exit Focus
        </button>
      </div>

      {/* 3-panel workspace */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT PANEL (320px) ── */}
        <div className="w-80 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-4 space-y-5">

            {/* Case title & parties */}
            <div>
              <div className="text-[10px] font-bold text-edamame-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <Zap size={10} />
                Active Case
              </div>
              <div className="text-sm font-bold text-white leading-snug">{caseItem.title}</div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <User size={11} className="text-gray-500 flex-shrink-0" />
                  <span className="text-gray-500">Client:</span>
                  <span className="text-gray-300">{client.name}</span>
                </div>
                {applicant && applicant.id !== client.id && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={11} className="text-edamame-500 flex-shrink-0" />
                    <span className="text-gray-500">Applicant:</span>
                    <span className="text-edamame-400">{applicant.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500 font-semibold uppercase tracking-wider">Progress</span>
                <span className="text-edamame-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full">
                <div className="h-2 bg-edamame rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            {/* Task status */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Task Status</div>
              <div className="space-y-1.5">
                {completedTasks.slice(-3).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                    <span className="line-through truncate">{t.title}</span>
                  </div>
                ))}
                {pendingTasks.slice(0, 1).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-edamame-400 font-semibold">
                    <span className="w-3 h-3 rounded-full border-2 border-edamame-400 flex-shrink-0" />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto text-[10px] text-edamame-500 bg-edamame/10 px-1.5 py-0.5 rounded-full">Active</span>
                  </div>
                ))}
                {pendingTasks.slice(1, 4).map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-gray-500">
                    <Circle size={13} className="flex-shrink-0 text-gray-700" />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}
                {pendingTasks.length > 4 && (
                  <div className="text-xs text-gray-600 pl-5">+{pendingTasks.length - 4} more pending</div>
                )}
              </div>
            </div>

            {/* Document checklist progress */}
            {checklist.length > 0 && (
              <div>
                <button
                  onClick={() => setChecklistOpen(v => !v)}
                  className="w-full flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 hover:text-gray-300 transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <ClipboardList size={11} />
                    Documents {uploadedCount}/{checklist.length}
                  </span>
                  {checklistOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {/* Mini progress */}
                <div className="w-full h-1 bg-gray-800 rounded-full mb-2">
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
                          onClick={() => onChecklistUpdate(item.id, item.status === 'uploaded' ? 'pending' : 'uploaded')}
                          className="flex-shrink-0"
                        >
                          {item.status === 'uploaded' || item.status === 'verified'
                            ? <CheckCircle2 size={13} className="text-green-500" />
                            : <Circle size={13} className="text-gray-700" />
                          }
                        </button>
                        <span className={`truncate ${item.status === 'uploaded' || item.status === 'verified' ? 'text-gray-600 line-through' : 'text-gray-400'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Workspace file explorer */}
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                <FolderOpen size={11} />
                Workspace
              </div>
              {dirTree ? (
                <FileTreeView nodes={dirTree} />
              ) : (
                <button
                  onClick={pickDirectory}
                  className="w-full text-xs text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 rounded-lg px-3 py-2 transition-colors hover:border-gray-500"
                >
                  {('showDirectoryPicker' in window)
                    ? '+ Link local folder'
                    : 'File picker not supported in this browser'
                  }
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL ── */}
        <div className="flex-1 min-w-0 bg-gray-950 overflow-y-auto custom-scrollbar p-6 space-y-5">

          {/* Recommended Actions */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Sparkles size={12} className="text-edamame-400" />
              Skill Actions
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <ActionCard
                icon={<FileText size={16} />}
                label="Draft Document"
                sublabel="AI-assisted drafting"
                color="blue"
                onClick={() => {
                  const msg = 'Please help me draft a cover letter for this immigration case.';
                  setChatInput(msg);
                }}
              />
              <ActionCard
                icon={<Brain size={16} />}
                label="Check Eligibility"
                sublabel="Analyse current position"
                color="violet"
                onClick={() => {
                  const msg = 'Please analyse the current eligibility position for this case and flag any risks.';
                  setChatInput(msg);
                }}
              />
              <ActionCard
                icon={<ClipboardList size={16} />}
                label="Verify Documents"
                sublabel="Document checklist review"
                color="amber"
                onClick={() => {
                  const msg = `Which documents are still outstanding for this ${template?.visaSubclass ? `Subclass ${template.visaSubclass}` : 'visa'} case?`;
                  setChatInput(msg);
                }}
              />
              <ActionCard
                icon={<Package size={16} />}
                label="5MB Crusher"
                sublabel="Bundle PDFs for ImmiAccount"
                color={SUPPORTED_SUBCLASSES.includes(template?.visaSubclass || '') ? 'green' : 'gray'}
                badge={SUPPORTED_SUBCLASSES.includes(template?.visaSubclass || '') ? 'Ready' : undefined}
                disabled={!SUPPORTED_SUBCLASSES.includes(template?.visaSubclass || '')}
                tooltip={!SUPPORTED_SUBCLASSES.includes(template?.visaSubclass || '') ? 'Not required for this visa type' : undefined}
                onClick={() => setShowPackager(true)}
              />
            </div>
          </div>

          {/* AI Insights */}
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Brain size={12} className="text-edamame-400" />
              Case Insights
            </h2>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-2.5">
              {daysToPassportExpiry !== null && (
                <InsightRow
                  icon={<AlertCircle size={13} />}
                  color={daysToPassportExpiry < 90 ? 'red' : 'gray'}
                  text={`Passport expires in ${daysToPassportExpiry} days (${format(passportExpiry!, 'dd MMM yyyy')})`}
                />
              )}
              {hasOverdue && (
                <InsightRow
                  icon={<Clock size={13} />}
                  color="amber"
                  text={`${pendingTasks.filter(t => new Date(t.date) < new Date()).length} overdue task(s) require attention`}
                />
              )}
              {checklist.length > 0 && uploadedCount < checklist.length && (
                <InsightRow
                  icon={<ClipboardList size={13} />}
                  color="blue"
                  text={`${checklist.length - uploadedCount} document(s) outstanding`}
                />
              )}
              {activeTasks.map(t => (
                <InsightRow
                  key={t.id}
                  icon={<Circle size={13} />}
                  color="gray"
                  text={`Next: ${t.title} — due ${format(new Date(t.date), 'MMM d')}`}
                />
              ))}
              {!hasOverdue && checklist.length === 0 && activeTasks.length === 0 && (
                <InsightRow icon={<CheckCircle2 size={13} />} color="green" text="All tasks and documents on track" />
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL (384px) ── */}
        <div className="w-96 flex-shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-edamame-400" />
              <span className="text-sm font-bold text-white">Edamame Agent</span>
            </div>
            <button
              onClick={createConversation}
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
            >
              <Plus size={12} />
              New chat
            </button>
          </div>

          {/* Conversation list (if multiple) */}
          {conversations.length > 1 && (
            <div className="flex gap-1.5 px-3 py-2 border-b border-gray-800 overflow-x-auto">
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors truncate max-w-[100px] ${
                    activeConvId === conv.id
                      ? 'bg-edamame/20 text-edamame-400'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
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
                <MessageSquare size={28} className="mx-auto mb-2 text-gray-700" />
                <p className="text-xs text-gray-600">Ask anything about this case.</p>
                <p className="text-[10px] text-gray-700 mt-1">I know your case context.</p>
              </div>
            ) : (
              activeConv.messages.map(msg => (
                <ChatBubble key={msg.id} message={msg} />
              ))
            )}
            {isSending && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 size={13} className="animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-800 flex-shrink-0">
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
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none outline-none focus:border-edamame/50 focus:ring-1 focus:ring-edamame/30 transition-all"
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
        </div>
      </div>

      {/* PdfPackager slide-over */}
      {showPackager && (
        <PdfPackager
          caseId={caseItem.id}
          documents={documents}
          visaSubclass={template?.visaSubclass || ''}
          onClose={() => setShowPackager(false)}
        />
      )}
    </div>
  );
};

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
    blue: 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20',
    violet: 'bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20',
    amber: 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20',
    green: 'bg-green-500/10 text-green-400 group-hover:bg-green-500/20',
    gray: 'bg-gray-800 text-gray-600',
  };

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      title={tooltip}
      className={`group relative flex flex-col items-start p-4 rounded-xl border transition-all duration-150 text-left ${
        disabled
          ? 'border-gray-800 opacity-40 cursor-not-allowed'
          : 'border-gray-800 hover:border-gray-700 bg-gray-900 hover:bg-gray-800 cursor-pointer'
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 transition-colors ${colorMap[color] || colorMap.gray}`}>
        {icon}
      </div>
      <div className="text-sm font-semibold text-gray-200">{label}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sublabel}</div>
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">
          {badge}
        </span>
      )}
    </button>
  );
};

const InsightRow: React.FC<{ icon: React.ReactNode; color: string; text: string }> = ({ icon, color, text }) => {
  const colorMap: Record<string, string> = {
    red: 'text-red-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    gray: 'text-gray-500',
  };
  return (
    <div className={`flex items-start gap-2 text-xs ${colorMap[color] || colorMap.gray}`}>
      <span className="flex-shrink-0 mt-px">{icon}</span>
      <span>{text}</span>
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
          : 'bg-gray-800 text-gray-200 rounded-bl-sm'
      }`}>
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p className={`text-[10px] mt-1 ${isUser ? 'text-white/50' : 'text-gray-600'}`}>
          {format(new Date(message.createdAt), 'HH:mm')}
        </p>
      </div>
    </div>
  );
};

const FileTreeView: React.FC<{ nodes: FileTreeNode[]; depth?: number }> = ({ nodes, depth = 0 }) => {
  return (
    <div className={depth > 0 ? 'pl-3 border-l border-gray-800 ml-1.5' : ''}>
      {nodes.map((node, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 py-0.5 text-xs text-gray-400 hover:text-gray-300">
            {node.kind === 'directory' ? (
              <FolderOpen size={11} className="text-amber-500 flex-shrink-0" />
            ) : (
              <FileText size={11} className="text-gray-600 flex-shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.size && <span className="ml-auto text-gray-600 text-[10px] flex-shrink-0">{Math.round(node.size / 1024)}KB</span>}
          </div>
          {node.children && node.children.length > 0 && (
            <FileTreeView nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
};

// Build file tree from FileSystemDirectoryHandle
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
// Main Focus page
// ---------------------------------------------------------------------------

export const Focus: React.FC<FocusProps> = ({ cases, clients, tasks, templates }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const repos = useRepositories();

  // Pre-select case from URL ?caseId param
  const preselectedId = searchParams.get('caseId');
  const preselected = preselectedId ? cases.find(c => c.id === preselectedId) : undefined;

  const [selectedCase, setSelectedCase] = useState<Case | null>(preselected ?? null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [checklist, setChecklist] = useState<DocumentChecklistItem[]>([]);

  // Load documents and checklist when case is selected
  useEffect(() => {
    if (!selectedCase) return;

    // Load docs
    repos.documents.getByCaseId(selectedCase.id)
      .then(setDocuments)
      .catch(() => setDocuments([]));

    // Load checklist from localStorage
    const CHECKLIST_KEY = `edamame_checklist_${selectedCase.id}`;
    const template = templates.find(t => t.id === selectedCase.templateId);
    try {
      const raw = localStorage.getItem(CHECKLIST_KEY);
      if (raw) {
        setChecklist(JSON.parse(raw));
      } else if (template?.visaSubclass) {
        const generated = generateChecklist(selectedCase.id, template.visaSubclass);
        setChecklist(generated);
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify(generated));
      }
    } catch {
      setChecklist([]);
    }
  }, [selectedCase, repos.documents, templates]);

  const handleChecklistUpdate = (id: string, status: ChecklistItemStatus) => {
    setChecklist(prev => {
      const next = prev.map(item => item.id === id ? { ...item, status } : item);
      if (selectedCase) {
        localStorage.setItem(`edamame_checklist_${selectedCase.id}`, JSON.stringify(next));
      }
      return next;
    });
  };

  if (!selectedCase) {
    return (
      <CaseSelectionScreen
        cases={cases}
        clients={clients}
        tasks={tasks}
        onSelect={setSelectedCase}
      />
    );
  }

  const client = clients.find(c => c.id === selectedCase.clientId)!;
  const applicant = selectedCase.applicantId ? clients.find(c => c.id === selectedCase.applicantId) : undefined;
  const template = templates.find(t => t.id === selectedCase.templateId);

  return (
    <Workspace
      caseItem={selectedCase}
      client={client || { id: '', name: 'Unknown', email: '', phone: '', dob: '', nationality: '' }}
      applicant={applicant}
      tasks={tasks}
      template={template}
      documents={documents}
      checklist={checklist}
      onChecklistUpdate={handleChecklistUpdate}
      onExit={() => navigate('/cases')}
    />
  );
};
