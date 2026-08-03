import type { CaseOpenTab } from '../types';

/**
 * Per-case Workspace tab persistence.
 *
 * Tab state (which View/Tool tabs are open, pinned, and active) is ephemeral
 * UI state scoped to a single browser/device, not case data — so it goes in
 * localStorage rather than the repository layer (which is reserved for
 * data that must sync across the linked folder / cloud tables). On reload or
 * re-entry to a case, only pinned tabs plus the last active tab are restored;
 * everything else is discarded, per the Workspace tab-behaviour spec.
 */

interface StoredCaseTabsState {
  tabs: CaseOpenTab[];
  activeTabId: string;
}

const keyFor = (caseId: string) => `edamame:case-tabs:${caseId}`;

export function loadCaseTabsState(caseId: string): StoredCaseTabsState | null {
  try {
    const raw = localStorage.getItem(keyFor(caseId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tabs) || typeof parsed.activeTabId !== 'string') return null;
    return parsed as StoredCaseTabsState;
  } catch {
    return null;
  }
}

export function saveCaseTabsState(caseId: string, state: StoredCaseTabsState): void {
  try {
    localStorage.setItem(keyFor(caseId), JSON.stringify(state));
  } catch {
    // best-effort — ignore quota/serialization errors
  }
}

/**
 * Restore only pinned tabs + the last active tab from a previously saved
 * state, discarding all other unpinned tabs.
 */
export function restoreTabsOnEntry(state: StoredCaseTabsState | null): { tabs: CaseOpenTab[]; activeTabId: string } {
  if (!state) return { tabs: [], activeTabId: 'workspace' };
  const kept = state.tabs.filter(t => t.pinned || t.id === state.activeTabId);
  const activeStillKept = kept.some(t => t.id === state.activeTabId);
  return {
    tabs: kept,
    activeTabId: activeStillKept ? state.activeTabId : 'workspace',
  };
}
