
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
}

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
