
export interface Task {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  isCompleted: boolean;
  priorityOrder: number;
  caseId?: string;
  generatedByAi?: boolean;
  userId?: string;
  /** ID of the team member this task is assigned to. */
  assignedTo?: string;
}

// ---------------------------------------------------------------------------
// Team collaboration
// ---------------------------------------------------------------------------

export type TeamMemberRole = 'partner' | 'lawyer' | 'assistant';
export type TeamMemberStatus = 'available' | 'busy' | 'offline';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string; // initials or URL
  role: TeamMemberRole;
  /** Cached active case count — recomputed on render from cases. */
  caseCount: number;
  /** Cached active task count — recomputed on render from tasks. */
  activeTaskCount: number;
  status: TeamMemberStatus;
  /** ISO timestamp when this member joined the firm. */
  joinedAt?: string;
}

export interface CaseAssignmentEvent {
  id: string;
  caseId: string;
  fromOwnerId?: string;
  toOwnerId: string;
  changedAt: string; // ISO timestamp
  changedBy?: string; // TeamMember id
  note?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'case_created' | 'case_assigned' | 'case_updated' | 'task_completed' | 'task_assigned' | 'member_added';
  actorId?: string; // TeamMember id responsible
  subjectId?: string; // caseId / taskId / memberId
  summary: string;
  createdAt: string; // ISO
}

export interface WorkflowStep {
  title: string;
  description: string;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  visaSubclass?: string;
  steps?: WorkflowStep[];
  userId?: string | null; // null = system default
}

export interface Client {
  id: string;
  name: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  passportNumber?: string;
  passportExpiry?: string;
  nationality?: string;
  gender?: string;
  passportData?: Record<string, string>;
  userId?: string;
  role?: 'client' | 'applicant' | 'sponsor' | 'employer';
  notes?: string;
}

export type CaseStatus = 'open' | 'in_progress' | 'on_hold' | 'closed';

export interface Case {
  id: string;
  clientId: string;
  title: string;
  description: string;
  templateId: string;
  status: CaseStatus;
  startDate: string;
  createdAt: string;
  userId?: string;
  /** TeamMember id of the responsible case owner. */
  caseOwner?: string;
  /** Ordered list of ownership changes for this case. */
  assignmentHistory?: CaseAssignmentEvent[];
  /** ID of the visa applicant — falls back to clientId if unset. clientId = engaging/paying party. */
  applicantId?: string;
}

export interface CaseNote {
  id: string;
  caseId: string;
  content: string; // HTML from rich text editor
  createdAt: string;
  userId?: string;
}

export interface Document {
  id: string;
  caseId: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  userId?: string;
  /**
   * Document Type code from the firm's Document Type list (see `DocumentType`).
   * Mandatory at upload time (`components/DocumentUpload.tsx`) — `OTH` is the
   * escape hatch for anything uncategorisable. Optional on the type only
   * because files uploaded before this field existed have none.
   */
  documentTypeCode?: string;
  /** 820-specific evidence categorisation — drives Submission Bundle Auto-Builder */
  aspectTag?: Aspect820;
  /** One-line description shown in the submission index */
  evidenceNote?: string;
}

/**
 * Subclass-820 evidence categories — four "aspects of the relationship"
 * plus three non-aspect ImmiAccount slots (identity, sponsor, police_health).
 */
export type Aspect820 =
  | 'financial'
  | 'household'
  | 'social'
  | 'commitment'
  | 'identity'
  | 'sponsor'
  | 'police_health';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
  userId?: string;
}

export type StorageMode = 'local' | 'cloud';

export type Theme = 'classic' | 'dark';

// Legacy — kept for migration but no longer used for routing
export type ViewMode = 'dashboard' | 'clients' | 'cases' | 'case-details' | 'templates' | 'settings' | 'team' | 'team-members';

// ---------------------------------------------------------------------------
// Document Checklist
// ---------------------------------------------------------------------------

export type ChecklistItemStatus = 'pending' | 'linked' | 'verified' | 'waived';

export interface DocumentChecklistItem {
  id: string;
  caseId: string;
  label: string;
  description?: string;
  status: ChecklistItemStatus;
  linkedDocumentId?: string;
  requiredForSubclass?: string[];
  /** Document category this item belongs to, e.g. "482 — Sponsor & Nomination Documents". Renders as a collapsible section. */
  category?: string;
  /** True when this item was manually added by the user (rather than generated from the system default / workflow template). */
  manuallyAdded?: boolean;
  /**
   * Document Type code (see `DocumentType`) this checklist item expects.
   * Drives auto-link: a Case File tagged with the same code, whose Document
   * Type has `autoLink` on, links itself here. Editable at any time.
   */
  documentTypeCode?: string;
}

// ---------------------------------------------------------------------------
// Document Types — firm/account-level reference list
// ---------------------------------------------------------------------------

/**
 * One row of the account's Document Type reference list (GitHub issue #4 §3.3).
 *
 * Seeded with a locked system-default set (`lib/documentTypes.ts`); firms may
 * append their own rows. Scoped per account, the same way `profiles` is — never
 * per-case, never shared across tenants.
 */
export interface DocumentType {
  id: string;
  /** Short uppercase code, `^[A-Z0-9]{1,6}$`, unique within the account. */
  code: string;
  /** Human-readable label, max 100 chars. */
  description: string;
  /** Grouping used by the search-as-you-type pickers, e.g. "Identity". */
  category: string;
  /** Seeded row — the app blocks renaming/recoding/deleting it (but not `autoLink`). */
  isSystemDefault: boolean;
  /** Per-firm opt-in: tag a Case File with this code and it auto-links to matching checklist items. */
  autoLink: boolean;
  userId?: string;
}

// ---------------------------------------------------------------------------
// Case Workspace — tabs, View/Tools catalogue
// ---------------------------------------------------------------------------

/** Built-in View items surfaced from the Workspace "View" section. */
export type CaseViewKind = 'tasks' | 'checklist' | 'notes' | 'documents';

/** Built-in Tool items surfaced from the Workspace "Tools" section. */
export type CaseToolKind = 'checklist-generator' | 'auto-packager' | 'bundle-builder-820' | 'reference-letter-validator';

export type CaseTabKind = 'workspace' | CaseViewKind | CaseToolKind;

export interface CaseOpenTab {
  id: string; // stable per-kind id, e.g. "tab:tasks" or "tab:checklist-generator"
  kind: CaseTabKind;
  label: string;
  pinned: boolean;
}

// ---------------------------------------------------------------------------
// Focus Mode Chat
// ---------------------------------------------------------------------------

// Distinguishes a plain text turn from the agentic GitHub-issue-filing flow
// (see GitHub issue #15): 'issue-draft' renders Confirm/Cancel buttons for a
// drafted issue that hasn't been filed yet; 'issue-filed' is the confirmation
// message after a real POST to GitHub succeeded.
export type FocusMessageKind = 'text' | 'issue-draft' | 'issue-filed';

export interface FocusIssueDraft {
  title: string;
  body: string;
}

export interface FocusChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  kind?: FocusMessageKind;
  /** Present when kind === 'issue-draft' and still awaiting Confirm/Cancel. */
  issueDraft?: FocusIssueDraft;
  /** Set once the draft has been confirmed (filed) or cancelled (discarded). */
  issueDraftResolved?: 'filed' | 'cancelled';
  /** Present when kind === 'issue-filed'. */
  issueUrl?: string;
  issueNumber?: number;
}

export interface FocusConversation {
  id: string;
  caseId: string;
  title: string;
  messages: FocusChatMessage[];
  createdAt: string;
}
