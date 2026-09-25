import type { Task, Case, Client, WorkflowTemplate, CaseNote, Document, Notification, TeamMember, ActivityEvent, DocumentChecklistItem, DocumentType, FocusConversation, UsageEvent, EligibilityAssessment, Deadline } from '../types';

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
  delete(id: string): Promise<void>;
}

export interface IUsageRepository {
  getAll(): Promise<UsageEvent[]>;
  create(event: UsageEvent): Promise<UsageEvent>;
  delete(id: string): Promise<void>;
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

export interface IChatRepository {
  getByCaseId(caseId: string): Promise<FocusConversation[]>;
  setForCase(caseId: string, conversations: FocusConversation[]): Promise<void>;
}

/**
 * Persisted Visa Eligibility Advisor reports. Not scoped to a case the way
 * `caseNotes`/`documents` are — a record may exist with no `caseId` yet (an
 * assessment nobody has opened a case from) — so it gets its own `getAll`
 * rather than living only behind `getByCaseId`.
 */
export interface IEligibilityRepository extends IRepository<EligibilityAssessment> {
  getByCaseId(caseId: string): Promise<EligibilityAssessment[]>;
  getByClientId(clientId: string): Promise<EligibilityAssessment[]>;
}

/**
 * `Deadline` entity (Step 1 · 1D). Not scoped to a case the way `caseNotes`/
 * `documents` are — a deadline may be client-level only (e.g. passport
 * expiry, once that stops being purely derived) — so it gets its own
 * `getAll` rather than living only behind `getByCaseId`, same reasoning as
 * `IEligibilityRepository`.
 */
export interface IDeadlineRepository extends IRepository<Deadline> {
  getByCaseId(caseId: string): Promise<Deadline[]>;
  getByClientId(clientId: string): Promise<Deadline[]>;
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
  usage: IUsageRepository;
  checklist: IChecklistRepository;
  documentTypes: IDocumentTypeRepository;
  chat: IChatRepository;
  eligibility: IEligibilityRepository;
  deadlines: IDeadlineRepository;
  /**
   * Called by `repositories/migrate.ts`'s `clearAll()` before it deletes
   * anything; throws if wiping this destination isn't safe. Cloud
   * repositories are scoped to a firm that may be shared, so they refuse
   * unless the signed-in user is its only active member (Step 1 · 1G.1).
   * Local folders belong to one person by construction and don't set it.
   */
  assertSafeToClear?: () => Promise<void>;
}
