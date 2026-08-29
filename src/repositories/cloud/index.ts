import { supabase } from '@/lib/supabaseClient';
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
  DocumentType,
  FocusConversation,
  CasePointsClaim,
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
  IDocumentTypeRepository,
  IPointsClaimRepository,
  IChatRepository,
  Repositories,
} from '@/repositories/types';

// Every table carries a user_id column scoped by RLS to auth.uid(); the
// explicit .eq('user_id', userId) filters below are a second line of
// defense, kept for parity with how the filesystem repositories are
// written (every read/write is already scoped to "this user's data").

// Writes use .upsert(row, { onConflict: 'id' }) rather than insert/update.
// The filesystem repositories implement both create() and update() as an
// unconditional writeJson() — "write this record" — so upsert is the faithful
// equivalent, and it makes retries (e.g. a bulk copy resumed after a network
// blip) idempotent instead of failing with 23505 duplicate key.

// PostgREST caps a single response at max-rows (1000 by default) and truncates
// *silently* — no error, just a short array. Every list read therefore goes
// through fetchAllRows(), which pages with .range() until a short page comes
// back. Matters most for append-only activity_events and high-volume tasks /
// clients / cases, but applied uniformly so no read path can quietly lose rows.
const PAGE_SIZE = 1000;

async function fetchAllRows(table: string, filters: (q: any) => any, columns = '*'): Promise<any[]> {
  const rows: any[] = [];
  let from = 0;
  for (;;) {
    const query = filters(supabase.from(table).select(columns)).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function clientToRow(userId: string, c: Client) {
  return {
    id: c.id,
    user_id: userId,
    name: c.name,
    dob: c.dob,
    phone: c.phone,
    email: c.email,
    address: c.address,
    passport_number: c.passportNumber ?? null,
    passport_expiry: c.passportExpiry ?? null,
    nationality: c.nationality ?? null,
    gender: c.gender ?? null,
    passport_data: c.passportData ?? null,
    role: c.role ?? null,
    notes: c.notes ?? null,
  };
}

function rowToClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    dob: row.dob,
    phone: row.phone,
    email: row.email,
    address: row.address,
    passportNumber: row.passport_number ?? undefined,
    passportExpiry: row.passport_expiry ?? undefined,
    nationality: row.nationality ?? undefined,
    gender: row.gender ?? undefined,
    passportData: row.passport_data ?? undefined,
    userId: row.user_id,
    role: row.role ?? undefined,
    notes: row.notes ?? undefined,
  };
}

