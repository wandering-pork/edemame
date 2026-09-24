import { Case, WorkflowTemplate } from '../types';
import { isCaseClosed } from './caseStage';

/**
 * Finds an existing, non-closed case for `clientId` whose workflow template
 * targets the same visa subclass being opened from the Visa Advisor — used by
 * the Open Case confirmation panel to warn a lawyer before they create what
 * may be a duplicate case for the same client/pathway.
 *
 * A template's `visaSubclass` can list several subclasses separated by `/`
 * (e.g. "820/801"), so each entry is compared individually, matching the same
 * exact-match semantics as `matchTemplate`. Returns the first match found, or
 * `null` if there is none.
 *
 * Prefers the case's own `visaSubclass` (set at creation time — see
 * CLAUDE.md's "Local-First Storage") when present, falling back to the
 * template's for cases created before that field existed.
 */
export function findOpenCaseForSubclass(
  cases: Case[],
  templates: WorkflowTemplate[],
  clientId: string,
  visaSubclass: string
): Case | null {
  for (const c of cases) {
    if (c.clientId !== clientId) continue;
    if (isCaseClosed(c)) continue;
    const rawSubclass = c.visaSubclass ?? templates.find((t) => t.id === c.templateId)?.visaSubclass;
    if (!rawSubclass) continue;
    const subclasses = rawSubclass.split('/').map((s) => s.trim());
    if (subclasses.includes(visaSubclass)) return c;
  }
  return null;
}
