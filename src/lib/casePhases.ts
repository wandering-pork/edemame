import { v4 as uuidv4 } from 'uuid';
import type { CasePhase } from '../types';

/**
 * Phases — the firm's ordered list of case phases (Configuration → Work Plans
 * → Phases). Work Plan steps and case tasks are grouped by phase. Not to be
 * confused with `Case.stage`, the draft→closed lifecycle, which is unchanged.
 * Same per-firm, seed-on-load pattern as `lib/documentTypes.ts`.
 */

export const CONSULTATION_PHASE_KEY = 'consultation';

/**
 * Shipped defaults, in order. Never rekey an entry — `systemKey` is how
 * seeding recognises phases a firm already has (hidden, renamed or moved).
 * New defaults can be appended; they're added at the end of a firm's list.
 */
export const SYSTEM_CASE_PHASES: { systemKey: string; name: string }[] = [
  { systemKey: CONSULTATION_PHASE_KEY, name: 'Consultation' },
  { systemKey: 'prerequisites', name: 'Prerequisites' },
  { systemKey: 'preparing', name: 'Preparing for lodgement' },
  { systemKey: 'ready_to_lodge', name: 'Ready to lodge' },
  { systemKey: 'lodged', name: 'Lodged' },
  { systemKey: 'decision', name: 'Decision' },
  { systemKey: 'post_decision', name: 'Post-decision' },
];

export const PHASE_NAME_MAX = 40;

/** Ascending by position, Consultation always first. */
export function sortCasePhases(phases: CasePhase[]): CasePhase[] {
  return [...phases].sort(
    (a, b) => Number(b.required) - Number(a.required) || a.position - b.position || a.name.localeCompare(b.name),
  );
}

/**
 * Seeds any shipped phase the firm doesn't have yet (by `systemKey`) at the
 * end of its list, and returns the full list sorted. Idempotent.
 */
export async function ensureSystemCasePhases(repo: {
  getAll(): Promise<CasePhase[]>;
  createMany(items: CasePhase[]): Promise<CasePhase[]>;
}): Promise<CasePhase[]> {
  const existing = await repo.getAll();
  const known = new Set(existing.map(p => p.systemKey).filter(Boolean));
  let next = existing.reduce((max, p) => Math.max(max, p.position), -1) + 1;
  const missing: CasePhase[] = SYSTEM_CASE_PHASES.filter(s => !known.has(s.systemKey)).map(s => ({
    id: uuidv4(),
    name: s.name,
    position: s.systemKey === CONSULTATION_PHASE_KEY ? 0 : next++,
    isSystemDefault: true,
    systemKey: s.systemKey,
    required: s.systemKey === CONSULTATION_PHASE_KEY,
    hidden: false,
  }));
  if (missing.length === 0) return sortCasePhases(existing);
  await repo.createMany(missing);
  return sortCasePhases([...existing, ...missing]);
}

/** Visible phases, in order. */
export const visibleCasePhases = (phases: CasePhase[]): CasePhase[] => sortCasePhases(phases).filter(p => !p.hidden);

export const systemPhaseDefault = (p: CasePhase) =>
  p.systemKey ? SYSTEM_CASE_PHASES.find(s => s.systemKey === p.systemKey) : undefined;

/** A system phase whose name no longer matches what shipped. */
export const isEditedPhase = (p: CasePhase): boolean => {
  const d = systemPhaseDefault(p);
  return !!d && d.name !== p.name;
};

export function validatePhaseName(name: string, all: CasePhase[], ignoreId?: string): string | null {
  const n = name.trim();
  if (!n) return 'Phase name is required.';
  if (n.length > PHASE_NAME_MAX) return `Keep phase names to ${PHASE_NAME_MAX} characters or fewer.`;
  if (all.some(p => p.id !== ignoreId && p.name.trim().toLowerCase() === n.toLowerCase())) {
    return 'There is already a phase with that name.';
  }
  return null;
}

/**
 * Moves a phase one place up (-1) or down (+1) among the non-required phases
 * and renumbers positions 0..n-1. Returns only the phases whose position
 * changed (ready to persist), or [] if the move isn't allowed — the required
 * Consultation phase never moves and nothing can move above it.
 */
export function movePhase(phases: CasePhase[], id: string, direction: -1 | 1): CasePhase[] {
  const sorted = sortCasePhases(phases);
  const i = sorted.findIndex(p => p.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sorted.length || sorted[i].required || sorted[j].required) return [];
  const reordered = [...sorted];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  return reordered
    .map((p, idx) => (p.position === idx ? null : { ...p, position: idx }))
    .filter((p): p is CasePhase => p !== null);
}
