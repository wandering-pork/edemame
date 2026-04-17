import { db } from '@/lib/dexieDb';
import { saveFile, readFile, deleteFile } from '@/lib/opfsStorage';
import type {
  Client,
  Case,
  Task,
  WorkflowTemplate,
  CaseNote,
  Document,
  Notification,
} from '@/types';
import type {
  IClientRepository,
  ICaseRepository,
  ITaskRepository,
  ITemplateRepository,
  ICaseNoteRepository,
  IDocumentRepository,
  INotificationRepository,
  Repositories,
} from '@/repositories/types';

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

class LocalClientRepository implements IClientRepository {
  async getAll(): Promise<Client[]> {
    return db.clients.toArray();
  }

  async getById(id: string): Promise<Client | undefined> {
    return db.clients.get(id);
  }

  async create(item: Client): Promise<Client> {
    await db.clients.put(item);
    return item;
  }

  async update(item: Client): Promise<Client> {
    await db.clients.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await db.clients.delete(id);
  }

  async search(query: string): Promise<Client[]> {
    const q = query.toLowerCase();
    return db.clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
      .toArray();
  }

  async createMany(items: Client[]): Promise<Client[]> {
    await db.clients.bulkPut(items);
    return items;
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

class LocalCaseRepository implements ICaseRepository {
  async getAll(): Promise<Case[]> {
    return db.cases.toArray();
  }

  async getById(id: string): Promise<Case | undefined> {
    return db.cases.get(id);
  }

  async create(item: Case): Promise<Case> {
    await db.cases.put(item);
    return item;
  }

  async update(item: Case): Promise<Case> {
    await db.cases.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await db.cases.delete(id);
  }

  async getByClientId(clientId: string): Promise<Case[]> {
    return db.cases.where('clientId').equals(clientId).toArray();
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

class LocalTaskRepository implements ITaskRepository {
  async getAll(): Promise<Task[]> {
    return db.tasks.toArray();
  }

  async getById(id: string): Promise<Task | undefined> {
    return db.tasks.get(id);
  }

  async create(item: Task): Promise<Task> {
    await db.tasks.put(item);
    return item;
  }

  async update(item: Task): Promise<Task> {
    await db.tasks.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await db.tasks.delete(id);
  }

  async getByCaseId(caseId: string): Promise<Task[]> {
    return db.tasks.where('caseId').equals(caseId).toArray();
  }

  async createMany(items: Task[]): Promise<Task[]> {
    await db.tasks.bulkPut(items);
    return items;
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

class LocalTemplateRepository implements ITemplateRepository {
  async getAll(): Promise<WorkflowTemplate[]> {
    return db.templates.toArray();
  }

  async getById(id: string): Promise<WorkflowTemplate | undefined> {
    return db.templates.get(id);
  }

  async create(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    await db.templates.put(item);
    return item;
  }

  async update(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    await db.templates.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await db.templates.delete(id);
  }

  async getSystemDefaults(): Promise<WorkflowTemplate[]> {
    return db.templates
      .filter((t) => t.userId === null || t.userId === undefined)
      .toArray();
  }
}

// ---------------------------------------------------------------------------
// Case Notes
// ---------------------------------------------------------------------------

class LocalCaseNoteRepository implements ICaseNoteRepository {
  async getByCaseId(caseId: string): Promise<CaseNote[]> {
    return db.caseNotes.where('caseId').equals(caseId).toArray();
  }

  async create(note: CaseNote): Promise<CaseNote> {
    await db.caseNotes.put(note);
    return note;
  }

  async delete(id: string): Promise<void> {
    await db.caseNotes.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Documents (metadata in Dexie, file blobs in OPFS)
// ---------------------------------------------------------------------------

class LocalDocumentRepository implements IDocumentRepository {
  async getByCaseId(caseId: string): Promise<Document[]> {
    return db.documents.where('caseId').equals(caseId).toArray();
  }

  async create(doc: Document, fileData: Blob): Promise<Document> {
    await saveFile(doc.filePath, fileData);
    await db.documents.put(doc);
    return doc;
  }

  async update(doc: Document): Promise<Document> {
    await db.documents.put(doc);
    return doc;
  }

  async getFileData(doc: Document): Promise<Blob | null> {
    return readFile(doc.filePath);
  }

  async delete(id: string): Promise<void> {
    const doc = await db.documents.get(id);
    if (doc) {
      await deleteFile(doc.filePath);
    }
    await db.documents.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

class LocalNotificationRepository implements INotificationRepository {
  async getAll(): Promise<Notification[]> {
    return db.notifications.toArray();
  }

  async create(notification: Notification): Promise<Notification> {
    await db.notifications.put(notification);
    return notification;
  }

  async markAsRead(id: string): Promise<void> {
    await db.notifications.update(id, { read: true });
  }

  async markAllAsRead(): Promise<void> {
    await db.notifications.toCollection().modify({ read: true });
  }

  async delete(id: string): Promise<void> {
    await db.notifications.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalRepositories(): Repositories {
  return {
    clients: new LocalClientRepository(),
    cases: new LocalCaseRepository(),
    tasks: new LocalTaskRepository(),
    templates: new LocalTemplateRepository(),
    caseNotes: new LocalCaseNoteRepository(),
    documents: new LocalDocumentRepository(),
    notifications: new LocalNotificationRepository(),
  };
}
