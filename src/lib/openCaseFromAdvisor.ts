import { v4 as uuidv4 } from 'uuid';
import type { Case, Client, Task, WorkflowTemplate } from '../types';
import { toLocalISODate } from './dates';
import { buildGapTasks } from './gapTasks';

export type OpenCaseClientChoice =
  | { kind: 'existing'; id: string }
  | {
      kind: 'new';
      fullName: string;
      dob: string;
      nationality: string;
      email?: string;
      phone?: string;
      inAustralia: boolean;
      currentVisaStatus: string;
    };

export type OpenCaseStage = 'plan' | 'client' | 'finalizing';

// Everything the confirmation panel decided, executed exactly as confirmed —
// no re-resolution of the client happens once this reaches the caller. Stage
// order reflects the actual sequence openCaseFromAdvisor runs in: the AI task
// plan (if requested) is drafted first (so nothing has to be rolled back if it
// fails), then the client is resolved/created, then the case itself is saved.
export interface OpenCaseParams {
  client: OpenCaseClientChoice;
  /** Workflow template id to use, or `null` for "No template (general case)". */
  templateId: string | null;
  title: string;
  /** When false, the 'plan' stage is skipped entirely and no tasks are generated. */
  generateTasks: boolean;
  visaSubclass: string;
  visaName: string;
  caseDescription: string;
  /** When true, one fixed (non-AI) task is created per entry in `gaps`. */
  gapTasks: boolean;
  /** The selected pathway's gaps — used both to build gap tasks and to tell
   *  AI task generation not to duplicate them (see `excludeItems`). */
  gaps: string[];
  onProgress: (stage: OpenCaseStage) => void;
}

/** Result of a successful case creation, so the caller can link the saved assessment to it. */
export interface OpenCaseOutcome {
  caseId: string;
  clientId: string;
}

export interface OpenCaseDeps {
  clients: Client[];
  templates: WorkflowTemplate[];
  /** Same signature as `services/geminiService.ts`'s `generateTasksFromCase`. */
  generateTasks: (
    caseDescription: string,
    workflowDescription: string,
    startDate: string,
    visaSubclass?: string,
    workflowTitle?: string,
    steps?: WorkflowTemplate['steps'],
    excludeItems?: string[]
  ) => Promise<Partial<Task>[]>;
  addClient: (client: Client) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  /** Persists the case and its tasks (App.tsx's `handleTasksConfirmed`). */
  createCase: (tasks: Task[], newCase: Case) => Promise<void>;
  makeId?: () => string;
  today?: () => string;
  now?: () => string;
}

export interface OpenCaseResult extends OpenCaseOutcome {
  /** True when the AI plan was requested but failed; the case was still created without AI tasks. */
  aiGenerationFailed: boolean;
}

/**
 * Executes a Visa Advisor "Open Case" confirmation: optional AI task plan,
 * then the client (existing or newly created), then the case with gap + AI
 * tasks. A client created here is deleted again if saving the case fails, so
 * a failed attempt never leaves an orphaned client behind. Navigation and
 * toasts are the caller's job.
 */
export async function openCaseFromAdvisor(params: OpenCaseParams, deps: OpenCaseDeps): Promise<OpenCaseResult> {
  const { client: clientChoice, templateId, title, generateTasks, visaSubclass, caseDescription, gapTasks, gaps, onProgress } = params;
  const makeId = deps.makeId ?? uuidv4;
  const template = templateId ? deps.templates.find((t) => t.id === templateId) : undefined;

  const startDate = (deps.today ?? toLocalISODate)();
  const newCaseId = makeId();

  let generatedTasks: Partial<Task>[] = [];
  let aiGenerationFailed = false;
  if (generateTasks) {
    onProgress('plan');
    try {
      generatedTasks = await deps.generateTasks(
        caseDescription,
        template?.description || '',
        startDate,
        template?.visaSubclass,
        template?.title,
        template?.steps,
        // Gaps already tracked as fixed tasks below shouldn't be duplicated by the AI plan.
        gapTasks ? gaps : undefined
      );
    } catch {
      aiGenerationFailed = true;
    }
  }

  onProgress('client');
  let client: Client;
  let createdNewClient = false;
  if (clientChoice.kind === 'existing') {
    const existing = deps.clients.find((c) => c.id === clientChoice.id);
    if (!existing) {
      throw new Error('The selected client no longer exists. Please reopen the confirmation panel.');
    }
    client = existing;
  } else {
    const notesLines = [`In Australia: ${clientChoice.inAustralia ? 'Yes' : 'No'}`];
    if (clientChoice.currentVisaStatus) {
      notesLines.push(`Current visa status: ${clientChoice.currentVisaStatus}`);
    }
    client = {
      id: makeId(),
      name: clientChoice.fullName,
      dob: clientChoice.dob || '',
      phone: clientChoice.phone || '',
      email: clientChoice.email || '',
      address: '',
      nationality: clientChoice.nationality || undefined,
      role: 'applicant',
      notes: notesLines.join('\n'),
    };
    await deps.addClient(client);
    createdNewClient = true;
  }

  onProgress('finalizing');
  const newCase: Case = {
    id: newCaseId,
    clientId: client.id,
    title,
    description: caseDescription,
    templateId: template?.id || '',
    status: 'open',
    startDate,
    createdAt: (deps.now ?? (() => new Date().toISOString()))(),
    visaSubclass,
  };

  // Fixed (non-AI) gap tasks go first, ahead of the AI-generated plan.
  const gapTaskList: Task[] = gapTasks ? buildGapTasks(gaps, newCaseId, startDate, makeId) : [];
  const aiTasks: Task[] = generatedTasks.map((t, index) => ({
    id: makeId(),
    title: t.title || 'Untitled Task',
    description: t.description || '',
    date: t.date || startDate,
    isCompleted: false,
    priorityOrder: gapTaskList.length + index,
    generatedByAi: true,
    caseId: newCaseId,
  }));

  try {
    await deps.createCase([...gapTaskList, ...aiTasks], newCase);
  } catch (err) {
    if (createdNewClient) {
      try {
        await deps.deleteClient(client.id);
      } catch (cleanupErr) {
        console.error('Failed to roll back newly created client after case creation failed:', cleanupErr);
      }
    }
    throw err;
  }

  return { caseId: newCaseId, clientId: client.id, aiGenerationFailed };
}
