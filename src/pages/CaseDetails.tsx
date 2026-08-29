import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Case, Client, Task, CaseStatus, DocumentChecklistItem, ChecklistItemStatus, FocusChatMessage, FocusConversation, CaseOpenTab, CaseTabKind, WorkflowTemplate } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { useAuth } from '../contexts/AuthContext';
import { CaseNotes } from '../components/CaseNotes';
import { DocumentUpload } from '../components/DocumentUpload';
import { DocumentList } from '../components/DocumentList';
import { PdfPackager } from '../components/PdfPackager';
import { BundleBuilder820 } from '../components/BundleBuilder820';
import { AutoPackager } from '../components/AutoPackager';
import { CaseRail, RailAlert, CASE_FILE_DRAG_MIME } from '../components/case-details/CaseRail';
import { CaseFilesDragList } from '../components/case-details/CaseFilesDragList';
import { AgentPanel } from '../components/case-details/AgentPanel';
import { Workspace, WorkspaceCatalogItem, MessageRecommendation } from '../components/case-details/Workspace';
import { DocumentChecklistGenerator, ADDITIONAL_DOCUMENTS_CATEGORY } from '../components/case-details/DocumentChecklistGenerator';
import { DocumentTypePicker, DocumentTypeBadge } from '../components/DocumentTypePicker';
import { useDocumentTypes } from '../contexts/DocumentTypeContext';
import { recalcAutoLinks, recalcAutoLinkForItem } from '../lib/autoLink';
import { generateChecklist, SUPPORTED_SUBCLASSES } from '../lib/checklistTemplates';
import { loadCaseTabsState, saveCaseTabsState, restoreTabsOnEntry } from '../lib/caseTabsStore';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Check,
  RotateCcw,
  X,
  Save,
  ChevronDown,
  ChevronRight,
  Sparkles,
  PenLine,
  ShieldCheck,
  MoreHorizontal,
  MoreVertical,
  ArrowLeft,
  FileText,
  Pin,
  PinOff,
  RefreshCw,
  Columns2,
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
// Helpers
// ---------------------------------------------------------------------------

const AGENT_CHIPS = ['Draft consultation checklist', 'Document request email', 'Summarise eligibility'];

const TAB_LABELS: Record<Exclude<CaseTabKind, 'workspace'>, string> = {
  tasks: 'Tasks',
  checklist: 'Document Checklist',
  notes: 'Notes',
  documents: 'Case Files',
  'checklist-generator': 'Document Checklist Generator',
  'auto-packager': 'Auto-Packager',
  'bundle-builder-820': '820 Bundle Builder',
};

