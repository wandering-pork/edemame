import Dexie, { type Table } from 'dexie';
import type {
  Client,
  Case,
  Task,
  WorkflowTemplate,
  CaseNote,
  Document,
  Notification,
} from '@/types';

class EdamameDB extends Dexie {
  clients!: Table<Client, string>;
  cases!: Table<Case, string>;
  tasks!: Table<Task, string>;
  templates!: Table<WorkflowTemplate, string>;
  caseNotes!: Table<CaseNote, string>;
  documents!: Table<Document, string>;
  notifications!: Table<Notification, string>;

  constructor() {
    super('edamame');

    this.version(1).stores({
      clients: 'id, name, email, phone, userId',
      cases: 'id, clientId, status, userId',
      tasks: 'id, caseId, date, userId',
      templates: 'id, userId, visaSubclass',
      caseNotes: 'id, caseId, createdAt',
      documents: 'id, caseId, uploadedAt',
      notifications: 'id, createdAt, read',
    });

    // v2: add userId index to tables that need per-user data isolation
    this.version(2).stores({
      clients: 'id, name, email, phone, userId',
      cases: 'id, clientId, status, userId',
      tasks: 'id, caseId, date, userId',
      templates: 'id, userId, visaSubclass',
      caseNotes: 'id, caseId, createdAt, userId',
      documents: 'id, caseId, uploadedAt, userId',
      notifications: 'id, createdAt, read, userId',
    });
  }
}

export const db = new EdamameDB();
