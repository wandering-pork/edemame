import { Task, WorkflowStep } from "../types";
import { addDaysISO } from "../lib/dates";

export const generateTasksFromCase = async (
  caseDescription: string,
  workflowDescription: string,
  startDate: string,
  visaSubclass?: string,
  workflowTitle?: string,
  steps?: WorkflowStep[],
  /** Items already tracked as separate fixed tasks (e.g. Visa Advisor gap tasks) — the AI is told not to duplicate them. */
  excludeItems?: string[]
): Promise<Partial<Task>[]> => {
  const response = await fetch("/api/generate-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseDescription,
      workflowDescription,
      startDate,
      visaSubclass,
      workflowTitle,
      steps,
      excludeItems,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate tasks. Please try again.");
  }

  const generatedData = await response.json();

  return generatedData.map((item: any) => ({
    title: item.title,
    description: item.description,
    // `addDaysISO` operates on local calendar fields — see lib/dates.ts's note
    // on why `new Date(...).toISOString()` silently drifts a day near midnight
    // for anyone not on UTC.
    date: addDaysISO(startDate, item.daysOffset || 0),
    status: 'not_started',
    isCompleted: false,
    generatedByAi: true,
  }));
};

/** One AI-suggested extra task, from `/api/generate-tasks`'s `mode: 'additions'`. */
export interface TaskSuggestion {
  title: string;
  description: string;
  /** Why this specific case needs it — shown next to the suggestion for Accept/Reject. */
  reason: string;
  /** The scheduled step's `stepKey` this should be timed relative to, if any — otherwise timed from the case start date. */
  anchorStepKey?: string;
  offsetDays: number;
}

/** A deterministically-scheduled step, as far as `suggestAdditions` needs to know about it. */
export interface ScheduledStepSummary {
  title: string;
  date: string;
  stepKey?: string;
}

/**
 * Step 1 · 1E "AI suggestions instead of whole plans": asks Gemini for a small
 * number of case-specific extra tasks the template's own scheduled steps
 * don't cover, instead of a whole plan — see `CaseDetails.tsx`'s "Suggest
 * extra tasks with AI".
 */
export const suggestAdditions = async (
  caseDescription: string,
  startDate: string,
  visaSubclass?: string,
  workflowTitle?: string,
  scheduledSteps?: ScheduledStepSummary[],
  excludeItems?: string[]
): Promise<TaskSuggestion[]> => {
  const response = await fetch("/api/generate-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: 'additions',
      caseDescription,
      startDate,
      visaSubclass,
      workflowTitle,
      scheduledSteps,
      excludeItems,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch task suggestions. Please try again.");
  }

  const data = await response.json();
  return Array.isArray(data.additions) ? data.additions : [];
};
