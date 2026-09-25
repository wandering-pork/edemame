import type { FirmRole } from '../types';

/**
 * Step 1 · 1G.5 — pure decision logic for FirmContext.tsx: given the user's
 * profile.currentFirmId and their active firm memberships, which firm should
 * the app actually use? Kept out of the context so it's unit-testable
 * without Supabase.
 *
 * Three cases, all handled the same way (per the plan: "Today's self-heal
 * branch (currentFirmId unset) should reuse the same logic"):
 *   - currentFirmId already names an active membership -> use it, nothing lost.
 *   - currentFirmId is unset (never chosen, e.g. mid-onboarding race) -> fall
 *     back to a membership, nothing "lost" since there was nothing to lose.
 *   - currentFirmId names a firm the user is no longer an active member of
 *     (disabled, removed, firm gone) -> fall back to a membership (or null
 *     with none left), and report the old id as `lostFirmId` so the caller
 *     can show a one-time "you no longer have access" notice.
 */

export interface ActiveMembership {
  firmId: string;
  firmName: string;
  role: FirmRole;
}

export interface CurrentFirmResolution {
  /** The firm to use, or null when the user has no active memberships left (-> CreateFirmGate). */
  firmId: string | null;
  /**
   * Set only when `currentFirmId` was non-null and named a firm that isn't
   * among `memberships` — i.e. access was actually lost, not just never set.
   */
  lostFirmId: string | null;
}

/**
 * `memberships` should be ordered most-recently-joined first (as the
 * `firm_members` query FirmContext.tsx runs already sorts it) so the
 * fallback picks the membership the user joined most recently.
 */
export function resolveCurrentFirm(
  currentFirmId: string | null | undefined,
  memberships: ActiveMembership[],
): CurrentFirmResolution {
  const normalizedCurrent = currentFirmId ?? null;

  if (normalizedCurrent && memberships.some(m => m.firmId === normalizedCurrent)) {
    return { firmId: normalizedCurrent, lostFirmId: null };
  }

  const fallback = memberships[0]?.firmId ?? null;
  return {
    firmId: fallback,
    lostFirmId: normalizedCurrent && normalizedCurrent !== fallback ? normalizedCurrent : null,
  };
}
