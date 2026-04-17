
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

export type ChecklistItemStatus = 'pending' | 'uploaded' | 'verified' | 'waived';

export interface DocumentChecklistItem {
  id: string;
  caseId: string;
  label: string;
  description?: string;
  status: ChecklistItemStatus;
  linkedDocumentId?: string;
  requiredForSubclass?: string[];
}

// ---------------------------------------------------------------------------
// Focus Mode Chat
// ---------------------------------------------------------------------------

export interface FocusChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface FocusConversation {
  id: string;
  caseId: string;
  title: string;
  messages: FocusChatMessage[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// File System (Focus Mode workspace)
// ---------------------------------------------------------------------------

export interface FileTreeNode {
  name: string;
  kind: 'file' | 'directory';
  children?: FileTreeNode[];
  handle?: FileSystemFileHandle;
  size?: number;
}
