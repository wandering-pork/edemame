
/**
 * Where a task currently stands in its lifecycle. Replaces the old boolean
 * `isCompleted` (see `Task.isCompleted` and `lib/taskStatus.ts`).
 */
export type TaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'waiting_client'
  | 'waiting_third_party'
  | 'not_applicable'
  | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  status: TaskStatus;
  /** Required when status is 'not_applicable' — see `lib/taskStatus.ts`'s `withStatus()`. */
  statusReason?: string;
  /**
   * @deprecated Derived from `status` (`status === 'done' || status === 'not_applicable'`).
   * Kept in sync by `lib/taskStatus.ts` for one release so old call sites/tabs
   * that still read it keep working — prefer `isTaskClosed(task)`.
   */
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
  type: 'case_created' | 'case_assigned' | 'case_updated' | 'case_stage_changed' | 'task_completed' | 'task_assigned' | 'task_status_changed' | 'member_added' | 'deadline_added' | 'deadline_resolved';
  actorId?: string; // TeamMember id responsible
  subjectId?: string; // caseId / taskId / memberId
  summary: string;
  createdAt: string; // ISO
}

export type UsageEventType = 'eligibility_check' | 'case_created' | 'client_created' | 'team_member_added';

export interface UsageEvent {
  id: string;
  userId: string;
  /** Firm the acting user belonged to when the event fired (Step 1 · 1F) — gives seat counts for pricing. Undefined in local mode (no firm concept) and for cloud rows logged before this field existed. */
  firmId?: string;
  type: UsageEventType;
  metadata?: {
    visaSubclass?: string;       // case_created
    templateId?: string;         // case_created
    promptTokens?: number;       // eligibility_check
    candidatesTokens?: number;   // eligibility_check
    totalTokens?: number;        // eligibility_check
    estimatedCostUsd?: number;   // eligibility_check (placeholder pricing, see api/_lib/aiPricing.ts)
  };
  createdAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Firm accounts (Step 1 · 1F) — cloud-only. See supabase/migrations/
// 20260926000300_create_firms.sql and CLAUDE.md's "Firm accounts" section.
// ---------------------------------------------------------------------------

/** No `admin` role for MVP — see docs/plans/step-1-foundations.md, Decisions #4. */
export type FirmRole = 'owner' | 'agent' | 'paralegal';
export type FirmMemberAccountStatus = 'active' | 'disabled';
/** Replaces the old free-standing `TeamMemberStatus` concept for firm members. */
export type FirmAvailability = 'available' | 'busy' | 'offline';

export interface Firm {
  id: string;
  name: string;
}

/** One row of `firm_member_directory(firmId)` — name/email come from `auth.users`, which the client can't read directly. */
export interface FirmMemberRow {
  userId: string;
  email: string;
  fullName: string;
  role: FirmRole;
  status: FirmMemberAccountStatus;
  availability: FirmAvailability;
  joinedAt: string; // ISO
}

export interface FirmInvite {
  id: string;
  firmId: string;
  email: string;
  role: FirmRole;
  createdAt: string; // ISO
  expiresAt: string; // ISO
  acceptedAt?: string;
  revokedAt?: string;
}

// ---------------------------------------------------------------------------
// Template task timing (Step 1 · 1E, and the DeadlineKind used by 1D's
// Deadline entity — defined here since 1E's `StepAnchor` references it and
// this file has no dependency on the (not-yet-built) Deadline entity itself).
// ---------------------------------------------------------------------------

export type DeadlineKind =
  | 'visa_expiry' | 'passport_expiry'
  | 's56_response' | 's57_response'
  | 'nomination_validity' | 'invitation_window'
  | 'other';

export type StepAnchor =
  | { type: 'case_start' }
  | { type: 'previous_step' }
  | { type: 'step'; stepKey: string; edge: 'start' | 'done' }
  | { type: 'deadline'; kind: DeadlineKind };      // e.g. invitation received

export interface StepTiming {
  anchor: StepAnchor;
  offsetDays: number;                       // from the anchor
  durationDays?: { min: number; max: number }; // how long the step itself takes
  /** Set by law: agent can't move it (e.g. lodge ≤60 days after invitation). */
  fixed: boolean;
}

export interface WorkflowStep {
  /** Stable id, so anchors survive reordering. Steps missing one (custom/legacy templates) get one assigned by `lib/templateTiming.ts`'s `normalizeTemplate()`. */
  key: string;
  title: string;
  description: string;
  /** Absent = old/custom template with no timing data yet; scheduler falls back to today's AI-only behaviour. */
  timing?: StepTiming;
  /** Must be done before the case can advance (feeds the 1C At Risk rule "a gate task is overdue"). */
  isGate?: boolean;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  visaSubclass?: string;
  steps?: WorkflowStep[];
  userId?: string | null; // null = system default
  /** Provenance for system-default templates: the official page(s) content was checked against. */
  sourceUrl?: string;
  /** Provenance for system-default templates: ISO date (YYYY-MM-DD) content was last verified. */
  lastVerified?: string;
  /**
   * Template schema/content revision. Optional (rather than the plan's
   * required `version: number`) because custom templates created via
   * `pages/Templates.tsx` today are built with just `{ title, description }`
   * and no `steps`/`version` at all — making it required would break that
   * call site and every persisted custom template with no migration in this
   * slice. Absent = version 1 semantics (pre-1E behaviour, `templateVersion`
   * on `Case` unset). System templates in `lib/seedData.ts` set this to `1`.
   */
  version?: number;
  /**
   * Whether a registered agent has reviewed this template's step `timing`
   * data. Ships `false` on every system template (see `seedData.ts`) — the
   * Templates page shows "Timing not yet reviewed by a registered agent"
   * until someone signs it off.
   */
  timingVerified?: boolean;
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

// ---------------------------------------------------------------------------
// Deadlines (Step 1 · 1D)
// ---------------------------------------------------------------------------

/**
 * An external, consequential date the agent doesn't control — as opposed to
 * a Task, whose date the agent sets. See `lib/deadlines.ts` for urgency and
 * ranking, and `repos.deadlines` / CLAUDE.md's "Local-First Storage" section
 * for storage.
 */
export type DeadlineStatus = 'open' | 'met' | 'missed' | 'dismissed';

export interface Deadline {
  id: string;
  kind: DeadlineKind;
  title: string;
  dueDate: string; // YYYY-MM-DD
  caseId?: string;
  clientId?: string;
  /** When the triggering event happened (e.g. s56 letter received, invitation date). */
  triggeredOn?: string;
  status: DeadlineStatus;
  /** ISO timestamp — set when status moves from 'open' to 'met'/'missed'/'dismissed'. */
  resolvedAt?: string;
  notes?: string;
  createdAt: string; // ISO
  userId?: string;
}

/** @deprecated legacy case status — replaced by `CaseStage`. Kept as a read-only fallback for `normalizeCase()` and one release of derived writes on the cloud row. See `lib/caseStage.ts`. */
export type CaseStatus = 'open' | 'in_progress' | 'on_hold' | 'closed';

/**
 * Case lifecycle stage (Step 1 · Foundations 1C), replacing `CaseStatus`.
 * `pre_lodgement`: draft → ready_to_lodge. `with_department`: lodged,
 * info_requested, decision. `closed` is its own group. See
 * `lib/caseStage.ts` for the transition rules, labels and stage groups.
 */
export type CaseStage =
  | 'draft' | 'assessment' | 'engaged' | 'preparing' | 'ready_to_lodge'
  | 'lodged' | 'info_requested' | 'decision' | 'closed';

/** Required when a case's `stage` is `closed` — see `lib/caseStage.ts`'s `outcomeRequired()`. */
export type CaseOutcome = 'granted' | 'refused' | 'withdrawn' | 'lapsed';

export interface Case {
  id: string;
  clientId: string;
  title: string;
  description: string;
  templateId: string;
  /**
   * Lifecycle stage. Always present on a case read through a repository —
   * both repositories normalize legacy rows/files (which only have `status`)
   * via `lib/caseStage.ts`'s `normalizeCase()` on every read. New cases start
   * at `draft` (see `pages/NewCase.tsx`, `lib/openCaseFromAdvisor.ts`).
   */
  stage: CaseStage;
  /** Set when `stage` is `closed`; a closed case with none prompts the agent for one when next opened. */
  outcome?: CaseOutcome;
  /** Pause flag, orthogonal to `stage` — a case can be on hold at any pre-lodgement/with-department stage. */
  onHold?: boolean;
  /** @deprecated legacy; read-only fallback for `normalizeCase()`. New code should read/write `stage`/`outcome`/`onHold` instead. */
  status?: CaseStatus;
  startDate: string;
  createdAt: string;
  userId?: string;
  /** TeamMember id of the responsible case owner. */
  caseOwner?: string;
  /** Ordered list of ownership changes for this case. */
  assignmentHistory?: CaseAssignmentEvent[];
  /** ID of the visa applicant — falls back to clientId if unset. clientId = engaging/paying party. */
  applicantId?: string;
  /**
   * Human-readable file reference, e.g. "EDM-2026-0001". Assigned on creation.
   * Optional because cases created before this field existed have none — use
   * `displayCaseNumber()` from lib/caseNumber.ts to render a stable fallback.
   */
  caseNumber?: string;
  /**
   * The visa subclass this case targets, e.g. "820". Set at creation from the
   * assessed pathway (Visa Advisor "Open Case") or the selected workflow
   * template's `visaSubclass` (New Case Intake). Optional because cases
   * created before this field existed have none — prefer this over looking
   * up the case's template's `visaSubclass` where both are available.
   */
  visaSubclass?: string;
}

// ---------------------------------------------------------------------------
// Visa Eligibility Advisor — persisted assessments
// ---------------------------------------------------------------------------

export type EligibilityVerdict = 'qualifies' | 'possibly_qualifies' | 'unlikely' | 'needs_more_info';

/** One assessed pathway in an `EligibilityAssessment.options` array. */
export interface EligibilityAssessmentOption {
  visaSubclass: string;
  visaName: string;
  verdict: EligibilityVerdict;
  reasons: string[];
  gaps: string[];
}

/** The wizard answers an `EligibilityAssessment` was generated from. */
export interface EligibilityAssessmentInputs {
  clientInfo: {
    fullName: string;
    dob: string;
    nationality: string;
    inAustralia: boolean;
    currentVisaStatus: string;
  };
  goals: {
    primaryPurpose: string;
    intendedDuration: string;
  };
  details: Record<string, any>;
  supportingFactors: {
    englishProficiency: string;
    healthConcerns: boolean;
    criminalHistory: boolean;
  };
}

/**
 * A saved Visa Eligibility Advisor report (GitHub issue #52/#55 follow-up).
 * Created whenever `/api/check-eligibility` returns a report, whether or not
 * a case is ever opened from it — `clientId` is set if the advisor was opened
 * from a client's page, and `caseId`/`selectedSubclass` are filled in later
 * if/when a case is opened from one of the assessed pathways. See
 * `repos.eligibility` and CLAUDE.md's "Local-First Storage" section.
 */
export interface EligibilityAssessment {
  id: string;
  clientId?: string;
  caseId?: string;
  createdAt: string; // ISO
  inputs: EligibilityAssessmentInputs;
  options: EligibilityAssessmentOption[];
  /** The subclass a case was actually opened for, once one has been. */
  selectedSubclass?: string;
  userId?: string;
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
export type CaseToolKind = 'checklist-generator' | 'auto-packager' | 'bundle-builder-820';

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
