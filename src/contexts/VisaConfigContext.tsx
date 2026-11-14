import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { CasePhase, VisaType } from '../types';
import { useRepositories } from './RepositoryContext';
import { ensureSystemVisaTypes, resetVisaType as resetVisaTypeValues, sortVisaTypes, validateVisaType } from '../lib/visaTypes';
import {
  ensureSystemCasePhases,
  movePhase as computePhaseMove,
  sortCasePhases,
  systemPhaseDefault,
  validatePhaseName,
} from '../lib/casePhases';

interface VisaTypeInput {
  subclass: string;
  name: string;
  substream: string;
  note: string;
}

interface VisaConfigContextValue {
  /** Every Visa Type row, hidden ones included, in list order. Use `lib/visaTypes.ts` helpers for pickers. */
  visaTypes: VisaType[];
  /** Every phase, hidden ones included, in order. */
  casePhases: CasePhase[];
  loading: boolean;
  addVisaType: (input: VisaTypeInput) => Promise<VisaType>;
  updateVisaType: (id: string, input: VisaTypeInput) => Promise<void>;
  /** Hides/unhides a row. System rows can only be hidden, never deleted. */
  setVisaTypeHidden: (id: string, hidden: boolean) => Promise<void>;
  /** Deletes a firm-added row. Throws for system rows (hide them instead). */
  deleteVisaType: (id: string) => Promise<void>;
  resetVisaType: (id: string) => Promise<void>;
  addCasePhase: (name: string) => Promise<CasePhase>;
  renameCasePhase: (id: string, name: string) => Promise<void>;
  setCasePhaseHidden: (id: string, hidden: boolean) => Promise<void>;
  deleteCasePhase: (id: string) => Promise<void>;
  moveCasePhase: (id: string, direction: -1 | 1) => Promise<void>;
  resetCasePhase: (id: string) => Promise<void>;
}

const VisaConfigContext = createContext<VisaConfigContextValue | null>(null);

const clean = (input: VisaTypeInput): VisaTypeInput => ({
  subclass: input.subclass.trim(),
  name: input.name.trim(),
  substream: input.substream.trim(),
  note: input.note.trim(),
});

/**
 * Loads (and seeds) the firm's Visa Types and Phases once, so Configuration,
 * the Work Plan editor and every case form read the same rows. Rules (Not
 * Confirmed can't be added, Consultation can't move/hide, system rows hide
 * rather than delete) are enforced here, not in the repositories.
 */
