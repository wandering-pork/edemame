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

class OwnershipError extends Error {
  constructor(entity: string) {
    super(`Not permitted to modify this ${entity} — it belongs to another user.`);
    this.name = 'OwnershipError';
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

class LocalClientRepository implements IClientRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Client[]> {
    return db.clients.where('userId').equals(this.userId).toArray();
  }

  async getById(id: string): Promise<Client | undefined> {
    const item = await db.clients.get(id);
    return item && item.userId === this.userId ? item : undefined;
  }

  async create(item: Client): Promise<Client> {
    const owned = { ...item, userId: item.userId ?? this.userId };
    await db.clients.put(owned);
    return owned;
  }

  async update(item: Client): Promise<Client> {
    const existing = await db.clients.get(item.id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('client');
    await db.clients.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    const existing = await db.clients.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('client');
    await db.clients.delete(id);
  }

  async search(query: string): Promise<Client[]> {
    const q = query.toLowerCase();
    return db.clients
      .where('userId')
      .equals(this.userId)
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      )
      .toArray();
  }

  async createMany(items: Client[]): Promise<Client[]> {
    const owned = items.map(item => ({ ...item, userId: item.userId ?? this.userId }));
    await db.clients.bulkPut(owned);
    return owned;
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

class LocalCaseRepository implements ICaseRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Case[]> {
    return db.cases.where('userId').equals(this.userId).toArray();
  }

  async getById(id: string): Promise<Case | undefined> {
    const item = await db.cases.get(id);
    return item && item.userId === this.userId ? item : undefined;
  }

  async create(item: Case): Promise<Case> {
    const owned = { ...item, userId: item.userId ?? this.userId };
    await db.cases.put(owned);
    return owned;
  }

  async update(item: Case): Promise<Case> {
    const existing = await db.cases.get(item.id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('case');
    await db.cases.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    const existing = await db.cases.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('case');
    await db.cases.delete(id);
  }

  async getByClientId(clientId: string): Promise<Case[]> {
    return db.cases
      .where('clientId')
      .equals(clientId)
      .filter(c => c.userId === this.userId)
      .toArray();
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

class LocalTaskRepository implements ITaskRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Task[]> {
    return db.tasks.where('userId').equals(this.userId).toArray();
  }

  async getById(id: string): Promise<Task | undefined> {
    const item = await db.tasks.get(id);
    return item && item.userId === this.userId ? item : undefined;
  }

  async create(item: Task): Promise<Task> {
    const owned = { ...item, userId: item.userId ?? this.userId };
    await db.tasks.put(owned);
    return owned;
  }

  async update(item: Task): Promise<Task> {
    const existing = await db.tasks.get(item.id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('task');
    await db.tasks.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    const existing = await db.tasks.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('task');
    await db.tasks.delete(id);
  }

  async getByCaseId(caseId: string): Promise<Task[]> {
    return db.tasks
      .where('caseId')
      .equals(caseId)
      .filter(t => t.userId === this.userId)
      .toArray();
  }

  async createMany(items: Task[]): Promise<Task[]> {
    const owned = items.map(item => ({ ...item, userId: item.userId ?? this.userId }));
    await db.tasks.bulkPut(owned);
    return owned;
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

class LocalTemplateRepository implements ITemplateRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<WorkflowTemplate[]> {
    return db.templates
      .filter(t => t.userId === this.userId || t.userId === null)
      .toArray();
  }

  async getById(id: string): Promise<WorkflowTemplate | undefined> {
    const item = await db.templates.get(id);
    return item && (item.userId === this.userId || item.userId === null) ? item : undefined;
  }

  async create(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    const owned = { ...item, userId: item.userId === undefined ? this.userId : item.userId };
    await db.templates.put(owned);
    return owned;
  }

  async update(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    const existing = await db.templates.get(item.id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('template');
    await db.templates.put(item);
    return item;
  }

  async delete(id: string): Promise<void> {
    const existing = await db.templates.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('template');
    await db.templates.delete(id);
  }

  async getSystemDefaults(): Promise<WorkflowTemplate[]> {
    return db.templates
      .filter((t) => t.userId === null)
      .toArray();
  }
}

// ---------------------------------------------------------------------------
// Case Notes
// ---------------------------------------------------------------------------

class LocalCaseNoteRepository implements ICaseNoteRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<CaseNote[]> {
    return db.caseNotes
      .where('caseId')
      .equals(caseId)
      .filter(n => n.userId === this.userId)
      .toArray();
  }

  async create(note: CaseNote): Promise<CaseNote> {
    const owned = { ...note, userId: note.userId ?? this.userId };
    await db.caseNotes.put(owned);
    return owned;
  }

  async delete(id: string): Promise<void> {
    const existing = await db.caseNotes.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('case note');
    await db.caseNotes.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Documents (metadata in Dexie, file blobs in OPFS)
// ---------------------------------------------------------------------------

class LocalDocumentRepository implements IDocumentRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<Document[]> {
    return db.documents
      .where('caseId')
      .equals(caseId)
      .filter(d => d.userId === this.userId)
      .toArray();
  }

  async create(doc: Document, fileData: Blob): Promise<Document> {
    const owned = { ...doc, userId: doc.userId ?? this.userId };
    await saveFile(owned.filePath, fileData);
    await db.documents.put(owned);
    return owned;
  }

  async update(doc: Document): Promise<Document> {
    const existing = await db.documents.get(doc.id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('document');
    await db.documents.put(doc);
    return doc;
  }

  async getFileData(doc: Document): Promise<Blob | null> {
    if (doc.userId !== this.userId) throw new OwnershipError('document');
    return readFile(doc.filePath);
  }

  async delete(id: string): Promise<void> {
    const doc = await db.documents.get(id);
    if (!doc || doc.userId !== this.userId) throw new OwnershipError('document');
    await deleteFile(doc.filePath);
    await db.documents.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

class LocalNotificationRepository implements INotificationRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Notification[]> {
    return db.notifications.where('userId').equals(this.userId).toArray();
  }

  async create(notification: Notification): Promise<Notification> {
    const owned = { ...notification, userId: notification.userId ?? this.userId };
    await db.notifications.put(owned);
    return owned;
  }

  async markAsRead(id: string): Promise<void> {
    const existing = await db.notifications.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('notification');
    await db.notifications.update(id, { read: true });
  }

  async markAllAsRead(): Promise<void> {
    await db.notifications.where('userId').equals(this.userId).modify({ read: true });
  }

  async delete(id: string): Promise<void> {
    const existing = await db.notifications.get(id);
    if (!existing || existing.userId !== this.userId) throw new OwnershipError('notification');
    await db.notifications.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalRepositories(userId: string): Repositories {
  return {
    clients: new LocalClientRepository(userId),
    cases: new LocalCaseRepository(userId),
    tasks: new LocalTaskRepository(userId),
    templates: new LocalTemplateRepository(userId),
    caseNotes: new LocalCaseNoteRepository(userId),
    documents: new LocalDocumentRepository(userId),
    notifications: new LocalNotificationRepository(userId),
  };
}
