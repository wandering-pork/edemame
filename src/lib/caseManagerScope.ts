import type { Case, FirmRole } from '../types';

/**
 * Step 1 · 1G.7 — Case Manager's "My cases / All cases" toggle. Cloud-only
 * (see the plan and `pages/CaseManager.tsx`'s render — hidden in local
 * mode, where there's only ever one user anyway).
 */
export type CaseOwnerScope = 'mine' | 'all';

/** Filters cases by `caseOwner === currentUserId` when scope is 'mine'. */
export function filterCasesByOwnerScope(cases: Case[], scope: CaseOwnerScope, currentUserId?: string): Case[] {
  if (scope === 'all' || !currentUserId) return cases;
  return cases.filter(c => c.caseOwner === currentUserId);
}

/**
 * Default scope for a first-time view of Case Manager in cloud mode: All
 * for owners and admins (they typically need the whole firm's view),
 * Mine for plain Members (see docs/plans/step-1g-team-experience.md, 1G.7).
 */
export function defaultCaseOwnerScope(role: FirmRole | null): CaseOwnerScope {
  return role === 'member' ? 'mine' : 'all';
}

const SESSION_KEY = 'edamame:case-manager-scope';

/** Remembers the chosen scope for this browser session only (try/catch — private browsing, blocked storage, etc.). */
export function saveCaseOwnerScope(scope: CaseOwnerScope): void {
  try {
    sessionStorage.setItem(SESSION_KEY, scope);
  } catch {
    // Ignore — worst case the default is recomputed next time.
  }
}

export function loadCaseOwnerScope(): CaseOwnerScope | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v === 'mine' || v === 'all' ? v : null;
  } catch {
    return null;
  }
}
