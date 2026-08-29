import type { Task, Case, Client, WorkflowTemplate, CaseNote, Document, Notification, TeamMember, ActivityEvent, DocumentChecklistItem, DocumentType, FocusConversation, LmtAdRecord } from '../types';

// Generic CRUD interface
export interface IRepository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | undefined>;
  create(item: T): Promise<T>;
  update(item: T): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface IClientRepository extends IRepository<Client> {
  search(query: string): Promise<Client[]>;
  createMany(items: Client[]): Promise<Client[]>;
}

export interface ICaseRepository extends IRepository<Case> {
  getByClientId(clientId: string): Promise<Case[]>;
}

export interface ITaskRepository extends IRepository<Task> {
  getByCaseId(caseId: string): Promise<Task[]>;
  createMany(items: Task[]): Promise<Task[]>;
}

export interface ITemplateRepository extends IRepository<WorkflowTemplate> {
  getSystemDefaults(): Promise<WorkflowTemplate[]>;
}

export interface ICaseNoteRepository {
  getByCaseId(caseId: string): Promise<CaseNote[]>;
  create(note: CaseNote): Promise<CaseNote>;
  delete(id: string): Promise<void>;
}

export interface IDocumentRepository {
  getByCaseId(caseId: string): Promise<Document[]>;
  create(doc: Document, fileData: Blob): Promise<Document>;
  /** Update document metadata (e.g. aspect tag, evidence note). Does not touch the file blob. */
  update(doc: Document): Promise<Document>;
  getFileData(doc: Document): Promise<Blob | null>;
  delete(id: string): Promise<void>;
}

export interface INotificationRepository {
  getAll(): Promise<Notification[]>;
  create(notification: Notification): Promise<Notification>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ITeamMemberRepository extends IRepository<TeamMember> {}

export interface IActivityRepository {
  getAll(): Promise<ActivityEvent[]>;
  create(event: ActivityEvent): Promise<ActivityEvent>;
}

export interface IChecklistRepository {
  getByCaseId(caseId: string): Promise<DocumentChecklistItem[]>;
  setForCase(caseId: string, items: DocumentChecklistItem[]): Promise<void>;
}

/**
 * Account-level Document Type reference list — not scoped to a case.
 * System-default rows are seeded by `lib/documentTypes.ts`'s
 * `ensureSystemDocumentTypes()`; the repository itself enforces no locking,
 * that's an application-layer rule (see `contexts/DocumentTypeContext.tsx`).
 */
export interface IDocumentTypeRepository extends IRepository<DocumentType> {
  createMany(items: DocumentType[]): Promise<DocumentType[]>;
}

/**
 * Labour Market Testing ad records, scoped to a case (GitHub issue #31).
 * Shaped like `ICaseNoteRepository` — a case-scoped collection with no
 * account-level `getAll()` — plus `update()`, because a user correcting an
 * OCR-extracted closing date is the expected path, not the exception.
 */
export interface ILmtAdRepository {
  getByCaseId(caseId: string): Promise<LmtAdRecord[]>;
  create(record: LmtAdRecord): Promise<LmtAdRecord>;
  update(record: LmtAdRecord): Promise<LmtAdRecord>;
  delete(id: string): Promise<void>;
}

export interface IChatRepository {
  getByCaseId(caseId: string): Promise<FocusConversation[]>;
  setForCase(caseId: string, conversations: FocusConversation[]): Promise<void>;
}

export interface Repositories {
  clients: IClientRepository;
  cases: ICaseRepository;
  tasks: ITaskRepository;
  templates: ITemplateRepository;
  caseNotes: ICaseNoteRepository;
  documents: IDocumentRepository;
  notifications: INotificationRepository;
  teamMembers: ITeamMemberRepository;
  activity: IActivityRepository;
  checklist: IChecklistRepository;
  documentTypes: IDocumentTypeRepository;
  lmtAds: ILmtAdRepository;
  chat: IChatRepository;
}
