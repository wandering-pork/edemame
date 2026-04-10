
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
export type ViewMode = 'dashboard' | 'clients' | 'cases' | 'case-details' | 'templates' | 'settings';
