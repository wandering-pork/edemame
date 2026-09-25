import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Case, Client, Task, CaseStage, CaseOutcome, DocumentChecklistItem, ChecklistItemStatus, FocusChatMessage, FocusConversation, CaseOpenTab, CaseTabKind, WorkflowTemplate, Deadline, DeadlineKind } from '../types';
import { useRepositories } from '../contexts/RepositoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useFirm } from '../contexts/FirmContext';
import { canDeleteFirmData } from '../lib/firmDirectory';
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
import { EligibilityAssessmentModal } from '../components/visa-advisor/EligibilityAssessmentModal';
import { useDocumentTypes } from '../contexts/DocumentTypeContext';
import { recalcAutoLinks, recalcAutoLinkForItem } from '../lib/autoLink';
import { generateChecklist, SUPPORTED_SUBCLASSES } from '../lib/checklistTemplates';
import { loadCaseTabsState, saveCaseTabsState, restoreTabsOnEntry } from '../lib/caseTabsStore';
import { displayCaseNumber } from '../lib/caseNumber';
import { isTaskClosed, isWaiting, withStatus, TASK_STATUS_LABELS, TASK_STATUS_ORDER } from '../lib/taskStatus';
import { CASE_STAGE_LABELS, CASE_STAGE_ORDER, evaluateTransition, outcomeRequired } from '../lib/caseStage';
import { allDeadlines, daysLeft, urgency } from '../lib/deadlines';
import { toLocalISODate, addDaysISO } from '../lib/dates';
import { buildTemplateTaskDrafts, knownAnchorsFromDeadlines, templateHasTiming } from '../lib/tasksFromTemplate';
import { suggestAdditions, TaskSuggestion } from '../services/geminiService';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Check,
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
import { toast } from 'sonner';
import type { Document, EligibilityAssessment } from '../types';

interface CaseDetailsProps {
  caseItem: Case;
  client: Client;
  applicant?: Client;
  visaSubclass?: string;
  tasks: Task[];
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTask: (task: Task) => void;
  /** Bulk add — used by "Generate plan from template" (Step 1 · 1E). */
  onAddTasks: (tasks: Task[]) => void;
  onMoveTaskDate: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => void;
  /** Every deadline currently loaded — filtered to this case (+ the client's passport-expiry deadline) below. */
  deadlines: Deadline[];
  onAddDeadline: (deadline: Deadline) => void;
  onUpdateDeadline: (deadline: Deadline) => void;
  onUpdateCase: (caseItem: Case) => void;
  onBack: () => void;
}

const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  visa_expiry: 'Visa expiry',
  passport_expiry: 'Passport expiry',
  s56_response: 's56 response',
  s57_response: 's57 response',
  nomination_validity: 'Nomination validity',
  invitation_window: 'Invitation window',
  other: 'Other',
};

