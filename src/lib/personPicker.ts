import type { Case, Task } from '../types';
import { isCaseClosed } from './caseStage';
import { isTaskClosed } from './taskStatus';

/** Availability shared by TeamMember.status (both modes) and FirmMemberRow.availability. */
export type PersonAvailability = 'available' | 'busy' | 'offline';

/**
 * Minimal shape `PersonPicker` needs for one selectable person, deliberately
 * narrower than `TeamMember` so callers (cloud firm directory rows, local
 * `TeamMember`s, or a `FirmMemberRow` mapped via `lib/firmDirectory.ts`) can
 * all feed it without an intermediate type.
 */
export interface PersonPickerPerson {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  /** Real `FirmJobTitle` label in cloud mode, the cosmetic TeamMember role label in local mode — resolved by the caller. */
  jobTitle: string | null;
  status: PersonAvailability;
}

export interface PersonWorkload {
  /** Open (non-closed, per `lib/caseStage.ts`'s `isCaseClosed`) cases this person owns. */
  openCaseCount: number;
  /** Open (non-closed, per `lib/taskStatus.ts`'s `isTaskClosed`) tasks assigned to this person. */
  openTaskCount: number;
}

export interface PersonPickerEntry extends PersonPickerPerson, PersonWorkload {
  /** This person is the signed-in user. */
  isYou: boolean;
  /** This person is the picker's current value. */
  isCurrent: boolean;
}

/** Open case + task counts for one person id — the workload line a picker row shows. */
export function computeWorkload(personId: string, cases: Case[], tasks: Task[]): PersonWorkload {
  return {
    openCaseCount: cases.filter(c => c.caseOwner === personId && !isCaseClosed(c)).length,
    openTaskCount: tasks.filter(t => t.assignedTo === personId && !isTaskClosed(t)).length,
  };
}

/**
 * Ordering: You first, then the current value (tagged "Current" — skipped if
 * it's already You), then available people, then busy, then offline; within
 * each bucket, lightest workload (open cases + open tasks) first, then name.
 * Only active people should ever be passed in — the caller is responsible
 * for excluding disabled/former members before calling this.
 */
export function buildPersonPickerEntries(
  people: PersonPickerPerson[],
  opts: { cases: Case[]; tasks: Task[]; currentUserId?: string; currentValueId?: string },
): PersonPickerEntry[] {
  const entries: PersonPickerEntry[] = people.map(p => ({
    ...p,
    ...computeWorkload(p.id, opts.cases, opts.tasks),
    isYou: !!opts.currentUserId && p.id === opts.currentUserId,
    isCurrent: !!opts.currentValueId && p.id === opts.currentValueId,
  }));

  const bucketRank = (e: PersonPickerEntry): number => {
    if (e.isYou) return 0;
    if (e.isCurrent) return 1;
    switch (e.status) {
      case 'available': return 2;
      case 'busy': return 3;
      case 'offline': return 4;
      default: return 5;
    }
  };

  return entries.slice().sort((a, b) => {
    const rankDiff = bucketRank(a) - bucketRank(b);
    if (rankDiff !== 0) return rankDiff;
    const workloadDiff = (a.openCaseCount + a.openTaskCount) - (b.openCaseCount + b.openTaskCount);
    if (workloadDiff !== 0) return workloadDiff;
    return a.name.localeCompare(b.name);
  });
}

/** Case-insensitive filter by name, email, or job title. */
export function filterPersonPickerEntries(entries: PersonPickerEntry[], query: string): PersonPickerEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.email.toLowerCase().includes(q) ||
    (e.jobTitle ?? '').toLowerCase().includes(q)
  );
}

/** Plain-text workload line for a picker row, e.g. "2 open cases · 5 open tasks". */
export function workloadLabel(w: PersonWorkload): string {
  const caseLabel = `${w.openCaseCount} open case${w.openCaseCount === 1 ? '' : 's'}`;
  const taskLabel = `${w.openTaskCount} open task${w.openTaskCount === 1 ? '' : 's'}`;
  return `${caseLabel} · ${taskLabel}`;
}