const CHECKLIST_STATUS_META: Record<ChecklistItemStatus, { cls: string; label: string }> = {
  verified: { cls: 'bg-emerald-500/[0.13] text-emerald-700 dark:text-emerald-400', label: 'Verified' },
  linked: { cls: 'bg-blue-500/[0.13] text-blue-700 dark:text-blue-400', label: 'Linked' },
  waived: { cls: 'bg-slate-500/[0.13] text-slate-600 dark:text-slate-300', label: 'Waived' },
  pending: { cls: 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400', label: 'Pending' },
};

// Keyword heuristics used to (a) rank AI-recommended Workspace items, and
// (b) decide which items to surface as inline hyperlinks after a chat reply.
const RECOMMEND_KEYWORDS: Array<[CaseTabKind, RegExp]> = [
  ['checklist', /document|checklist|evidence|paperwork/i],
  ['tasks', /task|deadline|due date|schedule|overdue/i],
  ['notes', /note|summary|history|record/i],
  ['checklist-generator', /generate|missing document|category|categories/i],
  ['auto-packager', /crusher|compress|5\s*mb|packager|auto-?packager/i],
  ['bundle-builder-820', /820|bundle|submission/i],
];

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
  const { session } = useAuth();
  const { documentTypes, byCode: documentTypesByCode } = useDocumentTypes();

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

  // ---- Workspace tab state ----
  // 'workspace' is always available and isn't part of openTabs (it can't be closed/pinned).
  // Opening a View or Tool from the Workspace tab adds an entry to openTabs and focuses it.
  const [openTabs, setOpenTabs] = useState<CaseOpenTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('workspace');
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [workflowTemplate, setWorkflowTemplate] = useState<WorkflowTemplate | undefined>(undefined);
  const [showChecklistGenerator, setShowChecklistGenerator] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemForm, setAddItemForm] = useState<{ label: string; category: string; documentTypeCode?: string }>({
    label: '',
    category: ADDITIONAL_DOCUMENTS_CATEGORY,
  });
  /** §4.4 — renders the Case Files tab's content beside the checklist for drag-to-link. */
  const [caseFilesSplit, setCaseFilesSplit] = useState(false);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [recommendedViewKinds, setRecommendedViewKinds] = useState<CaseTabKind[]>(['checklist', 'tasks', 'notes']);
  const [recommendedToolKinds, setRecommendedToolKinds] = useState<CaseTabKind[]>(['checklist-generator', 'auto-packager', 'bundle-builder-820']);
  const [messageRecommendations, setMessageRecommendations] = useState<Record<string, MessageRecommendation[]>>({});

  // ---- Top-bar menu state ----
  const [statusOpen, setStatusOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // ---- Agent panel state (closed by default per design) ----
  const [agentOpen, setAgentOpen] = useState(false);

  // ---- Document checklist state ----
  const [checklist, setChecklist] = useState<DocumentChecklistItem[]>([]);

  // ---- Documents state ----
  const [documents, setDocuments] = useState<Document[]>([]);

  // ---- PdfPackager state ----
  const [showPackager, setShowPackager] = useState(false);

  // ---- 820 Submission Bundle Builder state ----
  const [showBundleBuilder, setShowBundleBuilder] = useState(false);

  // ---- Auto-Packager state ----
  const [showAutoPackager, setShowAutoPackager] = useState(false);
  /** CF-2: files handed off from an over-the-limit Case Files upload attempt, pre-loaded into Auto-Packager's local-PC source. */
  const [packagerInitialFiles, setPackagerInitialFiles] = useState<File[] | undefined>(undefined);

  // ---- Chat state ----
  const [conversations, setConversations] = useState<FocusConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filingIssueMessageId, setFilingIssueMessageId] = useState<string | null>(null);
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
  const uploadedCount = checklist.filter(c => c.status === 'linked' || c.status === 'verified').length;
  const overdueCount = pendingTasks.filter(t => new Date(t.date) < new Date()).length;
  const outstandingDocs = checklist.length > 0 ? checklist.length - uploadedCount : 0;

  const STATUS_META: Record<CaseStatus, { label: string; chip: string; dot: string }> = {
    open: { label: 'Open', chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    in_progress: { label: 'In Progress', chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    on_hold: { label: 'On Hold', chip: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
    closed: { label: 'Closed', chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  };

  // Rail alerts (overdue red, docs outstanding amber, passport expiry red)
  const railAlerts: RailAlert[] = [];
  if (overdueCount > 0) railAlerts.push({ color: 'red', text: `${overdueCount} overdue task${overdueCount !== 1 ? 's' : ''}` });
  if (outstandingDocs > 0) railAlerts.push({ color: 'amber', text: `${outstandingDocs} doc${outstandingDocs !== 1 ? 's' : ''} outstanding` });
  if (daysToPassportExpiry !== null && daysToPassportExpiry < 90) railAlerts.push({ color: 'red', text: `Passport expires in ${daysToPassportExpiry}d` });

  // ---- Effects ----

  // Keep currentCase in sync if caseItem prop changes
  React.useEffect(() => {
    setCurrentCase(caseItem);
  }, [caseItem]);

  // Load checklist for this case, generating defaults on first-ever view
  const [checklistLoaded, setChecklistLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setChecklistLoaded(false);
    repos.checklist.getByCaseId(caseItem.id).then(items => {
      if (cancelled) return;
      if (items.length === 0 && visaSubclass) {
        const generated = generateChecklist(caseItem.id, visaSubclass);
        setChecklist(generated);
        repos.checklist.setForCase(caseItem.id, generated);
      } else {
        setChecklist(items);
      }
      setChecklistLoaded(true);
    });
    return () => { cancelled = true; };
  }, [caseItem.id, visaSubclass, repos.checklist]);

  // Persist checklist changes
  useEffect(() => {
    if (!checklistLoaded) return;
    repos.checklist.setForCase(caseItem.id, checklist);
  }, [checklist, checklistLoaded, caseItem.id, repos.checklist]);

  // Load documents on mount
  useEffect(() => {
    repos.documents.getByCaseId(caseItem.id)
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, [caseItem.id, repos.documents, docRefreshKey]);

  // Load the case's workflow template (firm-level customisation merged into generated checklists)
  useEffect(() => {
    let cancelled = false;
    if (!caseItem.templateId) { setWorkflowTemplate(undefined); return; }
    repos.templates.getById(caseItem.templateId).then(t => {
      if (!cancelled) setWorkflowTemplate(t);
    }).catch(() => { if (!cancelled) setWorkflowTemplate(undefined); });
    return () => { cancelled = true; };
  }, [caseItem.templateId, repos.templates]);

  // Restore only pinned tabs + the last active tab on entry to this case; discard the rest.
  useEffect(() => {
    setTabsLoaded(false);
    const saved = loadCaseTabsState(caseItem.id);
    const restored = restoreTabsOnEntry(saved);
    setOpenTabs(restored.tabs);
    setActiveTabId(restored.activeTabId);
    setTabsLoaded(true);
  }, [caseItem.id]);

  // Persist tab state on every change (once initial restore has happened)
  useEffect(() => {
    if (!tabsLoaded) return;
    saveCaseTabsState(caseItem.id, { tabs: openTabs, activeTabId });
  }, [openTabs, activeTabId, tabsLoaded, caseItem.id]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  // ---- Checklist handlers ----
  const [checklistStatusMenuId, setChecklistStatusMenuId] = useState<string | null>(null);

  const updateChecklistStatus = (id: string, status: ChecklistItemStatus) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  // Link an existing Case Files document to a checklist item — dragged in from the CASE FILES rail.
  // Files are linked from the case's already-connected local/cloud folder, never uploaded through this tab.
  const handleChecklistLinkDocument = (item: DocumentChecklistItem, documentId: string) => {
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, linkedDocumentId: documentId, status: 'linked' } : c));
  };

  // Detach the linked file from a checklist item (the file itself is left in the case's document store)
  const handleChecklistUnlink = (item: DocumentChecklistItem) => {
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, linkedDocumentId: undefined, status: 'pending' } : c));
    setDocRefreshKey(k => k + 1);
  };

  const handleAddChecklistItem = () => {
    if (!addItemForm.label.trim()) return;
    const item: DocumentChecklistItem = {
      id: uuidv4(),
      caseId: currentCase.id,
      label: addItemForm.label.trim(),
      status: 'pending',
      category: addItemForm.category.trim() || ADDITIONAL_DOCUMENTS_CATEGORY,
      manuallyAdded: true,
      documentTypeCode: addItemForm.documentTypeCode,
    };
    // A brand-new item can already have a matching file waiting for it.
    setChecklist(prev => [...prev, recalcAutoLinkForItem(item, documents, documentTypesByCode)]);
    setAddItemForm({ label: '', category: addItemForm.category });
    setAddItemOpen(false);
  };

  /**
   * §4.2 — the Document Type on an item is editable at any time, and changing
   * it triggers an immediate auto-link recalculation for that item alone
   * (unlike the whole-tab pass below, which waits for an open or a refresh).
   */
  const handleChecklistTypeChange = (itemId: string, code: string) => {
    setChecklist(prev =>
      prev.map(item =>
        item.id === itemId
          ? recalcAutoLinkForItem({ ...item, documentTypeCode: code }, documents, documentTypesByCode)
          : item,
      ),
    );
  };

  /** §4.3.1 — the on-demand Refresh button at the top of the Document Checklist tab. */
  const runAutoLinkPass = useCallback(() => {
    setChecklist(prev => recalcAutoLinks(prev, documents, documentTypes));
  }, [documents, documentTypes]);

  // §4.3.1 — re-run the auto-link pass whenever the Document Checklist tab is
  // opened (and when the files or firm config it depends on change while it's
  // open). recalcAutoLinks returns the same array identity on a no-op, so this
  // does not loop through the "persist checklist changes" effect.
  useEffect(() => {
    if (activeTabId !== 'tab:checklist' || !checklistLoaded) return;
    runAutoLinkPass();
  }, [activeTabId, checklistLoaded, runAutoLinkPass]);

  const toggleCategoryCollapsed = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  };

  const handleGeneratedChecklist = (items: DocumentChecklistItem[]) => {
    // Merge into the existing checklist, skipping items whose label already exists (case-insensitive)
    setChecklist(prev => {
      const existingLabels = new Set(prev.map(i => i.label.trim().toLowerCase()));
      const toAdd = items.filter(i => !existingLabels.has(i.label.trim().toLowerCase()));
      return [...prev, ...toAdd];
    });
    setShowChecklistGenerator(false);
    openOrFocusTab('checklist', 'Document Checklist');
  };

  // ---- Workspace tab handlers ----
  const openOrFocusTab = (kind: CaseTabKind, label?: string) => {
    if (kind === 'workspace') { setActiveTabId('workspace'); return; }
    if (kind === 'checklist-generator') { setShowChecklistGenerator(true); return; }
    if (kind === 'auto-packager') { setShowPackager(true); return; }
    if (kind === 'bundle-builder-820') { setShowBundleBuilder(true); return; }

    const id = `tab:${kind}`;
    setOpenTabs(prev => {
      if (prev.some(t => t.id === id)) return prev;
      return [...prev, { id, kind, label: label || TAB_LABELS[kind], pinned: false }];
    });
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    setOpenTabs(prev => prev.filter(t => t.id !== id));
    setActiveTabId(current => (current === id ? 'workspace' : current));
  };

  const togglePinTab = (id: string) => {
    setOpenTabs(prev => prev.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t));
  };

  const handleChecklistPreview = async (doc: Document) => {
    const blob = await repos.documents.getFileData(doc);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  /** CF-4: "Remove file" from the Case Files rail's hover menu. */
  const handleRemoveDocument = async (doc: Document) => {
    await repos.documents.delete(doc.id);
    handleDocumentRemovedFromState(doc.id);
  };

  /** Keeps this page's own `documents` state (used by the rail + checklist linking) in sync after a delete performed elsewhere, e.g. the Case Files tab's DocumentList. */
  const handleDocumentRemovedFromState = (id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
    setDocRefreshKey(k => k + 1);
  };

  /** CF-2: user opted to compress an over-the-limit Case Files upload instead of re-browsing. */
  const handleRequestCompress = (files: File[]) => {
    setPackagerInitialFiles(files);
    setShowAutoPackager(true);
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

  // Load conversations for this case
  useEffect(() => {
    let cancelled = false;
    repos.chat.getByCaseId(caseItem.id).then(convs => {
      if (cancelled) return;
      setConversations(convs);
      setActiveConvId(convs[0]?.id ?? null);
    });
    return () => { cancelled = true; };
  }, [caseItem.id, repos.chat]);

  // ---- Chat handlers ----
  const persistConvs = (convs: FocusConversation[]) => {
    repos.chat.setForCase(caseItem.id, convs);
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

      // Per-session cap on agent-filed GitHub issues (see api/focus-chat.ts /
      // api/file-github-issue.ts) — counted from this conversation's own
      // history so it resets per Focus Mode chat thread.
      const issuesFiledInSession = historyMessages.filter(m => m.kind === 'issue-filed').length;

      const response = await fetch('/api/focus-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          messages: historyMessages.map(m => ({ role: m.role, content: m.content })),
          caseContext,
          issuesFiledInSession,
        }),
      });

      const data = await response.json();

      const assistantMsg: FocusChatMessage =
        data.kind === 'issue-draft' && data.draft
          ? {
              id: uuidv4(),
              role: 'assistant',
              content: "I think this is worth tracking — here's a drafted GitHub issue for your review.",
              createdAt: new Date().toISOString(),
              kind: 'issue-draft',
              issueDraft: { title: data.draft.title, body: data.draft.body },
            }
          : {
              id: uuidv4(),
              role: 'assistant',
              content: data.reply || 'Sorry, I could not generate a response.',
              createdAt: new Date().toISOString(),
              kind: 'text',
            };

      setConversations(prev => {
        const next = prev.map(c => {
          if (c.id !== convId) return c;
          return { ...c, messages: [...c.messages, assistantMsg] };
        });
        persistConvs(next);
        return next;
      });

      // Refresh Workspace View/Tools suggestions from the exchange, and record
      // which items to render as inline hyperlinks under this assistant message.
      const combinedText = `${userMsg.content}\n${data.reply || ''}`;
      const matchedKinds = RECOMMEND_KEYWORDS.filter(([, re]) => re.test(combinedText)).map(([kind]) => kind);
      if (matchedKinds.length > 0) {
        const matchedViews = matchedKinds.filter(k => k === 'tasks' || k === 'checklist' || k === 'notes');
        const matchedTools = matchedKinds.filter(k => k === 'checklist-generator' || k === 'auto-packager' || k === 'bundle-builder-820');
        if (matchedViews.length > 0) {
          setRecommendedViewKinds(prev => [...matchedViews, ...prev.filter(k => !matchedViews.includes(k))]);
        }
        if (matchedTools.length > 0) {
          setRecommendedToolKinds(prev => [...matchedTools, ...prev.filter(k => !matchedTools.includes(k))]);
        }
        setMessageRecommendations(prev => ({
          ...prev,
          [assistantMsg.id]: matchedKinds.map(kind => ({ kind, label: TAB_LABELS[kind as Exclude<CaseTabKind, 'workspace'>] })),
        }));
      }
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
  }, [chatInput, isSending, activeConvId, conversations, caseItem, client, applicant, visaSubclass, completedTasks, caseTasks, pendingTasks, checklist, progress, uploadedCount, session]);

  const handleSkillAction = (msg: string) => {
    setChatInput(msg);
    if (!agentOpen) setAgentOpen(true);
  };

  // ---- Agentic GitHub issue filing (GitHub issue #15) ----
  // Confirm/Cancel are the only two ways a drafted issue is resolved — the
  // draft itself is produced by /api/focus-chat's function-calling loop and
  // is never filed automatically. Only Confirm hits /api/file-github-issue,
  // the sole endpoint that performs the real POST /repos/.../issues call.
  const updateMessageInActiveConv = useCallback(
    (messageId: string, patch: Partial<FocusChatMessage>) => {
      setConversations(prev => {
        const next = prev.map(c => {
          if (c.id !== activeConvId) return c;
          return {
            ...c,
            messages: c.messages.map(m => (m.id === messageId ? { ...m, ...patch } : m)),
          };
        });
        persistConvs(next);
        return next;
      });
    },
    [activeConvId]
  );

  const handleCancelIssueDraft = useCallback(
    (messageId: string) => {
      updateMessageInActiveConv(messageId, { issueDraftResolved: 'cancelled' });
    },
    [updateMessageInActiveConv]
  );

  const handleConfirmIssueDraft = useCallback(
    async (messageId: string) => {
      const conv = conversations.find(c => c.id === activeConvId);
      const message = conv?.messages.find(m => m.id === messageId);
      if (!message?.issueDraft || filingIssueMessageId) return;

      const issuesFiledInSession = (conv?.messages || []).filter(m => m.kind === 'issue-filed').length;

      setFilingIssueMessageId(messageId);
      try {
        const response = await fetch('/api/file-github-issue', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            title: message.issueDraft.title,
            body: message.issueDraft.body,
            issuesFiledInSession,
          }),
        });
        const data = await response.json();

        if (!response.ok) {
          updateMessageInActiveConv(messageId, { issueDraftResolved: 'cancelled' });
          const errMsg: FocusChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: data.error || 'Failed to file the GitHub issue. Please try again or file it manually.',
            createdAt: new Date().toISOString(),
            kind: 'text',
          };
          setConversations(prev => {
            const next = prev.map(c => (c.id === activeConvId ? { ...c, messages: [...c.messages, errMsg] } : c));
            persistConvs(next);
            return next;
          });
          return;
        }

        updateMessageInActiveConv(messageId, { issueDraftResolved: 'filed' });
        const filedMsg: FocusChatMessage = {
          id: uuidv4(),
          role: 'assistant',
          content: `Done — filed [#${data.number}](${data.url}).`,
          createdAt: new Date().toISOString(),
          kind: 'issue-filed',
          issueUrl: data.url,
          issueNumber: data.number,
        };
        setConversations(prev => {
          const next = prev.map(c => (c.id === activeConvId ? { ...c, messages: [...c.messages, filedMsg] } : c));
          persistConvs(next);
          return next;
        });
      } catch {
        updateMessageInActiveConv(messageId, { issueDraftResolved: 'cancelled' });
      } finally {
        setFilingIssueMessageId(null);
      }
    },
    [conversations, activeConvId, filingIssueMessageId, updateMessageInActiveConv, session]
  );

  // ---- Top-bar action handlers ----
  const handleEligibility = () => {
    navigate(`/visa-advisor?clientId=${client.id}`);
  };

  const handleRunCrusher = () => {
    setMoreOpen(false);
    if (SUPPORTED_SUBCLASSES.includes(visaSubclass || '')) setShowPackager(true);
  };

  // ---- Task row completion toggle ----
  const toggleTaskComplete = (task: Task) => {
    onUpdateTask({ ...task, isCompleted: !task.isCompleted });
  };

  // ---- Task row renderer (shared by pending + completed lists) ----
  const rowMenuCls = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors';

  const renderTaskRow = (task: Task, isCompleted: boolean) => {
    const overdue = !isCompleted && new Date(task.date) < new Date();
    const editing = editingDate?.taskId === task.id;
    return (
      <div key={task.id} className="task-card group relative flex items-center gap-3 px-[18px] py-3 border-b border-gray-100 dark:border-slate-800 last:border-b-0">
        {/* Left edge — red when overdue */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${overdue ? 'bg-red-500' : 'bg-transparent'}`} />

        {/* Circular checkbox — direct toggle */}
        <button
          onClick={() => toggleTaskComplete(task)}
          title={isCompleted ? 'Mark as pending' : 'Mark as complete'}
          className={`check-btn w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            isCompleted
              ? 'bg-edamame border-[1.5px] border-edamame'
              : 'border-[1.5px] border-gray-300 dark:border-slate-600 hover:border-edamame'
          }`}
        >
          {isCompleted && <Check size={11} className="text-white" strokeWidth={3} />}
        </button>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-semibold tracking-tight leading-snug ${isCompleted ? 'line-through text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </div>
          {task.description && !isCompleted && (
            <div className="text-[11.5px] text-gray-400 dark:text-slate-500 mt-0.5 truncate">{task.description}</div>
          )}
        </div>

        {/* Due date — click to reschedule */}
        {editing ? (
          <input
            type="date"
            autoFocus
            value={editingDate!.date}
            onChange={(e) => handleDateChange(task.id, e.target.value)}
            onBlur={() => handleDateBlur(task.id)}
            className="text-[11.5px] font-semibold bg-transparent border border-gray-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 outline-none focus:border-edamame text-gray-700 dark:text-slate-300"
          />
        ) : (
          <button
            onClick={() => { if (!isCompleted) setEditingDate({ taskId: task.id, date: task.date }); }}
            disabled={isCompleted}
            className={`text-[11.5px] font-bold whitespace-nowrap flex-shrink-0 ${
              overdue ? 'text-red-600 dark:text-red-400' : isCompleted ? 'text-gray-300 dark:text-slate-600' : 'text-gray-500 dark:text-slate-400 hover:text-edamame'
            }`}
          >
            {format(new Date(task.date), 'MMM d')}
          </button>
        )}

        {/* Row actions menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 dark:text-slate-600 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical size={14} />
          </button>
          {activeDropdown === task.id && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setActiveDropdown(null)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 p-1 modal-content">
                {isCompleted ? (
                  <button onClick={() => { onUpdateTask({ ...task, isCompleted: false }); setActiveDropdown(null); }} className={rowMenuCls}>
                    <RotateCcw size={14} className="text-orange-400" />Revert to pending
                  </button>
                ) : (
                  <button onClick={() => { handleSetToday(task.id); setActiveDropdown(null); }} className={rowMenuCls}>
                    <Calendar size={14} className="text-edamame" />Set to today
                  </button>
                )}
                <button onClick={() => handleOpenTaskModal(task)} className={rowMenuCls}>
                  <Edit2 size={14} className="text-blue-400" />Edit
                </button>
                <button onClick={() => { onDeleteTask(task.id); setActiveDropdown(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={14} />Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ---- Render ----
  const status = STATUS_META[currentCase.status];

  const menuItemCls = 'w-full text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors';

  return (
    <div className="px-5 py-5 lg:px-7 lg:py-6 bg-gray-50 dark:bg-slate-950 min-h-full">

      {/* ══════════════════════════════════════════
          TOP BAR
      ══════════════════════════════════════════ */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft size={15} strokeWidth={1.8} className="group-hover:-translate-x-0.5 transition-transform" />
          Cases
        </button>
        <h1 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight min-w-0 truncate">
          {currentCase.title}
          <span className="text-gray-400 dark:text-slate-500 font-semibold"> — {client.name}</span>
        </h1>
        <span className="font-mono text-[10.5px] text-gray-400 dark:text-slate-500">#{currentCase.id.slice(0, 8).toUpperCase()}</span>
        {visaSubclass && (
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400">SC-{visaSubclass}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Status chip dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold pl-2.5 pr-2 py-1.5 rounded-lg transition-colors ${status.chip}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full badge-pulse ${status.dot}`} />
              {status.label}
              <ChevronDown size={12} />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-40 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 p-1 modal-content">
                  {(['open', 'in_progress', 'on_hold', 'closed'] as CaseStatus[]).map(s => (
                    <button
                      key={s}
                      onClick={() => { handleStatusChange(s); setStatusOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${currentCase.status === s ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-slate-400'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Draft + Eligibility action chips */}
          <div className="flex items-center gap-1.5 pr-2 border-r border-gray-200 dark:border-slate-700">
            <button
              onClick={() => handleSkillAction('Please help me draft a cover letter for this immigration case.')}
              title="Draft a document with the Agent"
              className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11.5px] font-semibold text-gray-600 dark:text-slate-300 hover:border-edamame hover:text-edamame transition-colors"
            >
              <PenLine size={13} strokeWidth={1.8} />
              <span className="hidden md:inline">Draft</span>
            </button>
            <button
              onClick={handleEligibility}
              title="Open the Visa Advisor pre-filled with this client"
              className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11.5px] font-semibold text-gray-600 dark:text-slate-300 hover:border-edamame hover:text-edamame transition-colors"
            >
              <ShieldCheck size={13} strokeWidth={1.8} />
              <span className="hidden md:inline">Eligibility</span>
            </button>
          </div>

          {/* Add Task */}
          <button
            onClick={() => handleOpenTaskModal()}
            className="btn-press inline-flex items-center gap-1.5 px-3 py-1.5 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-xs transition-colors"
          >
            <Plus size={13} strokeWidth={2.2} />
            Add Task
          </button>

          {/* Agent toggle */}
          <button
            onClick={() => setAgentOpen(o => !o)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
              agentOpen
                ? 'border-edamame bg-edamame/10 text-edamame-700 dark:text-edamame-400'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-slate-300 hover:border-edamame'
            }`}
          >
            <Sparkles size={13} strokeWidth={1.8} />
            <span className="hidden md:inline">Agent</span>
          </button>

          {/* ⋯ menu */}
          <div className="relative">
            <button
              onClick={() => setMoreOpen(o => !o)}
              title="More actions"
              className="w-8 h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:border-edamame hover:text-edamame transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 p-1 modal-content">
                  <button onClick={() => { openOrFocusTab('checklist'); setMoreOpen(false); }} className={menuItemCls}>Document checklist</button>
                  <button onClick={() => { openOrFocusTab('workspace'); setMoreOpen(false); }} className={menuItemCls}>Workspace</button>
                  <button onClick={() => { setShowAutoPackager(true); setMoreOpen(false); }} className={menuItemCls}>Auto-Packager</button>
                  {SUPPORTED_SUBCLASSES.includes(visaSubclass || '') && (
                    <button onClick={handleRunCrusher} className={menuItemCls}>Run Crusher</button>
                  )}
                  {visaSubclass === '820' && (
                    <button onClick={() => { setShowBundleBuilder(true); setMoreOpen(false); }} className={menuItemCls}>820 bundle builder</button>
                  )}
                  <button
                    onClick={() => { setCaseEditForm({ title: currentCase.title, description: currentCase.description }); setIsEditingCase(true); setMoreOpen(false); }}
                    className={menuItemCls}
                  >
                    Edit case
                  </button>
                  <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setMoreOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Delete case
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          3-COLUMN GRID
      ══════════════════════════════════════════ */}
      <div className={`mt-4 grid grid-cols-1 gap-3.5 items-start ${agentOpen ? 'xl:grid-cols-[220px_minmax(320px,1fr)_minmax(280px,330px)]' : 'xl:grid-cols-[220px_minmax(320px,1fr)]'}`}>

        {/* ── LEFT RAIL ── */}
        <CaseRail
          client={client}
          applicant={applicant}
          progress={progress}
          completedCount={completedTasks.length}
          pendingCount={pendingTasks.length}
          alerts={railAlerts}
          documents={documents}
          onOpenDocument={handleChecklistPreview}
          caseId={currentCase.id}
          visaSubclass={visaSubclass}
          onDocumentUploaded={(doc) => {
            setDocuments(prev => [...prev, doc]);
            setDocRefreshKey(k => k + 1);
          }}
          onRequestCompress={handleRequestCompress}
          onRemoveDocument={handleRemoveDocument}
          onOpenCaseFilesTab={() => openOrFocusTab('documents')}
        />

        {/* ── CENTER COLUMN ── */}
        <div className="min-w-0">
          {/* Tabs — Workspace is always present; opening a View/Tool adds a closable, pinnable tab */}
          <div className="flex items-center gap-0.5 border-b border-gray-100 dark:border-slate-800 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTabId('workspace')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTabId === 'workspace'
                  ? 'border-edamame text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
              }`}
            >
              <Sparkles size={13} className={activeTabId === 'workspace' ? 'text-edamame' : ''} />
              Workspace
            </button>

            {openTabs.map(tab => (
              <div
                key={tab.id}
                className={`group flex items-center gap-1.5 pl-4 pr-2 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors cursor-pointer ${
                  activeTabId === tab.id
                    ? 'border-edamame text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.label}
                {tab.kind === 'checklist' && checklist.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
                    {checklist.length}
                  </span>
                )}
                {tab.kind === 'tasks' && caseTasks.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
                    {caseTasks.length}
                  </span>
                )}
                {tab.kind === 'documents' && documents.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}>
                    {documents.length}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePinTab(tab.id); }}
                  title={tab.pinned ? 'Unpin tab' : 'Pin tab (persists across reloads)'}
                  className={`p-0.5 rounded transition-colors ${tab.pinned ? 'text-edamame' : 'text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-edamame'}`}
                >
                  {tab.pinned ? <Pin size={11} /> : <PinOff size={11} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Close tab"
                  className="p-0.5 rounded text-gray-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* ── WORKSPACE ── */}
          {activeTabId === 'workspace' && (
            <Workspace
              viewCatalog={[
                { kind: 'tasks', label: 'Tasks', description: `${pendingTasks.length} pending · ${completedTasks.length} completed` },
                { kind: 'checklist', label: 'Document Checklist', description: `${uploadedCount}/${checklist.length} documents linked` },
                { kind: 'documents', label: 'Case Files', description: `${documents.length} file${documents.length === 1 ? '' : 's'} uploaded` },
                { kind: 'notes', label: 'Notes', description: 'Case notes and history' },
              ] as WorkspaceCatalogItem[]}
              toolCatalog={[
                { kind: 'checklist-generator', label: 'Document Checklist Generator', description: 'Pick categories to generate a checklist from the system default + workflow template' },
                ...(SUPPORTED_SUBCLASSES.includes(visaSubclass || '') ? [{ kind: 'auto-packager', label: 'Auto-Packager', description: 'Compress & bundle documents under 5MB' }] as WorkspaceCatalogItem[] : []),
                ...(visaSubclass === '820' ? [{ kind: 'bundle-builder-820', label: '820 Bundle Builder', description: 'Build the ImmiAccount submission bundle' }] as WorkspaceCatalogItem[] : []),
              ]}
              recommendedViewKinds={recommendedViewKinds}
              recommendedToolKinds={recommendedToolKinds}
              onOpen={(kind) => openOrFocusTab(kind)}
              conversationMessages={activeConv?.messages || []}
              chatInput={chatInput}
              setChatInput={setChatInput}
              isSending={isSending}
              onSend={sendMessage}
              onNewChat={createConversation}
              messageRecommendations={messageRecommendations}
              chatEndRef={chatEndRef}
            />
          )}

          {/* ── TASKS ── */}
          {activeTabId === 'tab:tasks' && (
            <div className="mt-4 space-y-6">
              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">
                    Pending <span className="text-gray-400 dark:text-slate-500 font-semibold">· {pendingTasks.length} tasks</span>
                  </span>
                  {overdueCount > 0 && (
                    <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-md bg-red-500/[0.13] text-red-700 dark:text-red-400">
                      {overdueCount} overdue
                    </span>
                  )}
                </div>

                {pendingTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-800 p-10 text-center">
                    <CheckCircle2 size={26} className="mx-auto mb-2 text-gray-200 dark:text-slate-700" />
                    <p className="text-sm text-gray-400 dark:text-slate-500">All tasks completed</p>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                    {pendingTasks.map(task => renderTaskRow(task, false))}
                  </div>
                )}
              </section>

              {completedTasks.length > 0 && (
                <section>
                  <div className="text-[12.5px] font-bold text-gray-500 dark:text-slate-500 mb-2.5">
                    Completed <span className="text-gray-400 dark:text-slate-600 font-semibold">· {completedTasks.length} tasks</span>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                    {completedTasks.map(task => renderTaskRow(task, true))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── CASE FILES — full-tab view (formerly rail-only), better visibility/actions for a large document set ── */}
          {activeTabId === 'tab:documents' && (
            <div className="mt-4 space-y-4">
              <DocumentUpload
                caseId={currentCase.id}
                visaSubclass={visaSubclass}
                onUpload={(doc) => {
                  setDocuments(prev => [...prev, doc]);
                  setDocRefreshKey(k => k + 1);
                }}
                onRequestCompress={handleRequestCompress}
              />
              <DocumentList caseId={currentCase.id} refreshKey={docRefreshKey} visaSubclass={visaSubclass} onDeleted={handleDocumentRemovedFromState} />
            </div>
          )}

          {/* ── DOCUMENT CHECKLIST (renamed + upgraded from "Documents") ── */}
          {activeTabId === 'tab:checklist' && (() => {
            const groups = new Map<string, DocumentChecklistItem[]>();
            for (const item of checklist) {
              const cat = item.category || 'Uncategorised';
              if (!groups.has(cat)) groups.set(cat, []);
              groups.get(cat)!.push(item);
            }
            const checklistBody = (
              <div className="space-y-4">
                {checklist.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-800 p-10 text-center">
                    <FileText size={26} className="mx-auto mb-2 text-gray-200 dark:text-slate-700" />
                    <p className="text-sm text-gray-400 dark:text-slate-500">No checklist items yet. Generate one or add items manually.</p>
                  </div>
                ) : (
                  Array.from(groups.entries()).map(([category, items]) => {
                    const collapsed = collapsedCategories.has(category);
                    return (
                      <div key={category} className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
                        <button
                          onClick={() => toggleCategoryCollapsed(category)}
                          className="w-full flex items-center justify-between px-5 py-3 text-left"
                        >
                          <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">{category}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-gray-400 dark:text-slate-500">
                              {items.filter(i => i.status === 'linked' || i.status === 'verified').length}/{items.length}
                            </span>
                            {collapsed ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </div>
                        </button>
                        {!collapsed && items.map(item => {
                          const chip = CHECKLIST_STATUS_META[item.status];
                          const linkedDoc = item.linkedDocumentId ? documents.find(d => d.id === item.linkedDocumentId) : undefined;
                          const isDragOver = dragOverItemId === item.id;
                          return (
                            <div
                              key={item.id}
                              onDragOver={(e) => { if (e.dataTransfer.types.includes(CASE_FILE_DRAG_MIME)) { e.preventDefault(); setDragOverItemId(item.id); } }}
                              onDragLeave={() => setDragOverItemId(id => (id === item.id ? null : id))}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverItemId(null);
                                const docId = e.dataTransfer.getData(CASE_FILE_DRAG_MIME);
                                if (docId) handleChecklistLinkDocument(item, docId);
                              }}
                              className={`table-row-hover flex items-center gap-3 px-5 py-2.5 border-t border-gray-100 dark:border-slate-800 transition-colors ${
                                isDragOver ? 'bg-edamame/[0.06] dark:bg-edamame/[0.08]' : ''
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px] font-semibold text-gray-800 dark:text-slate-200 tracking-tight">{item.label}</span>
                                  <DocumentTypeBadge code={item.documentTypeCode} />
                                </div>
                                {item.description && <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{item.description}</div>}
                                {linkedDoc ? (
                                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                                    <FileText size={11} className="text-gray-400 dark:text-slate-600 flex-shrink-0" />
                                    <button
                                      onClick={() => handleChecklistPreview(linkedDoc)}
                                      title="Open file"
                                      className="truncate max-w-[240px] hover:text-edamame hover:underline text-left"
                                    >
                                      {linkedDoc.fileName}
                                    </button>
                                    <button
                                      onClick={() => handleChecklistUnlink(item)}
                                      title="Remove linked file"
                                      className="text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400"
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className={`mt-1 text-[10.5px] italic ${isDragOver ? 'text-edamame font-semibold' : 'text-gray-400 dark:text-slate-500'}`}>
                                    Drag a file from Case Files to link it here
                                  </div>
                                )}
                              </div>
                              {/* §4.2 — Document Type, editable at any time; changing it re-runs auto-link for this item immediately. */}
                              <DocumentTypePicker
                                value={item.documentTypeCode}
                                onChange={(code) => handleChecklistTypeChange(item.id, code)}
                                placeholder="Set type"
                                compact
                                className="w-44 flex-shrink-0 hidden md:block"
                              />
                              <div className="relative flex-shrink-0">
                                <button
                                  onClick={() => setChecklistStatusMenuId(id => id === item.id ? null : item.id)}
                                  className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${chip.cls}`}
                                >
                                  {chip.label}
                                  <ChevronDown size={11} />
                                </button>
                                {checklistStatusMenuId === item.id && (
                                  <>
                                    <div className="fixed inset-0 z-30" onClick={() => setChecklistStatusMenuId(null)} />
                                    <div className="absolute right-0 top-full mt-1.5 z-40 w-32 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-100 dark:border-slate-800 p-1 modal-content">
                                      {(['pending', 'linked', 'verified', 'waived'] as ChecklistItemStatus[]).map(s => (
                                        <button
                                          key={s}
                                          onClick={() => { updateChecklistStatus(item.id, s); setChecklistStatusMenuId(null); }}
                                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[11.5px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${item.status === s ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
                                        >
                                          {CHECKLIST_STATUS_META[s].label}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            );

            return (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[12.5px] font-bold text-gray-900 dark:text-white">
                    Document Checklist <span className="text-gray-400 dark:text-slate-500 font-semibold">· {uploadedCount}/{checklist.length} linked</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {/* §4.4 — show Case Files beside the checklist so a file can be dragged across without switching tabs. */}
                    <button
                      onClick={() => setCaseFilesSplit(v => !v)}
                      title="Show Case Files side by side"
                      className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        caseFilesSplit
                          ? 'border-edamame text-edamame bg-edamame/[0.06]'
                          : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-edamame hover:text-edamame'
                      }`}
                    >
                      <Columns2 size={12} /> Case Files
                    </button>
                    {/* §4.3.1 — re-run auto-link on demand, without leaving and re-entering the tab. */}
                    <button
                      onClick={runAutoLinkPass}
                      title="Re-run auto-link against the current Case Files and document type settings"
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-edamame hover:text-edamame transition-colors"
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                    <button
                      onClick={() => setShowChecklistGenerator(true)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:border-edamame hover:text-edamame transition-colors"
                    >
                      <Sparkles size={12} /> Generate
                    </button>
                    <button
                      onClick={() => setAddItemOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white transition-colors"
                    >
                      <Plus size={12} /> Add item
                    </button>
                  </div>
                </div>

                {caseFilesSplit ? (
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
                    <div className="min-w-0">{checklistBody}</div>
                    <aside className="min-w-0 space-y-3 xl:sticky xl:top-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-gray-900 dark:text-white">
                          Case Files <span className="text-gray-400 dark:text-slate-500 font-semibold">· {documents.length}</span>
                        </span>
                        <button
                          onClick={() => openOrFocusTab('documents')}
                          className="text-[11px] font-semibold text-edamame hover:underline"
                        >
                          Open tab
                        </button>
                      </div>
                      <DocumentUpload
                        caseId={currentCase.id}
                        visaSubclass={visaSubclass}
                        compact
                        onUpload={(doc) => {
                          setDocuments(prev => [...prev, doc]);
                          setDocRefreshKey(k => k + 1);
                        }}
                        onRequestCompress={handleRequestCompress}
                      />
                      <CaseFilesDragList documents={documents} onOpenDocument={handleChecklistPreview} />
                    </aside>
                  </div>
                ) : (
                  checklistBody
                )}
              </div>
            );
          })()}

          {/* ── NOTES ── */}
          {activeTabId === 'tab:notes' && (
            <div className="mt-4">
              <CaseNotes caseId={currentCase.id} />
            </div>
          )}
        </div>

        {/* ── AGENT PANEL ── */}
        {agentOpen && (
          <AgentPanel
            conversations={conversations}
            activeConv={activeConv}
            activeConvId={activeConvId}
            onSelectConversation={setActiveConvId}
            onNewChat={createConversation}
            chatInput={chatInput}
            setChatInput={setChatInput}
            isSending={isSending}
            onSend={sendMessage}
            onSuggested={handleSkillAction}
            suggestedChips={AGENT_CHIPS}
            chatEndRef={chatEndRef}
            filingIssueMessageId={filingIssueMessageId}
            onConfirmIssueDraft={handleConfirmIssueDraft}
            onCancelIssueDraft={handleCancelIssueDraft}
          />
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

      {/* 820 Submission Bundle Builder slide-over */}
      {showBundleBuilder && (
        <BundleBuilder820
          caseId={caseItem.id}
          documents={documents}
          applicant={applicant ?? client}
          onClose={() => {
            setShowBundleBuilder(false);
            setDocRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Document Checklist Generator tool */}
      {showChecklistGenerator && (
        <DocumentChecklistGenerator
          caseId={currentCase.id}
          visaSubclass={visaSubclass}
          workflowTemplate={workflowTemplate}
          onClose={() => setShowChecklistGenerator(false)}
          onGenerate={handleGeneratedChecklist}
        />
      )}

      {/* Manually add a Document Checklist item */}
      {addItemOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Checklist Item</h3>
              <button onClick={() => setAddItemOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Document Name</label>
                <input
                  autoFocus
                  type="text"
                  value={addItemForm.label}
                  onChange={(e) => setAddItemForm({ ...addItemForm, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem(); }}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white"
                  placeholder="e.g., Additional reference letter"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Category</label>
                <input
                  type="text"
                  value={addItemForm.category}
                  onChange={(e) => setAddItemForm({ ...addItemForm, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Document Type</label>
                <DocumentTypePicker
                  value={addItemForm.documentTypeCode}
                  onChange={(code) => setAddItemForm({ ...addItemForm, documentTypeCode: code })}
                  placeholder="Optional — enables auto-link"
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setAddItemOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddChecklistItem}
                disabled={!addItemForm.label.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Packager slide-over */}
      {showAutoPackager && (
        <AutoPackager
          caseId={caseItem.id}
          documents={documents}
          visaSubclass={visaSubclass}
          applicant={applicant ?? client}
          initialLocalFiles={packagerInitialFiles}
          onClose={() => { setShowAutoPackager(false); setPackagerInitialFiles(undefined); }}
          onSaved={() => setDocRefreshKey(k => k + 1)}
        />
      )}

    </div>
  );
};