const DEADLINE_KIND_ORDER: DeadlineKind[] = [
  's56_response', 's57_response', 'invitation_window', 'nomination_validity', 'visa_expiry', 'passport_expiry', 'other',
];

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
  waived: { cls: 'bg-slate-500/[0.13] text-ink-soft dark:text-plate-ink-soft', label: 'Waived' },
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
  onAddTasks,
  onMoveTaskDate,
  deadlines,
  onAddDeadline,
  onUpdateDeadline,
  onUpdateCase,
  onBack
}) => {
  const repos = useRepositories();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { documentTypes, byCode: documentTypesByCode } = useDocumentTypes();
  // RLS is the real enforcement (firms migration's "firm rows delete" policy
  // on `cases` is owner/agent only) — this only hides the control for a role
  // that would be rejected server-side anyway. `role` is null in local mode,
  // where deletes stay allowed (single user, always their own data).
  const { role: firmRole } = useFirm();
  const canDeleteCase = canDeleteFirmData(firmRole);

  // ---- Task state ----
  const [offsetModal, setOffsetModal] = useState<{ taskId: string, newDate: string } | null>(null);
  const [editingDate, setEditingDate] = useState<{ taskId: string, date: string } | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', date: format(new Date(), 'yyyy-MM-dd') });
  // When a task row's status menu picks "Not applicable", a reason must be
  // entered and confirmed inline before the status change is applied.
  const [naReasonDraft, setNaReasonDraft] = useState<{ taskId: string; reason: string } | null>(null);

  // ---- Generate-from-template / AI suggestions state (Step 1 · 1E) ----
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // ---- Deadline panel state ----
  const [showAddDeadline, setShowAddDeadline] = useState(false);
  const [deadlineForm, setDeadlineForm] = useState<{ kind: DeadlineKind; title: string; dueDate: string; notes: string }>({
    kind: 'other',
    title: '',
    dueDate: toLocalISODate(),
    notes: '',
  });
  // s56/s57 quick-add: the agent enters the received date, the due date defaults to
  // received + 28 days (editable — response periods vary by request) and must be confirmed.
  const [quickAddKind, setQuickAddKind] = useState<'s56_response' | 's57_response' | null>(null);
  const [quickAddForm, setQuickAddForm] = useState<{ receivedDate: string; dueDate: string }>({
    receivedDate: toLocalISODate(),
    dueDate: addDaysISO(toLocalISODate(), 28),
  });

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

  // ---- Stage control state ----
  // A backward move (e.g. lodged -> preparing) needs an inline confirm before
  // it's applied; moving to `closed` needs an outcome picked first. Both are
  // staged here rather than applied immediately from the stage menu.
  const [backwardConfirmStage, setBackwardConfirmStage] = useState<CaseStage | null>(null);
  const [outcomePickerOpen, setOutcomePickerOpen] = useState(false);
  const [outcomeDraft, setOutcomeDraft] = useState<CaseOutcome | ''>('');

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

  // ---- Eligibility assessment state ----
  const [eligibilityAssessment, setEligibilityAssessment] = useState<EligibilityAssessment | null>(null);
  const [showEligibilityAssessment, setShowEligibilityAssessment] = useState(false);

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

  // Case-linked stored deadlines, plus the client's passport-expiry deadline
  // (stored if the agent has one on record, derived/virtual otherwise) — see
  // lib/deadlines.ts's allDeadlines(). Client-level deadlines of any other
  // kind aren't included here; passport expiry is the only kind derived in
  // this slice (visa expiry becomes derived once Step 2 records grants).
  const caseDeadlines = useMemo(() => {
    const relevant = deadlines.filter(
      d => d.caseId === caseItem.id || (d.clientId === client.id && d.kind === 'passport_expiry'),
    );
    return allDeadlines(relevant, [client]).sort((a, b) => daysLeft(a, new Date()) - daysLeft(b, new Date()));
  }, [deadlines, caseItem.id, client]);

  const completedTasks = caseTasks.filter(isTaskClosed);
  const pendingTasks = caseTasks.filter(t => !isTaskClosed(t));
  const progress = caseTasks.length > 0 ? Math.round((completedTasks.length / caseTasks.length) * 100) : 0;

  const hasOverdue = pendingTasks.some(t => !isWaiting(t) && new Date(t.date) < new Date());
  const passportExpiry = client.passportExpiry ? new Date(client.passportExpiry) : null;
  const daysToPassportExpiry = passportExpiry ? Math.floor((passportExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const uploadedCount = checklist.filter(c => c.status === 'linked' || c.status === 'verified').length;
  const overdueCount = pendingTasks.filter(t => new Date(t.date) < new Date()).length;
  const outstandingDocs = checklist.length > 0 ? checklist.length - uploadedCount : 0;

  const STAGE_META: Record<CaseStage, { chip: string; dot: string }> = {
    draft: { chip: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
    assessment: { chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    engaged: { chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    preparing: { chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    ready_to_lodge: { chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    lodged: { chip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
    info_requested: { chip: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
    decision: { chip: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
    closed: { chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  };

  const OUTCOME_LABELS: Record<CaseOutcome, string> = {
    granted: 'Granted',
    refused: 'Refused',
    withdrawn: 'Withdrawn',
    lapsed: 'Lapsed',
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

  // Load the eligibility assessment this case was opened from (Visa Advisor), if any.
  useEffect(() => {
    let cancelled = false;
    repos.eligibility.getByCaseId(caseItem.id).then(assessments => {
      if (cancelled) return;
      const latest = [...assessments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setEligibilityAssessment(latest ?? null);
    }).catch(() => { if (!cancelled) setEligibilityAssessment(null); });
    return () => { cancelled = true; };
  }, [caseItem.id, repos.eligibility]);

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
  const applyStageChange = (newStage: CaseStage, outcome?: CaseOutcome) => {
    const updated: Case = { ...currentCase, stage: newStage, outcome: newStage === 'closed' ? outcome : undefined };
    setCurrentCase(updated);
    onUpdateCase(updated);
  };

  /**
   * Every stage move is allowed — see `lib/caseStage.ts`'s `evaluateTransition()`
   * — but a backward move or a move to `closed` needs an inline confirm/pick
   * before it's applied, rather than `window.confirm`/`window.prompt`.
   */
  const handleStageSelect = (newStage: CaseStage) => {
    setStatusOpen(false);
    if (newStage === currentCase.stage) return;
    const transition = evaluateTransition(currentCase.stage, newStage);
    if (transition.requiresOutcome) {
      setBackwardConfirmStage(null);
      setOutcomeDraft('');
      setOutcomePickerOpen(true);
      return;
    }
    if (transition.isBackward) {
      setOutcomePickerOpen(false);
      setBackwardConfirmStage(newStage);
      return;
    }
    applyStageChange(newStage);
  };

  const confirmBackwardMove = () => {
    if (!backwardConfirmStage) return;
    applyStageChange(backwardConfirmStage);
    setBackwardConfirmStage(null);
  };

  const confirmOutcome = () => {
    if (!outcomeDraft) return;
    applyStageChange('closed', outcomeDraft);
    setOutcomePickerOpen(false);
    setOutcomeDraft('');
  };

  const handleToggleOnHold = () => {
    const updated: Case = { ...currentCase, onHold: !currentCase.onHold };
    setCurrentCase(updated);
    onUpdateCase(updated);
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

  // ---- Deadline handlers ----
  const handleAddDeadlineSubmit = () => {
    if (!deadlineForm.title.trim() || !deadlineForm.dueDate) return;
    onAddDeadline({
      id: uuidv4(),
      kind: deadlineForm.kind,
      title: deadlineForm.title.trim(),
      dueDate: deadlineForm.dueDate,
      caseId: caseItem.id,
      clientId: client.id,
      status: 'open',
      notes: deadlineForm.notes.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setDeadlineForm({ kind: 'other', title: '', dueDate: toLocalISODate(), notes: '' });
    setShowAddDeadline(false);
  };

  const openQuickAdd = (kind: 's56_response' | 's57_response') => {
    setQuickAddKind(kind);
    setQuickAddForm({ receivedDate: toLocalISODate(), dueDate: addDaysISO(toLocalISODate(), 28) });
  };

  const handleQuickAddReceivedDateChange = (receivedDate: string) => {
    setQuickAddForm({ receivedDate, dueDate: addDaysISO(receivedDate, 28) });
  };

  const handleQuickAddSubmit = () => {
    if (!quickAddKind || !quickAddForm.dueDate) return;
    onAddDeadline({
      id: uuidv4(),
      kind: quickAddKind,
      title: DEADLINE_KIND_LABELS[quickAddKind],
      dueDate: quickAddForm.dueDate,
      triggeredOn: quickAddForm.receivedDate,
      caseId: caseItem.id,
      clientId: client.id,
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    setQuickAddKind(null);
  };

  const resolveDeadline = (deadline: Deadline, status: 'met' | 'missed' | 'dismissed') => {
    onUpdateDeadline({ ...deadline, status, resolvedAt: new Date().toISOString() });
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
      onMoveTaskDate(taskId, editingDate.date, false, { dateLocked: true });
    }
    setEditingDate(null);
  };

  const handleSetToday = (taskId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.date === today || isTaskClosed(task)) return;

    const futureTasks = pendingTasks.filter(t => t.id !== taskId && new Date(t.date) > new Date(task.date));
    if (futureTasks.length > 0) {
      setOffsetModal({ taskId, newDate: today });
    } else {
      onMoveTaskDate(taskId, today, false, { dateLocked: true });
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
        status: 'not_started',
        isCompleted: false,
        priorityOrder: 999,
        generatedByAi: false
      });
    }
    setIsTaskModalOpen(false);
  };

  // ---- Generate plan from template (Step 1 · 1E) ----
  // Deterministic — one task per timed step, dated by `scheduleFromTemplate`.
  // Only offered while the case has none of that template's step tasks yet.
  const handleGeneratePlanFromTemplate = () => {
    if (!workflowTemplate?.steps?.length || generatingPlan) return;
    setGeneratingPlan(true);
    try {
      const knownAnchors = knownAnchorsFromDeadlines(caseDeadlines);
      const { drafts } = buildTemplateTaskDrafts(workflowTemplate.steps, caseItem.startDate, knownAnchors);
      const newTasks: Task[] = drafts.map((d, index) => ({
        id: uuidv4(),
        caseId: caseItem.id,
        priorityOrder: index,
        assignedTo: caseItem.caseOwner,
        ...d,
      }));
      onAddTasks(newTasks);
      if (workflowTemplate.version !== undefined) {
        onUpdateCase({ ...currentCase, templateVersion: workflowTemplate.version });
      }
      toast.success(`${newTasks.length} task${newTasks.length === 1 ? '' : 's'} generated from the template`);
    } finally {
      setGeneratingPlan(false);
    }
  };

  // ---- Suggest extra tasks with AI (Step 1 · 1E) ----
  const handleSuggestAdditions = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const scheduledSteps = caseTasks
        .filter(t => t.stepKey)
        .map(t => ({ title: t.title, date: t.date, stepKey: t.stepKey }));
      const results = await suggestAdditions(
        caseItem.description,
        caseItem.startDate,
        visaSubclass,
        workflowTemplate?.title,
        scheduledSteps,
      );
      setSuggestions(results);
      if (results.length === 0) {
        toast.info('No additional tasks suggested for this case');
      }
    } catch {
      setSuggestError('Failed to fetch task suggestions. Please try again.');
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = (index: number) => {
    const s = suggestions[index];
    if (!s) return;
    const anchorTask = s.anchorStepKey ? caseTasks.find(t => t.stepKey === s.anchorStepKey) : undefined;
    const baseDate = anchorTask?.date ?? caseItem.startDate;
    onAddTask({
      id: uuidv4(),
      caseId: caseItem.id,
      title: s.title,
      description: s.description,
      date: addDaysISO(baseDate, s.offsetDays || 0),
      status: 'not_started',
      isCompleted: false,
      priorityOrder: 999,
      generatedByAi: true,
      assignedTo: caseItem.caseOwner,
    });
    setSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const rejectSuggestion = (index: number) => {
    setSuggestions(prev => prev.filter((_, i) => i !== index));
  };

  const confirmOffset = (offset: boolean) => {
    if (offsetModal) {
      onMoveTaskDate(offsetModal.taskId, offsetModal.newDate, offset, { dateLocked: true });
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
        `Stage: ${CASE_STAGE_LABELS[caseItem.stage]}${caseItem.onHold ? ' (on hold)' : ''}`,
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
      const combinedText = `${userMsg.content}\n${assistantMsg.content}`;
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
    onUpdateTask(withStatus(task, isTaskClosed(task) ? 'not_started' : 'done'));
  };

  const setTaskStatus = (task: Task, status: Task['status']) => {
    if (status === 'not_applicable') {
      setNaReasonDraft({ taskId: task.id, reason: task.statusReason ?? '' });
      return;
    }
    setNaReasonDraft(null);
    onUpdateTask(withStatus(task, status));
  };

  const confirmNaReason = (task: Task) => {
    if (!naReasonDraft || naReasonDraft.taskId !== task.id || !naReasonDraft.reason.trim()) return;
    onUpdateTask(withStatus(task, 'not_applicable', naReasonDraft.reason));
    setNaReasonDraft(null);
  };

  // ---- Task row renderer (shared by pending + completed lists) ----
  const rowMenuCls = 'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate transition-colors';

  const renderTaskRow = (task: Task, closed: boolean) => {
    const waiting = isWaiting(task);
    const overdue = !closed && !waiting && new Date(task.date) < new Date();
    const editing = editingDate?.taskId === task.id;
    const editingNa = naReasonDraft?.taskId === task.id;
    return (
      <div key={task.id} className="task-card group relative flex items-center gap-3 px-[18px] py-3 border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0">
        {/* Left edge — red when overdue */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${overdue ? 'bg-red-500' : 'bg-transparent'}`} />

        {/* Circular checkbox — one-click "Mark done" / reopen */}
        <button
          onClick={() => toggleTaskComplete(task)}
          title={closed ? 'Reopen task' : 'Mark done'}
          className={`check-btn w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            closed
              ? 'bg-edamame border-[1.5px] border-edamame'
              : 'border-[1.5px] border-ink/20 dark:border-plate-ink/25 hover:border-edamame'
          }`}
        >
          {closed && <Check size={11} className="text-white" strokeWidth={3} />}
        </button>

        {/* Title + description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className={`text-[13.5px] font-semibold tracking-tight leading-snug ${closed ? 'line-through text-ink-faint dark:text-plate-ink-faint' : 'text-ink dark:text-plate-ink'}`}>
              {task.title}
            </div>
            {waiting && (
              <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 whitespace-nowrap">
                {TASK_STATUS_LABELS[task.status]}
              </span>
            )}
            {task.datePending && !closed && (
              <span
                className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 whitespace-nowrap"
                title="Computed from a duration estimate — will firm up once the real anchor is known."
              >
                Estimated
              </span>
            )}
          </div>
          {task.description && !closed && (
            <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mt-0.5 truncate">{task.description}</div>
          )}
          {task.status === 'not_applicable' && task.statusReason && (
            <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-0.5 italic truncate">N/A: {task.statusReason}</div>
          )}
          {editingNa && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={naReasonDraft!.reason}
                onChange={e => setNaReasonDraft({ taskId: task.id, reason: e.target.value })}
                placeholder="Why is this task not applicable?"
                className="flex-1 min-w-0 px-2 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
              />
              <button
                onClick={() => confirmNaReason(task)}
                disabled={!naReasonDraft!.reason.trim()}
                className="px-2 py-1 text-[11px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
              <button
                onClick={() => setNaReasonDraft(null)}
                className="px-1.5 py-1 text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft"
              >
                Cancel
              </button>
            </div>
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
            className="text-[11.5px] font-semibold bg-transparent border border-ink/15 dark:border-plate-ink/20 rounded-md px-1.5 py-0.5 outline-none focus:border-edamame text-ink-soft dark:text-plate-ink-soft"
          />
        ) : (
          <button
            onClick={() => { if (!closed) setEditingDate({ taskId: task.id, date: task.date }); }}
            disabled={closed}
            className={`text-[11.5px] font-bold whitespace-nowrap flex-shrink-0 ${
              overdue ? 'text-red-600 dark:text-red-400' : closed ? 'text-ink-soft/40 dark:text-plate-ink-soft/40' : 'text-ink-soft dark:text-plate-ink-soft hover:text-edamame'
            }`}
          >
            {format(new Date(task.date), 'MMM d')}
          </button>
        )}

        {/* Row actions menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setActiveDropdown(activeDropdown === task.id ? null : task.id)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-ink-soft dark:hover:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical size={14} />
          </button>
          {activeDropdown === task.id && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setActiveDropdown(null)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-52 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content">
                <div className="px-3 pt-1.5 pb-1 text-[9.5px] font-bold uppercase tracking-wide text-ink-soft/60 dark:text-plate-ink-soft/60">
                  Set status
                </div>
                {TASK_STATUS_ORDER.map(s => (
                  <button
                    key={s}
                    onClick={() => { setTaskStatus(task, s); if (s !== 'not_applicable') setActiveDropdown(null); }}
                    className={`${rowMenuCls} ${task.status === s ? 'text-edamame font-semibold' : ''}`}
                  >
                    {task.status === s && <Check size={12} className="text-edamame" />}
                    <span className={task.status === s ? '' : 'ml-[18px]'}>{TASK_STATUS_LABELS[s]}</span>
                  </button>
                ))}
                {!closed && (
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
  const stageMeta = STAGE_META[currentCase.stage];
  const needsOutcomePrompt = currentCase.stage === 'closed' && !currentCase.outcome;

  const menuItemCls = 'w-full text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate transition-colors';

  return (
    <div className="px-5 py-5 lg:px-7 lg:py-6 bg-paper dark:bg-plate min-h-full">

      {/* ══════════════════════════════════════════
          TOP BAR
      ══════════════════════════════════════════ */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink transition-colors"
        >
          <ArrowLeft size={15} strokeWidth={1.8} className="group-hover:-translate-x-0.5 transition-transform" />
          Cases
        </button>
        <h1 className="text-[17px] font-bold text-ink dark:text-plate-ink tracking-tight min-w-0 truncate">
          {currentCase.title}
          <span className="text-ink-faint dark:text-plate-ink-faint font-semibold"> — {client.name}</span>
        </h1>
        <span className="font-mono text-[10.5px] text-ink-faint dark:text-plate-ink-faint">{displayCaseNumber(currentCase)}</span>
        {visaSubclass && (
          <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400">SC-{visaSubclass}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* On hold toggle */}
          <button
            onClick={handleToggleOnHold}
            title={currentCase.onHold ? 'Take this case off hold' : 'Put this case on hold'}
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
              currentCase.onHold
                ? 'border-orange-400 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                : 'border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-edamame'
            }`}
          >
            {currentCase.onHold ? 'On hold' : 'Not on hold'}
          </button>

          {/* Stage chip dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold pl-2.5 pr-2 py-1.5 rounded-lg transition-colors ${stageMeta.chip}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full badge-pulse ${stageMeta.dot}`} />
              {CASE_STAGE_LABELS[currentCase.stage]}
              {currentCase.stage === 'closed' && currentCase.outcome && (
                <span className="opacity-70">· {OUTCOME_LABELS[currentCase.outcome]}</span>
              )}
              <ChevronDown size={12} />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-48 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content max-h-80 overflow-y-auto">
                  {CASE_STAGE_ORDER.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStageSelect(s)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold hover:bg-paper-2 dark:hover:bg-plate transition-colors ${currentCase.stage === s ? 'text-ink dark:text-plate-ink' : 'text-ink-soft dark:text-plate-ink-soft'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${STAGE_META[s].dot}`} />
                      {CASE_STAGE_LABELS[s]}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Backward-move confirm — inline, never window.confirm */}
            {backwardConfirmStage && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBackwardConfirmStage(null)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-3 modal-content">
                  <p className="text-[12px] text-ink dark:text-plate-ink font-semibold mb-1">Move stage backward?</p>
                  <p className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mb-3">
                    This moves the case from {CASE_STAGE_LABELS[currentCase.stage]} back to {CASE_STAGE_LABELS[backwardConfirmStage]}.
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setBackwardConfirmStage(null)} className="px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button onClick={confirmBackwardMove} className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-edamame-500 hover:bg-edamame-600 rounded-lg transition-colors">
                      Confirm
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Outcome picker — required before a move to Closed applies */}
            {outcomePickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setOutcomePickerOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-64 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-3 modal-content">
                  <p className="text-[12px] text-ink dark:text-plate-ink font-semibold mb-2">Outcome</p>
                  <div className="space-y-1 mb-3">
                    {(['granted', 'refused', 'withdrawn', 'lapsed'] as CaseOutcome[]).map(o => (
                      <button
                        key={o}
                        onClick={() => setOutcomeDraft(o)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
                          outcomeDraft === o
                            ? 'bg-edamame-50 dark:bg-edamame-900/20 text-edamame-700 dark:text-edamame-400'
                            : 'text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate'
                        }`}
                      >
                        {OUTCOME_LABELS[o]}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setOutcomePickerOpen(false)} className="px-3 py-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-ink/8 dark:hover:bg-plate-ink/10 rounded-lg transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={confirmOutcome}
                      disabled={!outcomeDraft}
                      className="px-3 py-1.5 text-[11.5px] font-semibold text-white bg-edamame-500 hover:bg-edamame-600 disabled:bg-ink/20 dark:disabled:bg-plate-ink/20 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      Close case
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Draft + Eligibility action chips */}
          <div className="flex items-center gap-1.5 pr-2 border-r border-ink/15 dark:border-plate-ink/20">
            <button
              onClick={() => handleSkillAction('Please help me draft a cover letter for this immigration case.')}
              title="Draft a document with the Agent"
              className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
            >
              <PenLine size={13} strokeWidth={1.8} />
              <span className="hidden md:inline">Draft</span>
            </button>
            <button
              onClick={handleEligibility}
              title="Open the Visa Advisor pre-filled with this client"
              className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
            >
              <ShieldCheck size={13} strokeWidth={1.8} />
              <span className="hidden md:inline">Eligibility</span>
            </button>
            {eligibilityAssessment && (
              <button
                onClick={() => setShowEligibilityAssessment(true)}
                title="View the eligibility assessment this case was opened from"
                className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
              >
                <ShieldCheck size={13} strokeWidth={1.8} />
                <span className="hidden md:inline">Eligibility assessment</span>
              </button>
            )}
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
                : 'border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft hover:border-edamame'
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
              className="w-8 h-8 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card flex items-center justify-center text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-40 w-52 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content">
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
                  {canDeleteCase && (
                    <>
                      <div className="h-px bg-paper-2 dark:bg-plate-card my-1" />
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setMoreOpen(false); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-[12.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Delete case
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Closed with no recorded outcome — prompt for one inline whenever the case is opened. */}
      {needsOutcomePrompt && (
        <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300/60 dark:border-amber-700/40">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" strokeWidth={1.8} />
          <span className="text-[12.5px] text-amber-800 dark:text-amber-300 font-semibold flex-1">
            This case is closed with no recorded outcome.
          </span>
          <button
            onClick={() => { setOutcomeDraft(''); setOutcomePickerOpen(true); }}
            className="text-[12px] font-bold text-amber-800 dark:text-amber-300 underline hover:no-underline"
          >
            Set outcome
          </button>
        </div>
      )}

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
          <div className="flex items-center gap-0.5 border-b border-ink/10 dark:border-plate-ink/15 overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setActiveTabId('workspace')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeTabId === 'workspace'
                  ? 'border-edamame text-ink dark:text-plate-ink'
                  : 'border-transparent text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft'
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
                    ? 'border-edamame text-ink dark:text-plate-ink'
                    : 'border-transparent text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                {tab.label}
                {tab.kind === 'checklist' && checklist.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft'}`}>
                    {checklist.length}
                  </span>
                )}
                {tab.kind === 'tasks' && caseTasks.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft'}`}>
                    {caseTasks.length}
                  </span>
                )}
                {tab.kind === 'documents' && documents.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-px rounded-full ${activeTabId === tab.id ? 'bg-edamame/10 text-edamame-700 dark:text-edamame-400' : 'bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft'}`}>
                    {documents.length}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePinTab(tab.id); }}
                  title={tab.pinned ? 'Unpin tab' : 'Pin tab (persists across reloads)'}
                  className={`p-0.5 rounded transition-colors ${tab.pinned ? 'text-edamame' : 'text-ink-soft/40 dark:text-plate-ink-soft/40 opacity-0 group-hover:opacity-100 hover:text-edamame'}`}
                >
                  {tab.pinned ? <Pin size={11} /> : <PinOff size={11} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  title="Close tab"
                  className="p-0.5 rounded text-ink-soft/40 dark:text-plate-ink-soft/40 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-colors"
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
              {/* ── Deadlines ── */}
              <section>
                <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
                  <span className="text-[12.5px] font-bold text-ink dark:text-plate-ink">
                    Deadlines <span className="text-ink-faint dark:text-plate-ink-faint font-semibold">· {caseDeadlines.length}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openQuickAdd('s56_response')}
                      className="btn-press px-2.5 py-1 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
                    >
                      + s56
                    </button>
                    <button
                      onClick={() => openQuickAdd('s57_response')}
                      className="btn-press px-2.5 py-1 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
                    >
                      + s57
                    </button>
                    <button
                      onClick={() => setShowAddDeadline(o => !o)}
                      className="btn-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-edamame hover:bg-edamame-600 text-white text-[11px] font-bold transition-colors"
                    >
                      <Plus size={12} strokeWidth={2.2} />
                      Add deadline
                    </button>
                  </div>
                </div>

                {/* s56/s57 quick-add form */}
                {quickAddKind && (
                  <div className="mb-2.5 p-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card space-y-2">
                    <div className="text-[11.5px] font-bold text-ink dark:text-plate-ink">{DEADLINE_KIND_LABELS[quickAddKind]}</div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-[11px] text-ink-soft dark:text-plate-ink-soft flex items-center gap-1.5">
                        Received
                        <input
                          type="date"
                          value={quickAddForm.receivedDate}
                          onChange={e => handleQuickAddReceivedDateChange(e.target.value)}
                          className="px-1.5 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                        />
                      </label>
                      <label className="text-[11px] text-ink-soft dark:text-plate-ink-soft flex items-center gap-1.5">
                        Due
                        <input
                          type="date"
                          value={quickAddForm.dueDate}
                          onChange={e => setQuickAddForm(f => ({ ...f, dueDate: e.target.value }))}
                          className="px-1.5 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                        />
                      </label>
                    </div>
                    <p className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint">
                      Defaults to 28 days after the received date — response periods vary by request, so confirm the actual date on the letter.
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleQuickAddSubmit}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-md"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setQuickAddKind(null)}
                        className="px-2 py-1 text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Add deadline form */}
                {showAddDeadline && (
                  <div className="mb-2.5 p-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={deadlineForm.kind}
                        onChange={e => setDeadlineForm(f => ({ ...f, kind: e.target.value as DeadlineKind }))}
                        className="px-2 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                      >
                        {DEADLINE_KIND_ORDER.map(k => (
                          <option key={k} value={k}>{DEADLINE_KIND_LABELS[k]}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={deadlineForm.title}
                        onChange={e => setDeadlineForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="Title"
                        className="flex-1 min-w-[140px] px-2 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                      />
                      <input
                        type="date"
                        value={deadlineForm.dueDate}
                        onChange={e => setDeadlineForm(f => ({ ...f, dueDate: e.target.value }))}
                        className="px-1.5 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                      />
                    </div>
                    <input
                      type="text"
                      value={deadlineForm.notes}
                      onChange={e => setDeadlineForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Notes (optional)"
                      className="w-full px-2 py-1 text-[11.5px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-md outline-none focus:border-edamame text-ink dark:text-plate-ink"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleAddDeadlineSubmit}
                        disabled={!deadlineForm.title.trim()}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowAddDeadline(false)}
                        className="px-2 py-1 text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {caseDeadlines.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-6 text-center">
                    <p className="text-[12.5px] text-ink-faint dark:text-plate-ink-faint">No deadlines tracked for this case</p>
                  </div>
                ) : (
                  <div className="bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl overflow-hidden">
                    {caseDeadlines.map(d => {
                      const isVirtual = d.id.startsWith('passport:');
                      const days = daysLeft(d, new Date());
                      const u = urgency(d, new Date());
                      const urgencyMeta: Record<typeof u, { chip: string; label: string }> = {
                        none: { chip: 'bg-slate-500/[0.1] text-ink-soft dark:text-plate-ink-soft', label: days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d left` },
                        soon: { chip: 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400', label: `${days}d left` },
                        urgent: { chip: 'bg-orange-500/[0.15] text-orange-700 dark:text-orange-400', label: `${days}d left` },
                        critical: { chip: 'bg-red-500/[0.15] text-red-700 dark:text-red-400', label: days < 0 ? `overdue ${Math.abs(days)}d` : `${days}d left` },
                      };
                      const meta = urgencyMeta[u];
                      const missedCandidate = !isVirtual && d.status === 'open' && days < 0;
                      return (
                        <div key={d.id} className="px-[18px] py-3 border-b border-ink/10 dark:border-plate-ink/15 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${meta.chip}`}>
                              {meta.label}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-ink dark:text-plate-ink truncate">
                                {d.title}
                                <span className="ml-1.5 text-[10px] font-semibold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wide">
                                  {DEADLINE_KIND_LABELS[d.kind]}
                                </span>
                              </div>
                              <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-0.5">
                                Due {format(new Date(`${d.dueDate}T00:00:00`), 'MMM d, yyyy')}
                                {isVirtual && ' · auto-tracked from client passport'}
                                {d.status !== 'open' && ` · ${d.status}`}
                              </div>
                            </div>
                            {!isVirtual && d.status === 'open' && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => resolveDeadline(d, 'met')}
                                  className="px-2 py-1 text-[10.5px] font-bold rounded-md bg-emerald-500/[0.13] text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/[0.22] transition-colors"
                                >
                                  Mark met
                                </button>
                                <button
                                  onClick={() => resolveDeadline(d, 'missed')}
                                  className="px-2 py-1 text-[10.5px] font-bold rounded-md bg-red-500/[0.13] text-red-700 dark:text-red-400 hover:bg-red-500/[0.22] transition-colors"
                                >
                                  Mark missed
                                </button>
                                <button
                                  onClick={() => resolveDeadline(d, 'dismissed')}
                                  className="px-2 py-1 text-[10.5px] font-semibold rounded-md text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate transition-colors"
                                >
                                  Dismiss
                                </button>
                              </div>
                            )}
                          </div>
                          {missedCandidate && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-red-600 dark:text-red-400">
                              <AlertTriangle size={12} strokeWidth={2} />
                              Missed? This deadline is overdue and still open — mark it met or missed above.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {templateHasTiming(workflowTemplate) && !caseTasks.some(t => t.stepKey) && (
                <section className="rounded-xl border border-dashed border-edamame-300 dark:border-edamame-700 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] font-bold text-ink dark:text-plate-ink">No tasks yet</div>
                    <p className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mt-0.5">
                      "{workflowTemplate?.title}" has step timing — generate this case's plan from it.
                    </p>
                  </div>
                  <button
                    onClick={handleGeneratePlanFromTemplate}
                    disabled={generatingPlan}
                    className="btn-press flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-edamame hover:bg-edamame-600 text-white text-[12px] font-bold transition-colors disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    Generate plan from template
                  </button>
                </section>
              )}

              {caseTasks.some(t => t.stepKey) && (
                <section>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[12.5px] font-bold text-ink dark:text-plate-ink">AI suggestions</span>
                    <button
                      onClick={handleSuggestAdditions}
                      disabled={suggesting}
                      className="btn-press inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors disabled:opacity-50"
                    >
                      <Sparkles size={12} />
                      {suggesting ? 'Thinking…' : 'Suggest extra tasks with AI'}
                    </button>
                  </div>
                  {suggestError && (
                    <p className="mt-2 text-[11.5px] text-red-600 dark:text-red-400">{suggestError}</p>
                  )}
                  {suggestions.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {suggestions.map((s, i) => (
                        <div key={i} className="p-3 rounded-xl border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card">
                          <div className="text-[13px] font-semibold text-ink dark:text-plate-ink">{s.title}</div>
                          <p className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5">{s.description}</p>
                          <p className="text-[11px] italic text-ink-faint dark:text-plate-ink-faint mt-1">Why: {s.reason}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            <button
                              onClick={() => acceptSuggestion(i)}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-edamame-500 hover:bg-edamame-600 rounded-md transition-colors"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => rejectSuggestion(i)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper dark:hover:bg-plate rounded-md transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[12.5px] font-bold text-ink dark:text-plate-ink">
                    Pending <span className="text-ink-faint dark:text-plate-ink-faint font-semibold">· {pendingTasks.length} tasks</span>
                  </span>
                  {overdueCount > 0 && (
                    <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-md bg-red-500/[0.13] text-red-700 dark:text-red-400">
                      {overdueCount} overdue
                    </span>
                  )}
                </div>

                {pendingTasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-10 text-center">
                    <CheckCircle2 size={26} className="mx-auto mb-2 text-ink-soft/30 dark:text-plate-ink-soft/30" />
                    <p className="text-sm text-ink-faint dark:text-plate-ink-faint">All tasks completed</p>
                  </div>
                ) : (
                  <div className="bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl overflow-hidden">
                    {pendingTasks.map(task => renderTaskRow(task, false))}
                  </div>
                )}
              </section>

              {completedTasks.length > 0 && (
                <section>
                  <div className="text-[12.5px] font-bold text-ink-soft dark:text-plate-ink-soft mb-2.5">
                    Completed <span className="text-ink-faint dark:text-plate-ink-faint font-semibold">· {completedTasks.length} tasks</span>
                  </div>
                  <div className="bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl overflow-hidden">
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
                  <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-10 text-center">
                    <FileText size={26} className="mx-auto mb-2 text-ink-soft/30 dark:text-plate-ink-soft/30" />
                    <p className="text-sm text-ink-faint dark:text-plate-ink-faint">No checklist items yet. Generate one or add items manually.</p>
                  </div>
                ) : (
                  Array.from(groups.entries()).map(([category, items]) => {
                    const collapsed = collapsedCategories.has(category);
                    return (
                      <div key={category} className="bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleCategoryCollapsed(category)}
                          className="w-full flex items-center justify-between px-5 py-3 text-left"
                        >
                          <span className="text-[12.5px] font-bold text-ink dark:text-plate-ink">{category}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-ink-faint dark:text-plate-ink-faint">
                              {items.filter(i => i.status === 'linked' || i.status === 'verified').length}/{items.length}
                            </span>
                            {collapsed ? <ChevronRight size={14} className="text-ink-faint dark:text-plate-ink-faint" /> : <ChevronDown size={14} className="text-ink-faint dark:text-plate-ink-faint" />}
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
                              className={`table-row-hover flex items-center gap-3 px-5 py-2.5 border-t border-ink/10 dark:border-plate-ink/15 transition-colors ${
                                isDragOver ? 'bg-edamame/[0.06] dark:bg-edamame/[0.08]' : ''
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px] font-semibold text-ink dark:text-plate-ink-soft tracking-tight">{item.label}</span>
                                  <DocumentTypeBadge code={item.documentTypeCode} />
                                </div>
                                {item.description && <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint mt-0.5">{item.description}</div>}
                                {linkedDoc ? (
                                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-ink-soft dark:text-plate-ink-soft">
                                    <FileText size={11} className="text-ink-faint dark:text-plate-ink-faint flex-shrink-0" />
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
                                      className="text-ink-faint dark:text-plate-ink-faint hover:text-red-500 dark:hover:text-red-400"
                                    >
                                      <X size={11} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className={`mt-1 text-[10.5px] italic ${isDragOver ? 'text-edamame font-semibold' : 'text-ink-faint dark:text-plate-ink-faint'}`}>
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
                                    <div className="absolute right-0 top-full mt-1.5 z-40 w-32 bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/10 dark:border-plate-ink/15 p-1 modal-content">
                                      {(['pending', 'linked', 'verified', 'waived'] as ChecklistItemStatus[]).map(s => (
                                        <button
                                          key={s}
                                          onClick={() => { updateChecklistStatus(item.id, s); setChecklistStatusMenuId(null); }}
                                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[11.5px] font-semibold hover:bg-paper-2 dark:hover:bg-plate transition-colors ${item.status === s ? 'text-ink dark:text-plate-ink' : 'text-ink-soft dark:text-plate-ink-soft'}`}
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
                  <span className="text-[12.5px] font-bold text-ink dark:text-plate-ink">
                    Document Checklist <span className="text-ink-faint dark:text-plate-ink-faint font-semibold">· {uploadedCount}/{checklist.length} linked</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {/* §4.4 — show Case Files beside the checklist so a file can be dragged across without switching tabs. */}
                    <button
                      onClick={() => setCaseFilesSplit(v => !v)}
                      title="Show Case Files side by side"
                      className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        caseFilesSplit
                          ? 'border-edamame text-edamame bg-edamame/[0.06]'
                          : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame'
                      }`}
                    >
                      <Columns2 size={12} /> Case Files
                    </button>
                    {/* §4.3.1 — re-run auto-link on demand, without leaving and re-entering the tab. */}
                    <button
                      onClick={runAutoLinkPass}
                      title="Re-run auto-link against the current Case Files and document type settings"
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
                    >
                      <RefreshCw size={12} /> Refresh
                    </button>
                    <button
                      onClick={() => setShowChecklistGenerator(true)}
                      className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg border border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame transition-colors"
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
                        <span className="text-[12px] font-bold text-ink dark:text-plate-ink">
                          Case Files <span className="text-ink-faint dark:text-plate-ink-faint font-semibold">· {documents.length}</span>
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
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between">
              <h3 className="text-xl font-bold text-ink dark:text-plate-ink">Edit Case</h3>
              <button onClick={() => setIsEditingCase(false)} className="p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft rounded-lg hover:bg-paper-2 dark:hover:bg-plate-card transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Case Title</label>
                <input
                  type="text"
                  value={caseEditForm.title}
                  onChange={(e) => setCaseEditForm({ ...caseEditForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={caseEditForm.description}
                  onChange={(e) => setCaseEditForm({ ...caseEditForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink resize-none"
                  rows={4}
                />
              </div>
            </div>
            <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-3">
              <button
                onClick={() => setIsEditingCase(false)}
                className="px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
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
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-ink dark:text-plate-ink mb-2">Delete Case?</h3>
              <p className="text-ink-soft dark:text-plate-ink-soft leading-relaxed">
                Are you sure you want to delete <strong>"{currentCase.title}"</strong>? This action cannot be undone. All tasks associated with this case will remain but will no longer be linked.
              </p>
            </div>
            <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
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
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-ink/10 dark:border-plate-ink/15">
              <h3 className="text-xl font-bold text-ink dark:text-plate-ink">
                {editingTask ? 'Edit Task' : 'Add New Task'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
                  placeholder="e.g., Review Documents"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink resize-none"
                  rows={3}
                  placeholder="Add more details..."
                />
              </div>
              {!(editingTask && isTaskClosed(editingTask)) && (
                <div>
                  <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Planned Date</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={taskForm.date}
                      onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })}
                      className="flex-1 px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
                    />
                    <button
                      type="button"
                      onClick={() => setTaskForm({ ...taskForm, date: format(new Date(), 'yyyy-MM-dd') })}
                      className="px-4 py-2.5 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft rounded-xl hover:bg-paper-2/70 dark:hover:bg-plate transition-colors text-xs font-bold uppercase"
                    >
                      Today
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-3">
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
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
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="w-12 h-12 bg-edamame/10 rounded-full flex items-center justify-center text-edamame mb-4">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-ink dark:text-plate-ink mb-2">Adjust Future Tasks?</h3>
              <p className="text-ink-soft dark:text-plate-ink-soft leading-relaxed">
                You've changed the date for this task. Would you like to automatically offset all future pending tasks in this case by the same number of days?
              </p>
            </div>
            <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex flex-col gap-2">
              <button
                onClick={() => confirmOffset(true)}
                className="w-full py-3 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-xl shadow-lg shadow-edamame/20 transition-all"
              >
                Yes, Offset Future Tasks
              </button>
              <button
                onClick={() => confirmOffset(false)}
                className="w-full py-3 bg-paper-2 dark:bg-plate-card text-ink-soft dark:text-plate-ink-soft font-bold rounded-xl border border-ink/15 dark:border-plate-ink/20 hover:bg-paper-2 dark:hover:bg-plate-card transition-all"
              >
                No, Only This Task
              </button>
              <button
                onClick={() => setOffsetModal(null)}
                className="w-full py-2 text-sm text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft transition-colors"
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
          <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink dark:text-plate-ink">Add Checklist Item</h3>
              <button onClick={() => setAddItemOpen(false)} className="p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft rounded-lg hover:bg-paper-2 dark:hover:bg-plate-card transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Document Name</label>
                <input
                  autoFocus
                  type="text"
                  value={addItemForm.label}
                  onChange={(e) => setAddItemForm({ ...addItemForm, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddChecklistItem(); }}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
                  placeholder="e.g., Additional reference letter"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Category</label>
                <input
                  type="text"
                  value={addItemForm.category}
                  onChange={(e) => setAddItemForm({ ...addItemForm, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">Document Type</label>
                <DocumentTypePicker
                  value={addItemForm.documentTypeCode}
                  onChange={(code) => setAddItemForm({ ...addItemForm, documentTypeCode: code })}
                  placeholder="Optional — enables auto-link"
                />
              </div>
            </div>
            <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-3">
              <button
                onClick={() => setAddItemOpen(false)}
                className="px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink transition-colors"
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

      {/* Eligibility assessment read-only view */}
      {showEligibilityAssessment && eligibilityAssessment && (
        <EligibilityAssessmentModal
          assessment={eligibilityAssessment}
          onClose={() => setShowEligibilityAssessment(false)}
        />
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
