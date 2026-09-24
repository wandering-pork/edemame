import type { WorkflowTemplate, WorkflowStep } from '../types';

/**
 * Turns a title into a short, url-safe slug for use as half of a generated
 * step key (`slugifyTitle('Initial Consultation') === 'initial-consultation'`).
 * Falls back to `'step'` for a title with no alphanumeric characters at all.
 */
function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'step';
}

/**
 * Assigns a stable `key` to every step that's missing one — custom templates
 * (`pages/Templates.tsx`, today title/description only) and any template
 * persisted before `WorkflowStep.key` existed. Keys already present are left
 * untouched, so anchors already pointing at them keep working.
 *
 * The generated key is `slug(title)-{index}`: the index suffix is always
 * appended (not just on collision) so the key stays stable even if a later
 * step with a colliding slug is inserted earlier in the array — the plan
 * calls this out as needing to be "stable ... so anchors survive reordering",
 * and a purely collision-based suffix would let two same-titled steps swap
 * keys when steps are reordered.
 *
 * Pure — does not mutate the input template. Not wired into the repository
 * layer yet (see 1E scope note); callers reading a possibly-legacy template's
 * steps should call this first.
 */
export function normalizeTemplate(template: WorkflowTemplate): WorkflowTemplate {
  if (!template.steps || template.steps.length === 0) {
    return template;
  }
  const seen = new Set<string>();
  const steps: WorkflowStep[] = template.steps.map((step, index) => {
    let key = step.key;
    if (!key) {
      key = `${slugifyTitle(step.title)}-${index}`;
    }
    // Extremely defensive fallback: if an explicit key collides with one
    // already seen (e.g. hand-authored data with a duplicate), disambiguate
    // rather than silently dropping the collision on the scheduler.
    if (seen.has(key)) {
      key = `${key}-dup${index}`;
    }
    seen.add(key);
    return key === step.key ? step : { ...step, key };
  });
  return { ...template, steps };
}