class CloudClientRepository implements IClientRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Client[]> {
    const rows = await fetchAllRows('clients', q => q.eq('user_id', this.userId));
    return rows.map(rowToClient);
  }

  async getById(id: string): Promise<Client | undefined> {
    const { data, error } = await supabase.from('clients').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToClient(data) : undefined;
  }

  async create(item: Client): Promise<Client> {
    const { error } = await supabase.from('clients').upsert(clientToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: Client): Promise<Client> {
    const { error } = await supabase.from('clients').upsert(clientToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('clients').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async search(query: string): Promise<Client[]> {
    const q = query.toLowerCase();
    const all = await this.getAll();
    return all.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }

  async createMany(items: Client[]): Promise<Client[]> {
    if (items.length === 0) return items;
    const { error } = await supabase.from('clients').upsert(items.map(i => clientToRow(this.userId, i)), { onConflict: 'id' });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

function caseToRow(userId: string, c: Case) {
  return {
    id: c.id,
    user_id: userId,
    client_id: c.clientId,
    title: c.title,
    description: c.description,
    template_id: c.templateId,
    status: c.status,
    start_date: c.startDate,
    created_at: c.createdAt,
    case_owner: c.caseOwner ?? null,
    assignment_history: c.assignmentHistory ?? null,
    applicant_id: c.applicantId ?? null,
  };
}

function rowToCase(row: any): Case {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description,
    templateId: row.template_id,
    status: row.status,
    startDate: row.start_date,
    createdAt: row.created_at,
    userId: row.user_id,
    caseOwner: row.case_owner ?? undefined,
    assignmentHistory: row.assignment_history ?? undefined,
    applicantId: row.applicant_id ?? undefined,
  };
}

class CloudCaseRepository implements ICaseRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Case[]> {
    const rows = await fetchAllRows('cases', q => q.eq('user_id', this.userId));
    return rows.map(rowToCase);
  }

  async getById(id: string): Promise<Case | undefined> {
    const { data, error } = await supabase.from('cases').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToCase(data) : undefined;
  }

  async create(item: Case): Promise<Case> {
    const { error } = await supabase.from('cases').upsert(caseToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: Case): Promise<Case> {
    const { error } = await supabase.from('cases').upsert(caseToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cases').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async getByClientId(clientId: string): Promise<Case[]> {
    const rows = await fetchAllRows('cases', q => q.eq('user_id', this.userId).eq('client_id', clientId));
    return rows.map(rowToCase);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function taskToRow(userId: string, t: Task) {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    description: t.description,
    date: t.date,
    is_completed: t.isCompleted,
    priority_order: t.priorityOrder,
    case_id: t.caseId ?? null,
    generated_by_ai: t.generatedByAi ?? null,
    assigned_to: t.assignedTo ?? null,
  };
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    isCompleted: row.is_completed,
    priorityOrder: row.priority_order,
    caseId: row.case_id ?? undefined,
    generatedByAi: row.generated_by_ai ?? undefined,
    userId: row.user_id,
    assignedTo: row.assigned_to ?? undefined,
  };
}

class CloudTaskRepository implements ITaskRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Task[]> {
    const rows = await fetchAllRows('tasks', q => q.eq('user_id', this.userId));
    return rows.map(rowToTask);
  }

  async getById(id: string): Promise<Task | undefined> {
    const { data, error } = await supabase.from('tasks').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToTask(data) : undefined;
  }

  async create(item: Task): Promise<Task> {
    const { error } = await supabase.from('tasks').upsert(taskToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: Task): Promise<Task> {
    const { error } = await supabase.from('tasks').upsert(taskToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async getByCaseId(caseId: string): Promise<Task[]> {
    const rows = await fetchAllRows('tasks', q => q.eq('user_id', this.userId).eq('case_id', caseId));
    return rows.map(rowToTask);
  }

  async createMany(items: Task[]): Promise<Task[]> {
    if (items.length === 0) return items;
    const { error } = await supabase.from('tasks').upsert(items.map(i => taskToRow(this.userId, i)), { onConflict: 'id' });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Templates — custom only; the 5 system defaults stay hardcoded in seedData.ts
// ---------------------------------------------------------------------------

function templateToRow(userId: string, t: WorkflowTemplate) {
  return {
    id: t.id,
    user_id: userId,
    title: t.title,
    description: t.description,
    visa_subclass: t.visaSubclass ?? null,
    steps: t.steps ?? null,
  };
}

function rowToTemplate(row: any): WorkflowTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visaSubclass: row.visa_subclass ?? undefined,
    steps: row.steps ?? undefined,
    userId: row.user_id,
  };
}

class CloudTemplateRepository implements ITemplateRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<WorkflowTemplate[]> {
    const rows = await fetchAllRows('workflow_templates', q => q.eq('user_id', this.userId));
    return rows.map(rowToTemplate);
  }

  async getById(id: string): Promise<WorkflowTemplate | undefined> {
    const { data, error } = await supabase.from('workflow_templates').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToTemplate(data) : undefined;
  }

  async create(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    // System defaults (userId: null) are seeded in-app, not written to the DB.
    if (item.userId === null) return item;
    const { error } = await supabase.from('workflow_templates').upsert(templateToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    const { error } = await supabase.from('workflow_templates').upsert(templateToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('workflow_templates').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async getSystemDefaults(): Promise<WorkflowTemplate[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Case Notes
// ---------------------------------------------------------------------------

function noteToRow(userId: string, n: CaseNote) {
  return {
    id: n.id,
    user_id: userId,
    case_id: n.caseId,
    content: n.content,
    created_at: n.createdAt,
  };
}

function rowToNote(row: any): CaseNote {
  return {
    id: row.id,
    caseId: row.case_id,
    content: row.content,
    createdAt: row.created_at,
    userId: row.user_id,
  };
}

class CloudCaseNoteRepository implements ICaseNoteRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<CaseNote[]> {
    const rows = await fetchAllRows('case_notes', q => q.eq('user_id', this.userId).eq('case_id', caseId));
    return rows.map(rowToNote);
  }

  async create(note: CaseNote): Promise<CaseNote> {
    const { error } = await supabase.from('case_notes').upsert(noteToRow(this.userId, note), { onConflict: 'id' });
    if (error) throw error;
    return note;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('case_notes').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Documents — metadata row + blob in the private 'documents' storage bucket.
// doc.filePath is already 'documents/{caseId}/{fileName}' (set by
// components/DocumentUpload.tsx), so the full object path is
// {userId}/documents/{caseId}/{fileName}.
// ---------------------------------------------------------------------------

function docToRow(userId: string, d: Document) {
  return {
    id: d.id,
    user_id: userId,
    case_id: d.caseId,
    file_name: d.fileName,
    file_path: d.filePath,
    file_type: d.fileType,
    file_size: d.fileSize,
    uploaded_at: d.uploadedAt,
    document_type_code: d.documentTypeCode ?? null,
    aspect_tag: d.aspectTag ?? null,
    evidence_note: d.evidenceNote ?? null,
  };
}

function rowToDoc(row: any): Document {
  return {
    id: row.id,
    caseId: row.case_id,
    fileName: row.file_name,
    filePath: row.file_path,
    fileType: row.file_type,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    userId: row.user_id,
    documentTypeCode: row.document_type_code ?? undefined,
    aspectTag: row.aspect_tag ?? undefined,
    evidenceNote: row.evidence_note ?? undefined,
  };
}

class CloudDocumentRepository implements IDocumentRepository {
  constructor(private userId: string) {}

  private storagePath(doc: Document): string {
    return `${this.userId}/${doc.filePath}`;
  }

  async getByCaseId(caseId: string): Promise<Document[]> {
    const rows = await fetchAllRows('documents', q => q.eq('user_id', this.userId).eq('case_id', caseId));
    return rows.map(rowToDoc);
  }

  async create(doc: Document, fileData: Blob): Promise<Document> {
    const { error: uploadError } = await supabase.storage.from('documents').upload(this.storagePath(doc), fileData, { upsert: true });
    if (uploadError) throw uploadError;
    const { error } = await supabase.from('documents').upsert(docToRow(this.userId, doc), { onConflict: 'id' });
    if (error) throw error;
    return doc;
  }

  async update(doc: Document): Promise<Document> {
    const { error } = await supabase.from('documents').upsert(docToRow(this.userId, doc), { onConflict: 'id' });
    if (error) throw error;
    return doc;
  }

  async getFileData(doc: Document): Promise<Blob | null> {
    const { data, error } = await supabase.storage.from('documents').download(this.storagePath(doc));
    if (error) {
      // Only a genuine "the object isn't there" answers null; anything else
      // (network failure, auth, bucket misconfig) throws, because callers such
      // as copyAllData() in migrate.ts treat null as "no file to copy" and
      // would otherwise silently drop a legal-evidence document. The SDK does
      // not expose a stable error code here, so we sniff status/message —
      // if the sniff is wrong we err towards throwing, which is recoverable
      // (a caller can catch and skip) where silent data loss is not.
      const status = (error as any)?.statusCode ?? (error as any)?.status;
      const isNotFound = String(status) === '404' || /not.?found|does not exist/i.test(error.message ?? '');
      if (isNotFound) return null;
      throw error;
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase.from('documents').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return;
    const doc = rowToDoc(data);
    const { error: removeError } = await supabase.storage.from('documents').remove([this.storagePath(doc)]);
    if (removeError) throw removeError;
    const { error: deleteError } = await supabase.from('documents').delete().eq('user_id', this.userId).eq('id', id);
    if (deleteError) throw deleteError;
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function notifToRow(userId: string, n: Notification) {
  return {
    id: n.id,
    user_id: userId,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    created_at: n.createdAt,
  };
}

function rowToNotif(row: any): Notification {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.created_at,
    userId: row.user_id,
  };
}

class CloudNotificationRepository implements INotificationRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<Notification[]> {
    const rows = await fetchAllRows('notifications', q => q.eq('user_id', this.userId));
    return rows.map(rowToNotif);
  }

  async create(notification: Notification): Promise<Notification> {
    const { error } = await supabase.from('notifications').upsert(notifToRow(this.userId, notification), { onConflict: 'id' });
    if (error) throw error;
    return notification;
  }

  async markAsRead(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async markAllAsRead(): Promise<void> {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', this.userId);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

function memberToRow(userId: string, m: TeamMember) {
  return {
    id: m.id,
    user_id: userId,
    name: m.name,
    email: m.email,
    avatar: m.avatar ?? null,
    role: m.role,
    case_count: m.caseCount,
    active_task_count: m.activeTaskCount,
    status: m.status,
    joined_at: m.joinedAt ?? null,
  };
}

function rowToMember(row: any): TeamMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar ?? undefined,
    role: row.role,
    caseCount: row.case_count,
    activeTaskCount: row.active_task_count,
    status: row.status,
    joinedAt: row.joined_at ?? undefined,
  };
}

class CloudTeamMemberRepository implements ITeamMemberRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<TeamMember[]> {
    const rows = await fetchAllRows('team_members', q => q.eq('user_id', this.userId));
    return rows.map(rowToMember);
  }

  async getById(id: string): Promise<TeamMember | undefined> {
    const { data, error } = await supabase.from('team_members').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToMember(data) : undefined;
  }

  async create(item: TeamMember): Promise<TeamMember> {
    const { error } = await supabase.from('team_members').upsert(memberToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: TeamMember): Promise<TeamMember> {
    const { error } = await supabase.from('team_members').upsert(memberToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('team_members').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Activity — append-only
// ---------------------------------------------------------------------------

function eventToRow(userId: string, e: ActivityEvent) {
  return {
    id: e.id,
    user_id: userId,
    type: e.type,
    actor_id: e.actorId ?? null,
    subject_id: e.subjectId ?? null,
    summary: e.summary,
    created_at: e.createdAt,
  };
}

function rowToEvent(row: any): ActivityEvent {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actor_id ?? undefined,
    subjectId: row.subject_id ?? undefined,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

class CloudActivityRepository implements IActivityRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<ActivityEvent[]> {
    const rows = await fetchAllRows('activity_events', q => q.eq('user_id', this.userId).order('created_at', { ascending: true }));
    return rows.map(rowToEvent);
  }

  async create(event: ActivityEvent): Promise<ActivityEvent> {
    const { error } = await supabase.from('activity_events').upsert(eventToRow(this.userId, event), { onConflict: 'id' });
    if (error) throw error;
    return event;
  }
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

function checklistToRow(userId: string, caseId: string, i: DocumentChecklistItem) {
  return {
    id: i.id,
    user_id: userId,
    case_id: caseId,
    label: i.label,
    description: i.description ?? null,
    status: i.status,
    linked_document_id: i.linkedDocumentId ?? null,
    required_for_subclass: i.requiredForSubclass ?? null,
    category: i.category ?? null,
    manually_added: i.manuallyAdded ?? null,
    document_type_code: i.documentTypeCode ?? null,
  };
}

function rowToChecklistItem(row: any): DocumentChecklistItem {
  return {
    id: row.id,
    caseId: row.case_id,
    label: row.label,
    description: row.description ?? undefined,
    status: row.status,
    linkedDocumentId: row.linked_document_id ?? undefined,
    requiredForSubclass: row.required_for_subclass ?? undefined,
    category: row.category ?? undefined,
    manuallyAdded: row.manually_added ?? undefined,
    documentTypeCode: row.document_type_code ?? undefined,
  };
}

/**
 * Replace the rows of `table` for one case with `rows`, without ever passing
 * through a state where the case has less data than either the old or the new
 * set: upsert everything incoming first, then prune only the ids that are no
 * longer present. Mirrors FsChatRepository.setForCase's keep-set diff — a
 * delete-then-insert would lose the whole checklist if the insert failed.
 */
async function replaceCaseRows(
  table: string,
  userId: string,
  caseId: string,
  rows: { id: string }[],
): Promise<void> {
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const existing = await fetchAllRows(table, q => q.eq('user_id', userId).eq('case_id', caseId), 'id');
  const keep = new Set(rows.map(r => r.id));
  const stale = existing.map(r => r.id).filter(id => !keep.has(id));
  if (stale.length === 0) return;
  const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('case_id', caseId).in('id', stale);
  if (error) throw error;
}

class CloudChecklistRepository implements IChecklistRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<DocumentChecklistItem[]> {
    const rows = await fetchAllRows('checklist_items', q => q.eq('user_id', this.userId).eq('case_id', caseId));
    return rows.map(rowToChecklistItem);
  }

  async setForCase(caseId: string, items: DocumentChecklistItem[]): Promise<void> {
    await replaceCaseRows('checklist_items', this.userId, caseId, items.map(i => checklistToRow(this.userId, caseId, i)));
  }
}

// ---------------------------------------------------------------------------
// Document Types — account-level reference list (no case_id)
// ---------------------------------------------------------------------------

function documentTypeToRow(userId: string, t: DocumentType) {
  return {
    id: t.id,
    user_id: userId,
    code: t.code,
    description: t.description,
    category: t.category,
    is_system_default: t.isSystemDefault,
    auto_link: t.autoLink,
  };
}

function rowToDocumentType(row: any): DocumentType {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    category: row.category,
    isSystemDefault: row.is_system_default,
    autoLink: row.auto_link,
    userId: row.user_id,
  };
}

class CloudDocumentTypeRepository implements IDocumentTypeRepository {
  constructor(private userId: string) {}

  async getAll(): Promise<DocumentType[]> {
    const rows = await fetchAllRows('document_types', q => q.eq('user_id', this.userId));
    return rows.map(rowToDocumentType);
  }

  async getById(id: string): Promise<DocumentType | undefined> {
    const { data, error } = await supabase.from('document_types').select('*').eq('user_id', this.userId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToDocumentType(data) : undefined;
  }

  async create(item: DocumentType): Promise<DocumentType> {
    const { error } = await supabase.from('document_types').upsert(documentTypeToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: DocumentType): Promise<DocumentType> {
    const { error } = await supabase.from('document_types').upsert(documentTypeToRow(this.userId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('document_types').delete().eq('user_id', this.userId).eq('id', id);
    if (error) throw error;
  }

  async createMany(items: DocumentType[]): Promise<DocumentType[]> {
    if (items.length === 0) return items;
    // onConflict on (user_id, code) rather than id: seeding races (two tabs
    // opening at once) would otherwise both mint a fresh uuid for the same
    // code and trip the unique constraint.
    const { error } = await supabase
      .from('document_types')
      .upsert(items.map(i => documentTypeToRow(this.userId, i)), { onConflict: 'user_id,code', ignoreDuplicates: true });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Points claims — one row per case
// ---------------------------------------------------------------------------

// The per-criterion entries ride along as a jsonb column rather than getting a
// child table of their own: they are only ever read and written as a complete
// set for one case (the same access pattern as `focus_conversations.messages`),
// and keeping them in one row makes the write atomic, so a half-saved claim
// can't show a total that never existed.
function pointsClaimToRow(userId: string, caseId: string, claim: CasePointsClaim) {
  return {
    id: claim.id,
    user_id: userId,
    case_id: caseId,
    subclass: claim.subclass,
    entries: claim.entries,
    updated_at: claim.updatedAt,
  };
}

function rowToPointsClaim(row: any): CasePointsClaim {
  return {
    id: row.id,
    caseId: row.case_id,
    subclass: row.subclass,
    entries: row.entries ?? [],
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

class CloudPointsClaimRepository implements IPointsClaimRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<CasePointsClaim | undefined> {
    const { data, error } = await supabase
      .from('points_claims')
      .select('*')
      .eq('user_id', this.userId)
      .eq('case_id', caseId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToPointsClaim(data) : undefined;
  }

  async setForCase(caseId: string, claim: CasePointsClaim): Promise<void> {
    // onConflict on (user_id, case_id), not id: a claim copied between storage
    // modes, or written from two tabs, must land on the case's single row
    // rather than trip the unique constraint with a second uuid.
    const { error } = await supabase
      .from('points_claims')
      .upsert(pointsClaimToRow(this.userId, caseId, claim), { onConflict: 'user_id,case_id' });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function conversationToRow(userId: string, caseId: string, c: FocusConversation) {
  return {
    id: c.id,
    user_id: userId,
    case_id: caseId,
    title: c.title,
    messages: c.messages,
    created_at: c.createdAt,
  };
}

function rowToConversation(row: any): FocusConversation {
  return {
    id: row.id,
    caseId: row.case_id,
    title: row.title,
    messages: row.messages ?? [],
    createdAt: row.created_at,
  };
}

class CloudChatRepository implements IChatRepository {
  constructor(private userId: string) {}

  async getByCaseId(caseId: string): Promise<FocusConversation[]> {
    const rows = await fetchAllRows('focus_conversations', q => q.eq('user_id', this.userId).eq('case_id', caseId));
    return rows.map(rowToConversation);
  }

  async setForCase(caseId: string, conversations: FocusConversation[]): Promise<void> {
    await replaceCaseRows('focus_conversations', this.userId, caseId, conversations.map(c => conversationToRow(this.userId, caseId, c)));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCloudRepositories(userId: string): Repositories {
  return {
    clients: new CloudClientRepository(userId),
    cases: new CloudCaseRepository(userId),
    tasks: new CloudTaskRepository(userId),
    templates: new CloudTemplateRepository(userId),
    caseNotes: new CloudCaseNoteRepository(userId),
    documents: new CloudDocumentRepository(userId),
    notifications: new CloudNotificationRepository(userId),
    teamMembers: new CloudTeamMemberRepository(userId),
    activity: new CloudActivityRepository(userId),
    checklist: new CloudChecklistRepository(userId),
    documentTypes: new CloudDocumentTypeRepository(userId),
    pointsClaims: new CloudPointsClaimRepository(userId),
    chat: new CloudChatRepository(userId),
  };
}
