import type { Repositories } from './types';

/**
 * Deletes every record (including document blobs) currently in `dest`, so a
 * subsequent copyAllData() lands on a clean slate instead of merging with
 * whatever was already there. Used by the Settings storage-mode switch,
 * which overwrites the target rather than trying to append/merge — the two
 * sides can't be reconciled record-by-record without a real sync protocol,
 * and this is a single-account migration, not a shared dataset.
 *
 * Order matters for the cloud repositories, whose tables have real foreign
 * keys: per-case children (chat, checklist, documents, notes) are cleared
 * before tasks/cases, and cases before clients.
 */
export async function clearAll(
  dest: Repositories,
  onProgress?: (entityName: string) => void,
): Promise<void> {
  const report = (name: string) => onProgress?.(name);

  const cases = await dest.cases.getAll();
  let caseIdx = 0;
  for (const c of cases) {
    caseIdx++;
    report(`existing case data (${caseIdx} of ${cases.length})`);
    const [notes, docs] = await Promise.all([
      dest.caseNotes.getByCaseId(c.id),
      dest.documents.getByCaseId(c.id),
    ]);
    await dest.chat.setForCase(c.id, []);
    await dest.checklist.setForCase(c.id, []);
    await Promise.all(docs.map(d => dest.documents.delete(d.id)));
    await Promise.all(notes.map(n => dest.caseNotes.delete(n.id)));
  }

  report('existing activity');
  const activity = await dest.activity.getAll();
  await Promise.all(activity.map(e => dest.activity.delete(e.id)));

  report('existing team members');
  const teamMembers = await dest.teamMembers.getAll();
  await Promise.all(teamMembers.map(m => dest.teamMembers.delete(m.id)));

  report('existing notifications');
  const notifications = await dest.notifications.getAll();
  await Promise.all(notifications.map(n => dest.notifications.delete(n.id)));

  report('existing document types');
  const documentTypes = await dest.documentTypes.getAll();
  await Promise.all(documentTypes.map(t => dest.documentTypes.delete(t.id)));

  report('existing templates');
  const templates = await dest.templates.getAll();
  await Promise.all(templates.map(t => dest.templates.delete(t.id)));

  report('existing tasks');
  const tasks = await dest.tasks.getAll();
  await Promise.all(tasks.map(t => dest.tasks.delete(t.id)));

  report('existing cases');
  await Promise.all(cases.map(c => dest.cases.delete(c.id)));

  report('existing clients');
  const clients = await dest.clients.getAll();
  await Promise.all(clients.map(c => dest.clients.delete(c.id)));
}

/**
 * Copies every record (including document blobs) from source into dest.
 * Used by the Settings "switch storage mode" flow, in both directions —
 * local -> cloud and cloud -> local both call this the same way, just
 * swapping which repositories are the source and which are the destination.
 *
 * `onProgress` is called with a human-readable entity name as each step starts,
 * so the caller can show "Copying tasks..." instead of an indeterminate spinner.
 */
export async function copyAllData(
  source: Repositories,
  dest: Repositories,
  onProgress?: (entityName: string) => void,
): Promise<void> {
  const report = (name: string) => onProgress?.(name);

  report('clients');
  const [clients, cases, tasks, templates] = await Promise.all([
    source.clients.getAll(),
    source.cases.getAll(),
    source.tasks.getAll(),
    source.templates.getAll(),
  ]);

  await dest.clients.createMany(clients);
  report('cases');
  await Promise.all(cases.map(c => dest.cases.create(c)));
  report('tasks');
  await dest.tasks.createMany(tasks);
  report('templates');
  await Promise.all(templates.map(t => dest.templates.create(t)));

  report('document types');
  const documentTypes = await source.documentTypes.getAll();
  await dest.documentTypes.createMany(documentTypes);

  const caseIds = cases.map(c => c.id);

  report('notifications');
  const [notifications, teamMembers, activity] = await Promise.all([
    source.notifications.getAll(),
    source.teamMembers.getAll(),
    source.activity.getAll(),
  ]);
  await Promise.all(notifications.map(n => dest.notifications.create(n)));
  report('team members');
  await Promise.all(teamMembers.map(m => dest.teamMembers.create(m)));
  report('activity');
  await Promise.all(activity.map(e => dest.activity.create(e)));

  let caseIdx = 0;
  for (const caseId of caseIds) {
    caseIdx++;
    report(`case details (${caseIdx} of ${caseIds.length})`);
    const [notes, docs, checklist, conversations] = await Promise.all([
      source.caseNotes.getByCaseId(caseId),
      source.documents.getByCaseId(caseId),
      source.checklist.getByCaseId(caseId),
      source.chat.getByCaseId(caseId),
    ]);

    await Promise.all(notes.map(n => dest.caseNotes.create(n)));

    for (const doc of docs) {
      const blob = await source.documents.getFileData(doc);
      if (blob) await dest.documents.create(doc, blob);
    }

    if (checklist.length > 0) await dest.checklist.setForCase(caseId, checklist);
    if (conversations.length > 0) await dest.chat.setForCase(caseId, conversations);
  }
}
