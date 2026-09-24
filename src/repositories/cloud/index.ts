import { supabase } from '@/lib/supabaseClient';
import { normalizeTask } from '@/lib/taskStatus';
import { normalizeTemplate } from '@/lib/templateTiming';
import { generateCaseNumber } from '@/lib/caseNumber';
import { normalizeCase, deriveLegacyStatus } from '@/lib/caseStage';
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
  UsageEvent,
  EligibilityAssessment,
  Deadline,
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
  IUsageRepository,
  IChecklistRepository,
  IDocumentTypeRepository,
  IChatRepository,
  IEligibilityRepository,
  IDeadlineRepository,
  Repositories,
} from '@/repositories/types';

// Step 1 · 1F: every table below except `notifications` is firm-scoped —
// `.eq('firm_id', this.firmId)` replaces the old `.eq('user_id', this.userId)`
// as the query filter (RLS enforces the same thing server-side; this is the
// second line of defense, kept for parity with how it was written before).
// `user_id` stays on every row as "created by", for audit — every insert
// still sets it, it's just no longer the scoping column.
// `notifications` stays per-user (each member gets their own alerts — see
// the firms migration's "Deliberately NOT firm-scoped" comment).

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

function clientToRow(userId: string, firmId: string, c: Client) {
  return {
    id: c.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<Client[]> {
    const rows = await fetchAllRows('clients', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToClient);
  }

  async getById(id: string): Promise<Client | undefined> {
    const { data, error } = await supabase.from('clients').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToClient(data) : undefined;
  }

  async create(item: Client): Promise<Client> {
    const { error } = await supabase.from('clients').upsert(clientToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: Client): Promise<Client> {
    const { error } = await supabase.from('clients').upsert(clientToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('clients').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async search(query: string): Promise<Client[]> {
    const q = query.toLowerCase();
    const all = await this.getAll();
    return all.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }

  async createMany(items: Client[]): Promise<Client[]> {
    if (items.length === 0) return items;
    const { error } = await supabase.from('clients').upsert(items.map(i => clientToRow(this.userId, this.firmId, i)), { onConflict: 'id' });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

function caseToRow(userId: string, firmId: string, c: Case) {
  const normalized = normalizeCase(c);
  return {
    id: normalized.id,
    user_id: userId,
    firm_id: firmId,
    client_id: normalized.clientId,
    title: normalized.title,
    description: normalized.description,
    template_id: normalized.templateId,
    // `stage`/`outcome`/`on_hold` columns added by
    // `supabase/migrations/20260926000050_add_case_stage.sql`.
    // `status` is kept for one release as a derived mirror so any remaining
    // reader of the legacy column keeps working — see `deriveLegacyStatus()`.
    stage: normalized.stage,
    outcome: normalized.outcome ?? null,
    on_hold: normalized.onHold ?? false,
    status: deriveLegacyStatus(normalized),
    start_date: normalized.startDate,
    created_at: normalized.createdAt,
    case_owner: normalized.caseOwner ?? null,
    assignment_history: normalized.assignmentHistory ?? null,
    applicant_id: normalized.applicantId ?? null,
    case_number: normalized.caseNumber ?? null,
    visa_subclass: normalized.visaSubclass ?? null,
  };
}

function rowToCase(row: any): Case {
  return normalizeCase({
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    description: row.description,
    templateId: row.template_id,
    stage: row.stage ?? undefined,
    outcome: row.outcome ?? undefined,
    onHold: row.on_hold ?? undefined,
    status: row.status ?? undefined,
    startDate: row.start_date,
    createdAt: row.created_at,
    userId: row.user_id,
    caseOwner: row.case_owner ?? undefined,
    assignmentHistory: row.assignment_history ?? undefined,
    applicantId: row.applicant_id ?? undefined,
    caseNumber: row.case_number ?? undefined,
    visaSubclass: row.visa_subclass ?? undefined,
  });
}

function isCaseNumberConflict(error: any): boolean {
  return error?.code === '23505' && /case_number/i.test(error?.message ?? error?.details ?? '');
}

class CloudCaseRepository implements ICaseRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<Case[]> {
    const rows = await fetchAllRows('cases', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToCase);
  }

  async getById(id: string): Promise<Case | undefined> {
    const { data, error } = await supabase.from('cases').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToCase(data) : undefined;
  }

  // Case numbers are minted client-side from an in-memory scan
  // (lib/caseNumber.ts) — cheap and correct for a single writer, but two firm
  // members creating cases in the same instant can compute the same "next"
  // number. A partial unique index on (firm_id, case_number)
  // (supabase/migrations/20260926000400_case_number_unique.sql) turns that
  // collision into a rejected insert instead of two cases silently sharing a
  // number; we catch it here and retry once with a freshly regenerated
  // number. KNOWN GAP: not airtight against a third concurrent writer landing
  // in the same narrow window — see the migration's comment.
  async create(item: Case): Promise<Case> {
    let toInsert = normalizeCase(item);
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('cases').upsert(caseToRow(this.userId, this.firmId, toInsert), { onConflict: 'id' });
      if (!error) return toInsert;
      if (!isCaseNumberConflict(error) || attempt === 2) throw error;
      const existing = await this.getAll();
      toInsert = { ...toInsert, caseNumber: generateCaseNumber(existing) };
    }
    return toInsert;
  }

  async update(item: Case): Promise<Case> {
    const normalized = normalizeCase(item);
    const { error } = await supabase.from('cases').upsert(caseToRow(this.userId, this.firmId, normalized), { onConflict: 'id' });
    if (error) throw error;
    return normalized;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cases').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async getByClientId(clientId: string): Promise<Case[]> {
    const rows = await fetchAllRows('cases', q => q.eq('firm_id', this.firmId).eq('client_id', clientId));
    return rows.map(rowToCase);
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

function taskToRow(userId: string, firmId: string, t: Task) {
  const task = normalizeTask(t);
  return {
    id: task.id,
    user_id: userId,
    firm_id: firmId,
    title: task.title,
    description: task.description,
    date: task.date,
    is_completed: task.isCompleted,
    status: task.status,
    status_reason: task.statusReason ?? null,
    priority_order: task.priorityOrder,
    case_id: task.caseId ?? null,
    generated_by_ai: task.generatedByAi ?? null,
    assigned_to: task.assignedTo ?? null,
  };
}

function rowToTask(row: any): Task {
  return normalizeTask({
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    isCompleted: row.is_completed,
    status: row.status ?? undefined,
    statusReason: row.status_reason ?? undefined,
    priorityOrder: row.priority_order,
    caseId: row.case_id ?? undefined,
    generatedByAi: row.generated_by_ai ?? undefined,
    userId: row.user_id,
    assignedTo: row.assigned_to ?? undefined,
  });
}

class CloudTaskRepository implements ITaskRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<Task[]> {
    const rows = await fetchAllRows('tasks', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToTask);
  }

  async getById(id: string): Promise<Task | undefined> {
    const { data, error } = await supabase.from('tasks').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToTask(data) : undefined;
  }

  async create(item: Task): Promise<Task> {
    const normalized = normalizeTask(item);
    const { error } = await supabase.from('tasks').upsert(taskToRow(this.userId, this.firmId, normalized), { onConflict: 'id' });
    if (error) throw error;
    return normalized;
  }

  async update(item: Task): Promise<Task> {
    const normalized = normalizeTask(item);
    const { error } = await supabase.from('tasks').upsert(taskToRow(this.userId, this.firmId, normalized), { onConflict: 'id' });
    if (error) throw error;
    return normalized;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async getByCaseId(caseId: string): Promise<Task[]> {
    const rows = await fetchAllRows('tasks', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToTask);
  }

  async createMany(items: Task[]): Promise<Task[]> {
    if (items.length === 0) return items;
    const { error } = await supabase.from('tasks').upsert(items.map(i => taskToRow(this.userId, this.firmId, i)), { onConflict: 'id' });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Templates — custom only; the system defaults stay hardcoded in seedData.ts
// ---------------------------------------------------------------------------

function templateToRow(userId: string, firmId: string, t: WorkflowTemplate) {
  return {
    id: t.id,
    user_id: userId,
    firm_id: firmId,
    title: t.title,
    description: t.description,
    visa_subclass: t.visaSubclass ?? null,
    steps: t.steps ?? null,
    version: t.version ?? null,
    timing_verified: t.timingVerified ?? null,
  };
}

function rowToTemplate(row: any): WorkflowTemplate {
  return normalizeTemplate({
    id: row.id,
    title: row.title,
    description: row.description,
    visaSubclass: row.visa_subclass ?? undefined,
    steps: row.steps ?? undefined,
    userId: row.user_id,
    version: row.version ?? undefined,
    timingVerified: row.timing_verified ?? undefined,
  });
}

class CloudTemplateRepository implements ITemplateRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<WorkflowTemplate[]> {
    const rows = await fetchAllRows('workflow_templates', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToTemplate);
  }

  async getById(id: string): Promise<WorkflowTemplate | undefined> {
    const { data, error } = await supabase.from('workflow_templates').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToTemplate(data) : undefined;
  }

  async create(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    // System defaults (userId: null) are seeded in-app, not written to the DB.
    if (item.userId === null) return item;
    const { error } = await supabase.from('workflow_templates').upsert(templateToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: WorkflowTemplate): Promise<WorkflowTemplate> {
    const { error } = await supabase.from('workflow_templates').upsert(templateToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('workflow_templates').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async getSystemDefaults(): Promise<WorkflowTemplate[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Case Notes
// ---------------------------------------------------------------------------

function noteToRow(userId: string, firmId: string, n: CaseNote) {
  return {
    id: n.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getByCaseId(caseId: string): Promise<CaseNote[]> {
    const rows = await fetchAllRows('case_notes', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToNote);
  }

  async create(note: CaseNote): Promise<CaseNote> {
    const { error } = await supabase.from('case_notes').upsert(noteToRow(this.userId, this.firmId, note), { onConflict: 'id' });
    if (error) throw error;
    return note;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('case_notes').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Documents — metadata row + blob in the private 'documents' storage bucket.
//
// New uploads go to {firmId}/{doc.filePath} (doc.filePath is already
// 'documents/{caseId}/{fileName}', set by components/DocumentUpload.tsx).
// Documents created before Step 1 · 1F live at {userId}/{doc.filePath}
// instead — storage RLS (the firms migration) accepts both prefixes, so
// reads/deletes try the firm path first and fall back to the legacy
// creator-user path rather than requiring a copy of every existing object.
// ---------------------------------------------------------------------------

function docToRow(userId: string, firmId: string, d: Document) {
  return {
    id: d.id,
    user_id: userId,
    firm_id: firmId,
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

function isStorageNotFound(error: any): boolean {
  const status = error?.statusCode ?? error?.status;
  return String(status) === '404' || /not.?found|does not exist/i.test(error?.message ?? '');
}

class CloudDocumentRepository implements IDocumentRepository {
  constructor(private userId: string, private firmId: string) {}

  private firmStoragePath(doc: Document): string {
    return `${this.firmId}/${doc.filePath}`;
  }

  private legacyStoragePath(doc: Document): string | null {
    return doc.userId ? `${doc.userId}/${doc.filePath}` : null;
  }

  async getByCaseId(caseId: string): Promise<Document[]> {
    const rows = await fetchAllRows('documents', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToDoc);
  }

  async create(doc: Document, fileData: Blob): Promise<Document> {
    const { error: uploadError } = await supabase.storage.from('documents').upload(this.firmStoragePath(doc), fileData, { upsert: true });
    if (uploadError) throw uploadError;
    const { error } = await supabase.from('documents').upsert(docToRow(this.userId, this.firmId, doc), { onConflict: 'id' });
    if (error) throw error;
    return doc;
  }

  async update(doc: Document): Promise<Document> {
    const { error } = await supabase.from('documents').upsert(docToRow(this.userId, this.firmId, doc), { onConflict: 'id' });
    if (error) throw error;
    return doc;
  }

  async getFileData(doc: Document): Promise<Blob | null> {
    const { data, error } = await supabase.storage.from('documents').download(this.firmStoragePath(doc));
    if (!error) return data;
    // Only a genuine "the object isn't there" falls through to the legacy
    // path / null; anything else (network failure, auth, bucket misconfig)
    // throws — see the comment this replaced for why that distinction matters
    // to callers like migrate.ts's copyAllData().
    if (!isStorageNotFound(error)) throw error;

    const legacyPath = this.legacyStoragePath(doc);
    if (!legacyPath) return null;
    const { data: legacyData, error: legacyError } = await supabase.storage.from('documents').download(legacyPath);
    if (legacyError) {
      if (isStorageNotFound(legacyError)) return null;
      throw legacyError;
    }
    return legacyData;
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await supabase.from('documents').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return;
    const doc = rowToDoc(data);
    const paths = [this.firmStoragePath(doc)];
    const legacyPath = this.legacyStoragePath(doc);
    if (legacyPath) paths.push(legacyPath);
    // Removing a path that doesn't exist is not an error for Supabase Storage
    // (it's simply absent from the result), so it's safe to always try both.
    const { error: removeError } = await supabase.storage.from('documents').remove(paths);
    if (removeError) throw removeError;
    const { error: deleteError } = await supabase.from('documents').delete().eq('firm_id', this.firmId).eq('id', id);
    if (deleteError) throw deleteError;
  }
}

// ---------------------------------------------------------------------------
// Notifications — per-user, not firm-scoped (each member gets their own alerts)
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
// Team Members — local-mode-only table now (Step 1 · 1F). Cloud mode reads
// the firm's real member directory instead (see contexts/FirmContext.tsx and
// lib/firmDirectory.ts) and never touches this table/class; it's kept here
// only so the Repositories interface stays satisfied and nothing breaks if
// some code path calls it directly.
// ---------------------------------------------------------------------------

function memberToRow(userId: string, firmId: string, m: TeamMember) {
  return {
    id: m.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<TeamMember[]> {
    const rows = await fetchAllRows('team_members', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToMember);
  }

  async getById(id: string): Promise<TeamMember | undefined> {
    const { data, error } = await supabase.from('team_members').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToMember(data) : undefined;
  }

  async create(item: TeamMember): Promise<TeamMember> {
    const { error } = await supabase.from('team_members').upsert(memberToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: TeamMember): Promise<TeamMember> {
    const { error } = await supabase.from('team_members').upsert(memberToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('team_members').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Activity — append-only
// ---------------------------------------------------------------------------

function eventToRow(userId: string, firmId: string, e: ActivityEvent) {
  return {
    id: e.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<ActivityEvent[]> {
    const rows = await fetchAllRows('activity_events', q => q.eq('firm_id', this.firmId).order('created_at', { ascending: true }));
    return rows.map(rowToEvent);
  }

  async create(event: ActivityEvent): Promise<ActivityEvent> {
    const { error } = await supabase.from('activity_events').upsert(eventToRow(this.userId, this.firmId, event), { onConflict: 'id' });
    if (error) throw error;
    return event;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('activity_events').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Usage — append-only. Keeps user_id for attribution but gains firm_id for
// per-firm seat counts (Step 1 · 1F item #10).
// ---------------------------------------------------------------------------

function usageEventToRow(userId: string, firmId: string, e: UsageEvent) {
  return {
    id: e.id,
    user_id: userId,
    firm_id: firmId,
    type: e.type,
    metadata: e.metadata ?? null,
    created_at: e.createdAt,
  };
}

function rowToUsageEvent(row: any): UsageEvent {
  return {
    id: row.id,
    userId: row.user_id,
    firmId: row.firm_id ?? undefined,
    type: row.type,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
  };
}

class CloudUsageRepository implements IUsageRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<UsageEvent[]> {
    const rows = await fetchAllRows('usage_events', q => q.eq('firm_id', this.firmId).order('created_at', { ascending: true }));
    return rows.map(rowToUsageEvent);
  }

  async create(event: UsageEvent): Promise<UsageEvent> {
    const { error } = await supabase.from('usage_events').upsert(usageEventToRow(this.userId, this.firmId, event), { onConflict: 'id' });
    if (error) throw error;
    return event;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('usage_events').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

function checklistToRow(userId: string, firmId: string, caseId: string, i: DocumentChecklistItem) {
  return {
    id: i.id,
    user_id: userId,
    firm_id: firmId,
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
  firmId: string,
  caseId: string,
  rows: { id: string }[],
): Promise<void> {
  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  const existing = await fetchAllRows(table, q => q.eq('firm_id', firmId).eq('case_id', caseId), 'id');
  const keep = new Set(rows.map(r => r.id));
  const stale = existing.map(r => r.id).filter(id => !keep.has(id));
  if (stale.length === 0) return;
  const { error } = await supabase.from(table).delete().eq('firm_id', firmId).eq('case_id', caseId).in('id', stale);
  if (error) throw error;
}

class CloudChecklistRepository implements IChecklistRepository {
  constructor(private userId: string, private firmId: string) {}

  async getByCaseId(caseId: string): Promise<DocumentChecklistItem[]> {
    const rows = await fetchAllRows('checklist_items', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToChecklistItem);
  }

  async setForCase(caseId: string, items: DocumentChecklistItem[]): Promise<void> {
    await replaceCaseRows('checklist_items', this.firmId, caseId, items.map(i => checklistToRow(this.userId, this.firmId, caseId, i)));
  }
}

// ---------------------------------------------------------------------------
// Document Types — firm-level reference list (no case_id). Seeding
// (lib/documentTypes.ts's ensureSystemDocumentTypes()) is unchanged code —
// it's per-firm automatically now because this repository is.
// ---------------------------------------------------------------------------

function documentTypeToRow(userId: string, firmId: string, t: DocumentType) {
  return {
    id: t.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<DocumentType[]> {
    const rows = await fetchAllRows('document_types', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToDocumentType);
  }

  async getById(id: string): Promise<DocumentType | undefined> {
    const { data, error } = await supabase.from('document_types').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToDocumentType(data) : undefined;
  }

  async create(item: DocumentType): Promise<DocumentType> {
    const { error } = await supabase.from('document_types').upsert(documentTypeToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: DocumentType): Promise<DocumentType> {
    const { error } = await supabase.from('document_types').upsert(documentTypeToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('document_types').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async createMany(items: DocumentType[]): Promise<DocumentType[]> {
    if (items.length === 0) return items;
    // onConflict on (firm_id, code) rather than id: seeding races (two tabs
    // opening at once, or two firm members loading simultaneously) would
    // otherwise both mint a fresh uuid for the same code and trip the unique
    // constraint (document_types_firm_id_code_key — see the firms migration).
    const { error } = await supabase
      .from('document_types')
      .upsert(items.map(i => documentTypeToRow(this.userId, this.firmId, i)), { onConflict: 'firm_id,code', ignoreDuplicates: true });
    if (error) throw error;
    return items;
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function conversationToRow(userId: string, firmId: string, caseId: string, c: FocusConversation) {
  return {
    id: c.id,
    user_id: userId,
    firm_id: firmId,
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
  constructor(private userId: string, private firmId: string) {}

  async getByCaseId(caseId: string): Promise<FocusConversation[]> {
    const rows = await fetchAllRows('focus_conversations', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToConversation);
  }

  async setForCase(caseId: string, conversations: FocusConversation[]): Promise<void> {
    await replaceCaseRows('focus_conversations', this.firmId, caseId, conversations.map(c => conversationToRow(this.userId, this.firmId, caseId, c)));
  }
}

// ---------------------------------------------------------------------------
// Eligibility Assessments — firm-level, optionally linked to a case/client
// ---------------------------------------------------------------------------

export function eligibilityAssessmentToRow(userId: string, firmId: string, a: EligibilityAssessment) {
  return {
    id: a.id,
    user_id: userId,
    firm_id: firmId,
    client_id: a.clientId ?? null,
    case_id: a.caseId ?? null,
    created_at: a.createdAt,
    inputs: a.inputs,
    options: a.options,
    selected_subclass: a.selectedSubclass ?? null,
  };
}

export function rowToEligibilityAssessment(row: any): EligibilityAssessment {
  return {
    id: row.id,
    userId: row.user_id,
    clientId: row.client_id ?? undefined,
    caseId: row.case_id ?? undefined,
    createdAt: row.created_at,
    inputs: row.inputs,
    options: row.options,
    selectedSubclass: row.selected_subclass ?? undefined,
  };
}

class CloudEligibilityRepository implements IEligibilityRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<EligibilityAssessment[]> {
    const rows = await fetchAllRows('eligibility_assessments', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToEligibilityAssessment);
  }

  async getById(id: string): Promise<EligibilityAssessment | undefined> {
    const { data, error } = await supabase.from('eligibility_assessments').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToEligibilityAssessment(data) : undefined;
  }

  async create(item: EligibilityAssessment): Promise<EligibilityAssessment> {
    const { error } = await supabase.from('eligibility_assessments').upsert(eligibilityAssessmentToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: EligibilityAssessment): Promise<EligibilityAssessment> {
    const { error } = await supabase.from('eligibility_assessments').upsert(eligibilityAssessmentToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('eligibility_assessments').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async getByCaseId(caseId: string): Promise<EligibilityAssessment[]> {
    const rows = await fetchAllRows('eligibility_assessments', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToEligibilityAssessment);
  }

  async getByClientId(clientId: string): Promise<EligibilityAssessment[]> {
    const rows = await fetchAllRows('eligibility_assessments', q => q.eq('firm_id', this.firmId).eq('client_id', clientId));
    return rows.map(rowToEligibilityAssessment);
  }
}

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

export function deadlineToRow(userId: string, firmId: string, d: Deadline) {
  return {
    id: d.id,
    user_id: userId,
    firm_id: firmId,
    kind: d.kind,
    title: d.title,
    due_date: d.dueDate,
    case_id: d.caseId ?? null,
    client_id: d.clientId ?? null,
    triggered_on: d.triggeredOn ?? null,
    status: d.status,
    resolved_at: d.resolvedAt ?? null,
    notes: d.notes ?? null,
    created_at: d.createdAt,
  };
}

export function rowToDeadline(row: any): Deadline {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    title: row.title,
    dueDate: row.due_date,
    caseId: row.case_id ?? undefined,
    clientId: row.client_id ?? undefined,
    triggeredOn: row.triggered_on ?? undefined,
    status: row.status,
    resolvedAt: row.resolved_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

class CloudDeadlineRepository implements IDeadlineRepository {
  constructor(private userId: string, private firmId: string) {}

  async getAll(): Promise<Deadline[]> {
    const rows = await fetchAllRows('deadlines', q => q.eq('firm_id', this.firmId));
    return rows.map(rowToDeadline);
  }

  async getById(id: string): Promise<Deadline | undefined> {
    const { data, error } = await supabase.from('deadlines').select('*').eq('firm_id', this.firmId).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? rowToDeadline(data) : undefined;
  }

  async create(item: Deadline): Promise<Deadline> {
    const { error } = await supabase.from('deadlines').upsert(deadlineToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async update(item: Deadline): Promise<Deadline> {
    const { error } = await supabase.from('deadlines').upsert(deadlineToRow(this.userId, this.firmId, item), { onConflict: 'id' });
    if (error) throw error;
    return item;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('deadlines').delete().eq('firm_id', this.firmId).eq('id', id);
    if (error) throw error;
  }

  async getByCaseId(caseId: string): Promise<Deadline[]> {
    const rows = await fetchAllRows('deadlines', q => q.eq('firm_id', this.firmId).eq('case_id', caseId));
    return rows.map(rowToDeadline);
  }

  async getByClientId(clientId: string): Promise<Deadline[]> {
    const rows = await fetchAllRows('deadlines', q => q.eq('firm_id', this.firmId).eq('client_id', clientId));
    return rows.map(rowToDeadline);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCloudRepositories(userId: string, firmId: string): Repositories {
  return {
    clients: new CloudClientRepository(userId, firmId),
    cases: new CloudCaseRepository(userId, firmId),
    tasks: new CloudTaskRepository(userId, firmId),
    templates: new CloudTemplateRepository(userId, firmId),
    caseNotes: new CloudCaseNoteRepository(userId, firmId),
    documents: new CloudDocumentRepository(userId, firmId),
    notifications: new CloudNotificationRepository(userId),
    teamMembers: new CloudTeamMemberRepository(userId, firmId),
    activity: new CloudActivityRepository(userId, firmId),
    usage: new CloudUsageRepository(userId, firmId),
    checklist: new CloudChecklistRepository(userId, firmId),
    documentTypes: new CloudDocumentTypeRepository(userId, firmId),
    chat: new CloudChatRepository(userId, firmId),
    eligibility: new CloudEligibilityRepository(userId, firmId),
    deadlines: new CloudDeadlineRepository(userId, firmId),
  };
}
