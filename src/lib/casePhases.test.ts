import { describe, it, expect } from 'vitest';
import type { CasePhase } from '../types';
import {
  SYSTEM_CASE_PHASES,
  ensureSystemCasePhases,
  isEditedPhase,
  movePhase,
  sortCasePhases,
  validatePhaseName,
  visibleCasePhases,
} from './casePhases';

const memRepo = (initial: CasePhase[] = []) => {
  let rows = [...initial];
  return {
    getAll: async () => rows,
    createMany: async (items: CasePhase[]) => { rows = [...rows, ...items]; return items; },
  };
};

const apply = (all: CasePhase[], changed: CasePhase[]) =>
  all.map(p => changed.find(c => c.id === p.id) ?? p);

describe('ensureSystemCasePhases', () => {
  it('seeds the shipped phases in order, Consultation first and required', async () => {
    const phases = await ensureSystemCasePhases(memRepo());
    expect(phases.map(p => p.name)).toEqual(SYSTEM_CASE_PHASES.map(s => s.name));
    expect(phases[0].required).toBe(true);
    expect(phases.slice(1).every(p => !p.required)).toBe(true);
  });

  it('appends a missing default at the end without disturbing existing order', async () => {
    const all = await ensureSystemCasePhases(memRepo());
    const withoutLodged = all.filter(p => p.systemKey !== 'lodged');
    const result = await ensureSystemCasePhases(memRepo(withoutLodged));
    expect(result.map(p => p.name).at(-1)).toBe('Lodged');
    expect(result).toHaveLength(all.length);
  });

  it('does not re-add a hidden or renamed phase', async () => {
    const all = await ensureSystemCasePhases(memRepo());
    const tampered = all.map(p => (p.systemKey === 'decision' ? { ...p, hidden: true, name: 'Outcome' } : p));
    const result = await ensureSystemCasePhases(memRepo(tampered));
    expect(result).toHaveLength(all.length);
    expect(visibleCasePhases(result).some(p => p.systemKey === 'decision')).toBe(false);
    expect(isEditedPhase(result.find(p => p.systemKey === 'decision')!)).toBe(true);
  });
});

describe('movePhase', () => {
  it('swaps neighbours and renumbers', async () => {
    const all = await ensureSystemCasePhases(memRepo());
    const prereq = all.find(p => p.systemKey === 'prerequisites')!;
    const next = sortCasePhases(apply(all, movePhase(all, prereq.id, 1)));
    expect(next.map(p => p.systemKey).slice(0, 3)).toEqual(['consultation', 'preparing', 'prerequisites']);
  });

  it('never moves Consultation or anything above it', async () => {
    const all = await ensureSystemCasePhases(memRepo());
    expect(movePhase(all, all[0].id, 1)).toEqual([]);
    expect(movePhase(all, all[1].id, -1)).toEqual([]);
    expect(movePhase(all, all[all.length - 1].id, 1)).toEqual([]);
  });
});

describe('validatePhaseName', () => {
  it('requires a unique, non-empty name', async () => {
    const all = await ensureSystemCasePhases(memRepo());
    expect(validatePhaseName('  ', all)).toMatch(/required/);
    expect(validatePhaseName('lodged', all)).toMatch(/already/);
    expect(validatePhaseName('Lodged', all, all.find(p => p.name === 'Lodged')!.id)).toBeNull();
    expect(validatePhaseName('Appeal', all)).toBeNull();
  });
});
