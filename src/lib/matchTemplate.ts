import { WorkflowTemplate } from '../types';

/**
 * Finds the workflow template whose `visaSubclass` exactly matches the given
 * subclass. A template's `visaSubclass` can list several subclasses separated
 * by `/` (e.g. "820/801"), so each entry is trimmed and compared individually
 * rather than matched with substring/title fuzziness, which could pick the
 * wrong template (e.g. "489" matching inside "4890").
 *
 * Shared by the Visa Advisor "Open Case" confirmation panel (to pre-select a
 * template) and `App.tsx`'s case-creation flow (to resolve the chosen
 * template id back into a `WorkflowTemplate`).
 */
export function matchTemplate(
  templates: WorkflowTemplate[],
  visaSubclass: string
): WorkflowTemplate | undefined {
  return templates.find((t) =>
    (t.visaSubclass || '')
      .split('/')
      .map((s) => s.trim())
      .includes(visaSubclass)
  );
}
