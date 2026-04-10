import type { Task, Case, Client, WorkflowTemplate, CaseNote, Document, Notification } from '../types';

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

export interface Repositories {
  clients: IClientRepository;
  cases: ICaseRepository;
  tasks: ITaskRepository;
  templates: ITemplateRepository;
  caseNotes: ICaseNoteRepository;
  documents: IDocumentRepository;
  notifications: INotificationRepository;
}
