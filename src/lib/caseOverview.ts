import type { CaseTabKind, DocumentChecklistItem, Task } from '../types';
import { TASK_STATUS_LABELS, isTaskClosed, isWaiting } from './taskStatus';

/**
 * Pure helpers behind the Case Details Overview (design option B: stage
 * stepper + current-task hero, task timeline, checklist breakdown, and the
 * floating Workspace dock's suggested quick actions).
 */

/** The task the case is "on" right now: the earliest-dated task that isn't closed. `null` when every task is closed (or there are none). */
export function currentFocusTask(caseTasks: Task[]): Task | null {
  const open = caseTasks.filter(t => !isTaskClosed(t));
  if (open.length === 0) return null;
  return [...open].sort((a, b) => a.date.localeCompare(b.date) || a.priorityOrder - b.priorityOrder)[0];
}

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineEntry {
  task: Task;
  state: TimelineState;
}

/**
 * A compact window of the case's task list for the Overview's timeline:
 * the last `doneBefore` closed tasks, the current task, then up to
 * `upcomingAfter` tasks after it. `hiddenCount` is how many tasks were left
 * out, so the card can offer "View all".
 */
export function taskTimeline(
  caseTasks: Task[],
  { doneBefore = 2, upcomingAfter = 4 }: { doneBefore?: number; upcomingAfter?: number } = {},
): { entries: TimelineEntry[]; hiddenCount: number } {
  const sorted = [...caseTasks].sort((a, b) => a.date.localeCompare(b.date) || a.priorityOrder - b.priorityOrder);
  const current = currentFocusTask(sorted);
  const done = sorted.filter(isTaskClosed);
  const upcoming = sorted.filter(t => !isTaskClosed(t) && t.id !== current?.id);

  const entries: TimelineEntry[] = [
    ...done.slice(-doneBefore).map(task => ({ task, state: 'done' as const })),
    ...(current ? [{ task: current, state: 'current' as const }] : []),
    ...upcoming.slice(0, upcomingAfter).map(task => ({ task, state: 'upcoming' as const })),
  ];
  return { entries, hiddenCount: sorted.length - entries.length };
}

export interface ChecklistCategorySummary {
  category: string;
  total: number;
  pending: number;
  linked: number;
  verified: number;
  waived: number;
}

/** Per-category status counts for the Overview's checklist bars, in first-seen category order. */
export function checklistBreakdown(items: DocumentChecklistItem[], fallbackCategory = 'Other documents'): ChecklistCategorySummary[] {
  const byCategory = new Map<string, ChecklistCategorySummary>();
  for (const item of items) {
    const category = item.category?.trim() || fallbackCategory;
    let row = byCategory.get(category);
    if (!row) {
      row = { category, total: 0, pending: 0, linked: 0, verified: 0, waived: 0 };
      byCategory.set(category, row);
    }
    row.total += 1;
    row[item.status] += 1;
  }
  return [...byCategory.values()];
}

/**
 * A suggested next step shown in the Workspace dock. `agent` pre-fills the
 * Agent chat with `prompt`; `open` opens a View/Tool tab; `task` opens the
 * current task's detail modal.
 */
/** `detail` is a short second line for layouts that show suggestions as cards. */
export type QuickAction =
  | { id: string; label: string; detail: string; kind: 'agent'; prompt: string }
  | { id: string; label: string; detail: string; kind: 'open'; target: CaseTabKind }
  | { id: string; label: string; detail: string; kind: 'task'; taskId: string };

/**
 * Up to `limit` suggested next steps for the case, driven by its current
 * task and checklist. Rule-based (not an AI call) — cheap enough to
 * recompute on every render, and predictable for the agent.
 */
export function suggestQuickActions(
  { currentTask, caseTasks, checklist, clientName }: {
    currentTask: Task | null;
    caseTasks: Task[];
    checklist: DocumentChecklistItem[];
    clientName: string;
  },
  limit = 3,
): QuickAction[] {
  const actions: QuickAction[] = [];
  const pending = checklist.filter(i => i.status === 'pending');
  const linked = checklist.filter(i => i.status === 'linked');

  if (caseTasks.length === 0) {
    actions.push({ id: 'plan', label: 'Create a task plan', detail: 'No tasks on this case yet', kind: 'open', target: 'tasks' });
  }

  if (currentTask && isWaiting(currentTask)) {
    actions.push({
      id: 'chase',
      label: currentTask.status === 'waiting_client' ? 'Chase client' : 'Follow up',
      detail: `Draft a follow-up email · ${TASK_STATUS_LABELS[currentTask.status]}`,
      kind: 'agent',
      prompt: `Draft a short, polite follow-up email to ${clientName} about "${currentTask.title}", which we're still waiting on.`,
    });
  }

  if (pending.length > 0) {
    const list = pending.slice(0, 15).map(i => `- ${i.label}`).join('\n');
    actions.push({
      id: 'request-docs',
      label: pending.length === 1 ? 'Request 1 missing document' : `Request ${pending.length} missing documents`,
      detail: `Draft email to client · ${pending.length} outstanding`,
      kind: 'agent',
      prompt: `Draft an email to ${clientName} requesting these outstanding documents:\n${list}`,
    });
  }

  if (linked.length > 0) {
    actions.push({
      id: 'verify-docs',
      label: linked.length === 1 ? 'Verify 1 document' : `Verify ${linked.length} documents`,
      detail: 'Linked and ready to review in the checklist',
      kind: 'open',
      target: 'checklist',
    });
  }

  if (currentTask) {
    actions.push({ id: 'open-current', label: 'Update current task', detail: 'Change its status, date or notes', kind: 'task', taskId: currentTask.id });
  }

  if (checklist.length === 0) {
    actions.push({ id: 'gen-checklist', label: 'Generate checklist', detail: 'No checklist on this case yet', kind: 'open', target: 'checklist-generator' });
  }

  actions.push({
    id: 'summarise',
    label: 'Summarise case',
    detail: 'Ask the Agent where things are up to',
    kind: 'agent',
    prompt: 'Summarise where this case is up to, what is outstanding, and what I should do next.',
  });

  return actions.slice(0, limit);
}