export function VisaConfigProvider({ children }: { children: React.ReactNode }) {
  const repos = useRepositories();
  const [visaTypes, setVisaTypes] = useState<VisaType[]>([]);
  const [casePhases, setCasePhases] = useState<CasePhase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      ensureSystemVisaTypes(repos.visaTypes).catch(err => {
        console.error('Failed to load Visa Types:', err);
        return [] as VisaType[];
      }),
      ensureSystemCasePhases(repos.casePhases).catch(err => {
        console.error('Failed to load Phases:', err);
        return [] as CasePhase[];
      }),
    ])
      .then(([types, phases]) => {
        if (cancelled) return;
        setVisaTypes(sortVisaTypes(types));
        setCasePhases(sortCasePhases(phases));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [repos.visaTypes, repos.casePhases]);

  const findType = useCallback(
    (id: string) => {
      const t = visaTypes.find(v => v.id === id);
      if (!t) throw new Error('That Visa Type no longer exists.');
      return t;
    },
    [visaTypes],
  );

  const saveType = useCallback(
    async (next: VisaType) => {
      await repos.visaTypes.update(next);
      setVisaTypes(prev => sortVisaTypes(prev.map(t => (t.id === next.id ? next : t))));
    },
    [repos.visaTypes],
  );

  const addVisaType = useCallback(
    async (input: VisaTypeInput) => {
      const v = clean(input);
      const err = validateVisaType(v, visaTypes);
      if (err) throw new Error(err);
      const created: VisaType = { id: uuidv4(), ...v, isSystemDefault: false, hidden: false };
      await repos.visaTypes.create(created);
      setVisaTypes(prev => sortVisaTypes([...prev, created]));
      return created;
    },
    [visaTypes, repos.visaTypes],
  );

  const updateVisaType = useCallback(
    async (id: string, input: VisaTypeInput) => {
      const v = clean(input);
      const err = validateVisaType(v, visaTypes, id);
      if (err) throw new Error(err);
      await saveType({ ...findType(id), ...v });
    },
    [visaTypes, findType, saveType],
  );

  const setVisaTypeHidden = useCallback(
    async (id: string, hidden: boolean) => saveType({ ...findType(id), hidden }),
    [findType, saveType],
  );

  const deleteVisaType = useCallback(
    async (id: string) => {
      const t = findType(id);
      if (t.isSystemDefault) throw new Error('Built-in Visa Types can be hidden, but not deleted.');
      await repos.visaTypes.delete(id);
      setVisaTypes(prev => prev.filter(v => v.id !== id));
    },
    [findType, repos.visaTypes],
  );

  const resetVisaType = useCallback(
    async (id: string) => saveType(resetVisaTypeValues(findType(id))),
    [findType, saveType],
  );

  // ---- Phases ----

  const findPhase = useCallback(
    (id: string) => {
      const p = casePhases.find(x => x.id === id);
      if (!p) throw new Error('That phase no longer exists.');
      return p;
    },
    [casePhases],
  );

  const savePhases = useCallback(
    async (changed: CasePhase[]) => {
      if (changed.length === 0) return;
      await Promise.all(changed.map(p => repos.casePhases.update(p)));
      setCasePhases(prev => sortCasePhases(prev.map(p => changed.find(c => c.id === p.id) ?? p)));
    },
    [repos.casePhases],
  );

  const addCasePhase = useCallback(
    async (name: string) => {
      const err = validatePhaseName(name, casePhases);
      if (err) throw new Error(err);
      const created: CasePhase = {
        id: uuidv4(),
        name: name.trim(),
        position: casePhases.reduce((max, p) => Math.max(max, p.position), -1) + 1,
        isSystemDefault: false,
        required: false,
        hidden: false,
      };
      await repos.casePhases.create(created);
      setCasePhases(prev => sortCasePhases([...prev, created]));
      return created;
    },
    [casePhases, repos.casePhases],
  );

  const renameCasePhase = useCallback(
    async (id: string, name: string) => {
      const p = findPhase(id);
      if (p.required) throw new Error('Consultation is required and can\'t be renamed.');
      const err = validatePhaseName(name, casePhases, id);
      if (err) throw new Error(err);
      await savePhases([{ ...p, name: name.trim() }]);
    },
    [casePhases, findPhase, savePhases],
  );

  const setCasePhaseHidden = useCallback(
    async (id: string, hidden: boolean) => {
      const p = findPhase(id);
      if (p.required && hidden) throw new Error('Consultation is required and can\'t be hidden.');
      await savePhases([{ ...p, hidden }]);
    },
    [findPhase, savePhases],
  );

  const deleteCasePhase = useCallback(
    async (id: string) => {
      const p = findPhase(id);
      if (p.isSystemDefault) throw new Error('Built-in phases can be hidden, but not deleted.');
      await repos.casePhases.delete(id);
      setCasePhases(prev => prev.filter(x => x.id !== id));
    },
    [findPhase, repos.casePhases],
  );

  const moveCasePhase = useCallback(
    async (id: string, direction: -1 | 1) => savePhases(computePhaseMove(casePhases, id, direction)),
    [casePhases, savePhases],
  );

  const resetCasePhase = useCallback(
    async (id: string) => {
      const p = findPhase(id);
      const d = systemPhaseDefault(p);
      if (d) await savePhases([{ ...p, name: d.name }]);
    },
    [findPhase, savePhases],
  );

  const value = useMemo<VisaConfigContextValue>(
    () => ({
      visaTypes,
      casePhases,
      loading,
      addVisaType,
      updateVisaType,
      setVisaTypeHidden,
      deleteVisaType,
      resetVisaType,
      addCasePhase,
      renameCasePhase,
      setCasePhaseHidden,
      deleteCasePhase,
      moveCasePhase,
      resetCasePhase,
    }),
    [
      visaTypes, casePhases, loading, addVisaType, updateVisaType, setVisaTypeHidden, deleteVisaType, resetVisaType,
      addCasePhase, renameCasePhase, setCasePhaseHidden, deleteCasePhase, moveCasePhase, resetCasePhase,
    ],
  );

  return <VisaConfigContext.Provider value={value}>{children}</VisaConfigContext.Provider>;
}

export function useVisaConfig(): VisaConfigContextValue {
  const ctx = useContext(VisaConfigContext);
  if (!ctx) throw new Error('useVisaConfig must be used within VisaConfigProvider');
  return ctx;
}
