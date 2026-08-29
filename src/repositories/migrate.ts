import type { Repositories } from './types';

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
    const [notes, docs, checklist, conversations, pointsClaim] = await Promise.all([
      source.caseNotes.getByCaseId(caseId),
      source.documents.getByCaseId(caseId),
      source.checklist.getByCaseId(caseId),
      source.chat.getByCaseId(caseId),
      source.pointsClaims.getByCaseId(caseId),
    ]);

    await Promise.all(notes.map(n => dest.caseNotes.create(n)));

    for (const doc of docs) {
      const blob = await source.documents.getFileData(doc);
      if (blob) await dest.documents.create(doc, blob);
    }

    if (pointsClaim) await dest.pointsClaims.setForCase(caseId, pointsClaim);
    if (checklist.length > 0) await dest.checklist.setForCase(caseId, checklist);
    if (conversations.length > 0) await dest.chat.setForCase(caseId, conversations);
  }
}
