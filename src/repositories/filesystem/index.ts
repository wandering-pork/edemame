import { readJson, writeJson, deleteEntry, listFiles, listDirNames, writeBlob, readBlob } from '@/lib/fsStorage';
import type {
  Client,
  Case,
  Task,
  WorkflowTemplate,
  CaseNote,
  Document,
  Notification,
  TeamMember,
  ActivityEvent,
  DocumentChecklistItem,
  FocusConversation,
} from '@/types';
import type {
  IClientRepository,
  ICaseRepository,
  ITaskRepository,
  ITemplateRepository,
  ICaseNoteRepository,
  IDocumentRepository,
  INotificationRepository,
  ITeamMemberRepository,
  IActivityRepository,
  IChecklistRepository,
  IChatRepository,
  Repositories,
} from '@/repositories/types';

// Every entity here belongs to exactly one user by construction — it's their
// linked folder — so there's no ownership filtering to do, unlike the old
// Dexie repositories which shared one browser-wide database across users.

async function readAllInDir<T>(root: FileSystemDirectoryHandle, dir: string): Promise<T[]> {
  const files = await listFiles(root, dir);
  const items = await Promise.all(files.map(f => readJson<T>(root, `${dir}/${f}`)));
  return items.filter((i): i is NonNullable<typeof i> => i !== null);
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

class FsClientRepository implements IClientRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<Client[]> {
    return readAllInDir<Client>(this.root, 'clients');
  }

  async getById(id: string): Promise<Client | undefined> {
    return (await readJson<Client>(this.root, `clients/${id}.json`)) ?? undefined;
  }

  async create(item: Client): Promise<Client> {
    await writeJson(this.root, `clients/${item.id}.json`, item);
    return item;
  }

  async update(item: Client): Promise<Client> {
    await writeJson(this.root, `clients/${item.id}.json`, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `clients/${id}.json`);
  }

  async search(query: string): Promise<Client[]> {
    const q = query.toLowerCase();
    const all = await this.getAll();
    return all.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }

  async createMany(items: Client[]): Promise<Client[]> {
    await Promise.all(items.map(item => this.create(item)));
    return items;
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

class FsCaseRepository implements ICaseRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<Case[]> {
    return readAllInDir<Case>(this.root, 'cases');
  }

  async getById(id: string): Promise<Case | undefined> {
    return (await readJson<Case>(this.root, `cases/${id}.json`)) ?? undefined;
  }

  async create(item: Case): Promise<Case> {
    await writeJson(this.root, `cases/${item.id}.json`, item);
    return item;
  }

  async update(item: Case): Promise<Case> {
    await writeJson(this.root, `cases/${item.id}.json`, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `cases/${id}.json`);
  }

  async getByClientId(clientId: string): Promise<Case[]> {
    const all = await this.getAll();
    return all.filter(c => c.clientId === clientId);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

class FsTaskRepository implements ITaskRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<Task[]> {
    return readAllInDir<Task>(this.root, 'tasks');
  }

  async getById(id: string): Promise<Task | undefined> {
    return (await readJson<Task>(this.root, `tasks/${id}.json`)) ?? undefined;
  }

  async create(item: Task): Promise<Task> {
    await writeJson(this.root, `tasks/${item.id}.json`, item);
    return item;
  }

  async update(item: Task): Promise<Task> {
    await writeJson(this.root, `tasks/${item.id}.json`, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `tasks/${id}.json`);
  }

  async getByCaseId(caseId: string): Promise<Task[]> {
    const all = await this.getAll();
    return all.filter(t => t.caseId === caseId);
  }

  async createMany(items: Task[]): Promise<Task[]> {
    await Promise.all(items.map(item => this.create(item)));
    return items;
  }
}

// ---------------------------------------------------------------------------
// Templates — custom only; the 5 system defaults stay hardcoded in seedData.ts
// ---------------------------------------------------------------------------

class FsTemplateRepository implements ITemplateRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<WorkflowTemplate[]> {
    return readAllInDir<WorkflowTemplate>(this.root, 'templates');
  }

  async getById(id: string): Promise<WorkflowTemplate | undefined> {
    return (await readJson<WorkflowTemplate>(this.root, `templates/${id}.json`)) ?? undefined;
  }

  async create(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    // System defaults (userId: null) are seeded in-app, not written to disk.
    if (item.userId === null) return item;
    await writeJson(this.root, `templates/${item.id}.json`, item);
    return item;
  }

  async update(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    await writeJson(this.root, `templates/${item.id}.json`, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `templates/${id}.json`);
  }

  async getSystemDefaults(): Promise<WorkflowTemplate[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Case Notes
// ---------------------------------------------------------------------------

class FsCaseNoteRepository implements ICaseNoteRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getByCaseId(caseId: string): Promise<CaseNote[]> {
    return readAllInDir<CaseNote>(this.root, `case-notes/${caseId}`);
  }

  async create(note: CaseNote): Promise<CaseNote> {
    await writeJson(this.root, `case-notes/${note.caseId}/${note.id}.json`, note);
    return note;
  }

  async delete(id: string): Promise<void> {
    const caseDirs = await listDirNames(this.root, 'case-notes');
    for (const caseId of caseDirs) {
      const note = await readJson<CaseNote>(this.root, `case-notes/${caseId}/${id}.json`);
      if (note) {
        await deleteEntry(this.root, `case-notes/${caseId}/${id}.json`);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Documents — metadata as JSON, file bytes at doc.filePath (real files now,
// replacing OPFS; DocumentUpload.tsx already sets filePath to
// `documents/{caseId}/{fileName}`).
// ---------------------------------------------------------------------------

class FsDocumentRepository implements IDocumentRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getByCaseId(caseId: string): Promise<Document[]> {
    return readAllInDir<Document>(this.root, `documents-meta/${caseId}`);
  }

  async create(doc: Document, fileData: Blob): Promise<Document> {
    await writeBlob(this.root, doc.filePath, fileData);
    await writeJson(this.root, `documents-meta/${doc.caseId}/${doc.id}.json`, doc);
    return doc;
  }

  async update(doc: Document): Promise<Document> {
    await writeJson(this.root, `documents-meta/${doc.caseId}/${doc.id}.json`, doc);
    return doc;
  }

  async getFileData(doc: Document): Promise<Blob | null> {
    return readBlob(this.root, doc.filePath);
  }

  async delete(id: string): Promise<void> {
    const caseDirs = await listDirNames(this.root, 'documents-meta');
    for (const caseId of caseDirs) {
      const doc = await readJson<Document>(this.root, `documents-meta/${caseId}/${id}.json`);
      if (doc) {
        await deleteEntry(this.root, doc.filePath);
        await deleteEntry(this.root, `documents-meta/${caseId}/${id}.json`);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

class FsNotificationRepository implements INotificationRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<Notification[]> {
    return readAllInDir<Notification>(this.root, 'notifications');
  }

  async create(notification: Notification): Promise<Notification> {
    await writeJson(this.root, `notifications/${notification.id}.json`, notification);
    return notification;
  }

  async markAsRead(id: string): Promise<void> {
    const n = await readJson<Notification>(this.root, `notifications/${id}.json`);
    if (n) await writeJson(this.root, `notifications/${id}.json`, { ...n, read: true });
  }

  async markAllAsRead(): Promise<void> {
    const all = await this.getAll();
    await Promise.all(all.map(n => writeJson(this.root, `notifications/${n.id}.json`, { ...n, read: true })));
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `notifications/${id}.json`);
  }
}

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

class FsTeamMemberRepository implements ITeamMemberRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<TeamMember[]> {
    return readAllInDir<TeamMember>(this.root, 'team-members');
  }

  async getById(id: string): Promise<TeamMember | undefined> {
    return (await readJson<TeamMember>(this.root, `team-members/${id}.json`)) ?? undefined;
  }

  async create(item: TeamMember): Promise<TeamMember> {
    await writeJson(this.root, `team-members/${item.id}.json`, item);
    return item;
  }

  async update(item: TeamMember): Promise<TeamMember> {
    await writeJson(this.root, `team-members/${item.id}.json`, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    await deleteEntry(this.root, `team-members/${id}.json`);
  }
}

// ---------------------------------------------------------------------------
// Activity — append-only, one file per event, no cap
// ---------------------------------------------------------------------------

class FsActivityRepository implements IActivityRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getAll(): Promise<ActivityEvent[]> {
    const events = await readAllInDir<ActivityEvent>(this.root, 'activity-events');
    return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(event: ActivityEvent): Promise<ActivityEvent> {
    await writeJson(this.root, `activity-events/${event.createdAt}-${event.id}.json`, event);
    return event;
  }
}

// ---------------------------------------------------------------------------
// Checklist — one array-file per case
// ---------------------------------------------------------------------------

class FsChecklistRepository implements IChecklistRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getByCaseId(caseId: string): Promise<DocumentChecklistItem[]> {
    return (await readJson<DocumentChecklistItem[]>(this.root, `checklist/${caseId}.json`)) ?? [];
  }

  async setForCase(caseId: string, items: DocumentChecklistItem[]): Promise<void> {
    await writeJson(this.root, `checklist/${caseId}.json`, items);
  }
}

// ---------------------------------------------------------------------------
// Chat — one file per conversation, nested under the case
// ---------------------------------------------------------------------------

class FsChatRepository implements IChatRepository {
  constructor(private root: FileSystemDirectoryHandle) {}

  async getByCaseId(caseId: string): Promise<FocusConversation[]> {
    return readAllInDir<FocusConversation>(this.root, `chat/${caseId}`);
  }

  async setForCase(caseId: string, conversations: FocusConversation[]): Promise<void> {
    const existing = await listFiles(this.root, `chat/${caseId}`);
    const keep = new Set(conversations.map(c => `${c.id}.json`));
    await Promise.all(
      existing.filter(f => !keep.has(f)).map(f => deleteEntry(this.root, `chat/${caseId}/${f}`)),
    );
    await Promise.all(
      conversations.map(c => writeJson(this.root, `chat/${caseId}/${c.id}.json`, c)),
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFilesystemRepositories(root: FileSystemDirectoryHandle): Repositories {
  return {
    clients: new FsClientRepository(root),
    cases: new FsCaseRepository(root),
    tasks: new FsTaskRepository(root),
    templates: new FsTemplateRepository(root),
    caseNotes: new FsCaseNoteRepository(root),
    documents: new FsDocumentRepository(root),
    notifications: new FsNotificationRepository(root),
    teamMembers: new FsTeamMemberRepository(root),
    activity: new FsActivityRepository(root),
    checklist: new FsChecklistRepository(root),
    chat: new FsChatRepository(root),
  };
}
