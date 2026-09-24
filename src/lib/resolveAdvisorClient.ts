import { Client } from '../types';

export interface AdvisorClientInfo {
  fullName: string;
  dob: string;
}

export type ResolveAdvisorClientResult =
  | { kind: 'existing'; client: Client }
  | { kind: 'new'; sameNameCandidates: Client[] };

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Decides whether the Visa Advisor's "Open Case" flow should reuse an existing
 * client or create a new one, given the wizard's collected `clientInfo` and an
 * optional `clientId` the page was pre-loaded with (e.g. via `?clientId=`).
 *
 * Order of precedence:
 *   1. `clientId` was supplied and still resolves to a real client — use it
 *      directly, no name/DOB matching (the caller already told us who this is).
 *   2. A client whose normalized name AND date of birth both match exactly —
 *      reuse it.
 *   3. Otherwise create a new client. If any existing clients share the same
 *      normalized name but didn't match on DOB (or one side is missing a DOB),
 *      they're returned as `sameNameCandidates` so the caller can warn the user
 *      a look-alike record already exists instead of silently duplicating it.
 */
export function resolveAdvisorClient(
  clients: Client[],
  clientInfo: AdvisorClientInfo,
  clientId?: string
): ResolveAdvisorClientResult {
  if (clientId) {
    const byId = clients.find((c) => c.id === clientId);
    if (byId) {
      return { kind: 'existing', client: byId };
    }
  }

  const normalizedInputName = normalizeName(clientInfo.fullName);
  const sameNameCandidates = clients.filter((c) => normalizeName(c.name) === normalizedInputName);

  if (clientInfo.dob) {
    const match = sameNameCandidates.find((c) => c.dob === clientInfo.dob);
    if (match) {
      return { kind: 'existing', client: match };
    }
  }

  return { kind: 'new', sameNameCandidates };
}
