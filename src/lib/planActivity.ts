/**
 * Pure helpers for describing how a case's task plan was produced, used by
 * `App.tsx`'s `handleTasksConfirmed` (to write an accurate `ActivityEvent`
 * summary) and by `pages/Dashboard.tsx`'s "Recent activity" panel fallback
 * (for cases that predate any `ActivityEvent` being recorded).
 *
 * A plan is either:
 *  - deterministic, from a timed `WorkflowTemplate` (`lib/tasksFromTemplate.ts`
 *    — every task carries a `stepKey` and `generatedByAi: false`),
 *  - from Gemini (`generatedByAi: true` on every task), or
 *  - a mix — e.g. a template plan plus AI-suggested additions
 *    (`CaseDetails.tsx`'s "Suggest extra tasks with AI"), or fixed gap tasks
 *    (`lib/gapTasks.ts`) alongside an AI-generated plan.
 *
 * See root CLAUDE.md's "AI Task Generation Flow".
 */

export type PlanSource = 'template' | 'ai' | 'mixed' | 'none';

export interface PlanSourceTaskLike {
  generatedByAi?: boolean;
  stepKey?: string;
}

/** Classifies a set of newly-created tasks by how their dates/content were produced. */
export function describePlanSource(tasks: PlanSourceTaskLike[]): PlanSource {
  if (tasks.length === 0) return 'none';
  const aiCount = tasks.filter(t => t.generatedByAi).length;
  if (aiCount === tasks.length) return 'ai';
  if (aiCount === 0) return 'template';
  return 'mixed';
}

/**
 * Builds a plain-English `ActivityEvent.summary` (or Dashboard fallback
 * label) for a just-created task plan. `templateName` is the case's
 * `WorkflowTemplate.title`, when known.
 */
export function buildTaskPlanSummary(taskCount: number, source: PlanSource, templateName?: string): string {
  switch (source) {
    case 'template':
      return templateName
        ? `Created a ${taskCount}-task plan from the ${templateName} template.`
        : `Created a ${taskCount}-task plan from the workflow template.`;
    case 'ai':
      return `Generated a ${taskCount}-task plan with AI.`;
    case 'mixed':
      return `Created a ${taskCount}-task plan (template plan plus AI-suggested additions).`;
    case 'none':
    default:
      return '';
  }
}
