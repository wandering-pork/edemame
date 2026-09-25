import React, { useState } from 'react';
import { WorkflowTemplate, WorkflowStep, StepAnchor, StepTiming, DeadlineKind } from '../types';
import {
  Plus, Trash2, FileText, X, Sparkles, ChevronDown, ChevronUp, List,
  Flag, Pencil, Copy, ArrowUp, ArrowDown, AlertTriangle, Info, Scale,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { scheduleFromTemplate, typicalLength, ScheduleStep } from '../lib/scheduleFromTemplate';
import { describeStepTiming, formatTypicalLength, DEADLINE_KIND_LABELS } from '../lib/describeTiming';
import { toLocalISODate } from '../lib/dates';

interface TemplatesProps {
  templates: WorkflowTemplate[];
  currentUserId: string;
  onAddTemplate: (t: WorkflowTemplate) => void;
  onUpdateTemplate: (t: WorkflowTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

// Deterministic accent per visa subclass, matching the design handoff's
// 186 (green/brand), 482 (blue), 491 (purple), 820 (amber) palette.
// Any subclass not in this map falls back to a stable color chosen by
// hashing the subclass/title, then cycling through the same palette.
const subclassAccents: Record<string, { bar: string; icon: string }> = {
  '186': { bar: 'bg-edamame', icon: 'bg-edamame/10 text-edamame-600 dark:bg-edamame/15 dark:text-edamame-400' },
  '482': { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  '491': { bar: 'bg-violet-500', icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  '820': { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  '801': { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  '500': { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  '600': { bar: 'bg-cyan-500', icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
  '485': { bar: 'bg-teal-500', icon: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
  '190': { bar: 'bg-indigo-500', icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
};

const fallbackAccents = [
  { bar: 'bg-edamame', icon: 'bg-edamame/10 text-edamame-600 dark:bg-edamame/15 dark:text-edamame-400' },
  { bar: 'bg-blue-500', icon: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { bar: 'bg-violet-500', icon: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  { bar: 'bg-amber-500', icon: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { bar: 'bg-rose-500', icon: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  { bar: 'bg-cyan-500', icon: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400' },
];

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getAccent = (template: WorkflowTemplate, index: number) => {
  const key = (template.visaSubclass || '').replace(/\D/g, '');
  if (key && subclassAccents[key]) return subclassAccents[key];
  const seed = template.visaSubclass || template.title || String(index);
  return fallbackAccents[hashString(seed) % fallbackAccents.length];
};

// ---------------------------------------------------------------------------
// Step editor draft model
//
// The editor works on a looser "draft" shape than `WorkflowStep`/`StepTiming`
// — every numeric field is a plain string so a half-typed input (e.g. an
// empty offset box while the user is retyping it) doesn't fight React's
// controlled-input value. Drafts are converted to real `WorkflowStep`s only
// at validate/save time (`draftToStep`).
// ---------------------------------------------------------------------------

type AnchorKind = 'case_start' | 'previous_step' | 'step_start' | 'step_done' | 'deadline';

interface StepDraft {
  /** Stable across the editing session — reused as `WorkflowStep.key` so anchors survive reordering. */
  draftId: string;
  title: string;
  description: string;
  anchorKind: AnchorKind;
  /** Only meaningful when anchorKind is 'step_start' | 'step_done' — another step's `draftId`. */
  anchorStepDraftId: string;
  /** Only meaningful when anchorKind is 'deadline'. */
  anchorDeadlineKind: DeadlineKind;
  offsetDays: string;
  durationMin: string;
  durationMax: string;
  fixed: boolean;
  isGate: boolean;
}

function stepToDraft(step: WorkflowStep): StepDraft {
  const timing = step.timing;
  let anchorKind: AnchorKind = 'case_start';
  let anchorStepDraftId = '';
  let anchorDeadlineKind: DeadlineKind = 'other';
  if (timing) {
    if (timing.anchor.type === 'previous_step') anchorKind = 'previous_step';
    else if (timing.anchor.type === 'step') {
      anchorKind = timing.anchor.edge === 'done' ? 'step_done' : 'step_start';
      anchorStepDraftId = timing.anchor.stepKey;
    } else if (timing.anchor.type === 'deadline') {
      anchorKind = 'deadline';
      anchorDeadlineKind = timing.anchor.kind;
    }
  }
  return {
    draftId: step.key,
    title: step.title,
    description: step.description,
    anchorKind,
    anchorStepDraftId,
    anchorDeadlineKind,
    offsetDays: String(timing?.offsetDays ?? 0),
    durationMin: timing?.durationDays ? String(timing.durationDays.min) : '',
    durationMax: timing?.durationDays ? String(timing.durationDays.max) : '',
    fixed: timing?.fixed ?? false,
    isGate: step.isGate ?? false,
  };
}

function newStepDraft(): StepDraft {
  return {
    draftId: uuidv4(),
    title: '',
    description: '',
    anchorKind: 'previous_step',
    anchorStepDraftId: '',
    anchorDeadlineKind: 'other',
    offsetDays: '1',
    durationMin: '',
    durationMax: '',
    fixed: false,
    isGate: false,
  };
}

/** A step whose `key` a later draft's `step` anchor can reference — its own `draftId` since keys carry straight through to `WorkflowStep.key`. */
function draftToStep(draft: StepDraft): WorkflowStep {
  let anchor: StepAnchor;
  switch (draft.anchorKind) {
    case 'previous_step':
      anchor = { type: 'previous_step' };
      break;
    case 'step_start':
      anchor = { type: 'step', stepKey: draft.anchorStepDraftId, edge: 'start' };
      break;
    case 'step_done':
      anchor = { type: 'step', stepKey: draft.anchorStepDraftId, edge: 'done' };
      break;
    case 'deadline':
      anchor = { type: 'deadline', kind: draft.anchorDeadlineKind };
      break;
    case 'case_start':
    default:
      anchor = { type: 'case_start' };
      break;
  }
  const min = draft.durationMin.trim() === '' ? undefined : Number(draft.durationMin);
  const max = draft.durationMax.trim() === '' ? undefined : Number(draft.durationMax);
  const durationDays = min !== undefined && max !== undefined && Number.isFinite(min) && Number.isFinite(max)
    ? { min, max }
    : undefined;
  const timing: StepTiming = {
    anchor,
    offsetDays: Number.isFinite(Number(draft.offsetDays)) ? Number(draft.offsetDays) : 0,
    durationDays,
    fixed: draft.fixed,
  };
  return {
    key: draft.draftId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    timing,
    isGate: draft.isGate,
  };
}

/** "Counts from" select options — an anchor value string encodes both the kind and (for step/deadline anchors) which target. */
function anchorOptionValue(kind: AnchorKind, target?: string): string {
  if (kind === 'step_start' || kind === 'step_done') return `${kind}:${target}`;
  if (kind === 'deadline') return `deadline:${target}`;
  return kind;
}

function parseAnchorOptionValue(value: string): { kind: AnchorKind; target: string } {
  const [kind, target] = value.split(':') as [AnchorKind, string | undefined];
  return { kind, target: target ?? '' };
}

const anchorSelectValue = (draft: StepDraft) =>
  anchorOptionValue(
    draft.anchorKind,
    draft.anchorKind === 'deadline' ? draft.anchorDeadlineKind : draft.anchorStepDraftId,
  );

interface EditorState {
  mode: 'create' | 'edit';
  templateId: string; // existing id for 'edit', a freshly generated one for 'create'
  title: string;
  description: string;
  visaSubclass: string;
  steps: StepDraft[];
  version: number;
  timingVerified: boolean;
}

function editorFromTemplate(mode: 'create' | 'edit', template: WorkflowTemplate, asCopy: boolean): EditorState {
  return {
    mode,
    templateId: asCopy ? uuidv4() : template.id,
    title: asCopy ? `${template.title} (copy)` : template.title,
    description: template.description,
    visaSubclass: template.visaSubclass ?? '',
    steps: (template.steps ?? []).map(stepToDraft),
    version: asCopy ? 1 : (template.version ?? 1),
    timingVerified: false,
  };
}

function blankEditor(): EditorState {
  return {
    mode: 'create',
    templateId: uuidv4(),
    title: '',
    description: '',
    visaSubclass: '',
    steps: [],
    version: 1,
    timingVerified: false,
  };
}

export const Templates: React.FC<TemplatesProps> = ({ templates, currentUserId, onAddTemplate, onUpdateTemplate, onDeleteTemplate }) => {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const systemTemplates = templates.filter(t => t.userId === null || t.userId === undefined);
  const userTemplates = templates.filter(t => t.userId !== null && t.userId !== undefined);
  // Drives the single page-level "not yet reviewed" note below — a template
  // only counts if it actually shows a timing-derived chip/typical-length
  // figure (steps.length > 0); see the note's own comment.
  const hasUnverifiedTiming = templates.some(t => (t.steps?.length ?? 0) > 0 && t.timingVerified === false);

  const openCreate = () => {
    setErrors([]);
    setEditor(blankEditor());
  };

  const openEdit = (template: WorkflowTemplate) => {
    setErrors([]);
    setEditor(editorFromTemplate('edit', template, false));
  };

  const openDuplicate = (template: WorkflowTemplate) => {
    setErrors([]);
    setEditor(editorFromTemplate('create', template, true));
  };

  const closeEditor = () => {
    setEditor(null);
    setErrors([]);
  };

  const updateStep = (index: number, patch: Partial<StepDraft>) => {
    setEditor(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, steps };
    });
  };

  const addStep = () => {
    setEditor(prev => (prev ? { ...prev, steps: [...prev.steps, newStepDraft()] } : prev));
  };

  const removeStep = (index: number) => {
    setEditor(prev => (prev ? { ...prev, steps: prev.steps.filter((_, i) => i !== index) } : prev));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setEditor(prev => {
      if (!prev) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.steps.length) return prev;
      const steps = [...prev.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  };

  const handleSave = () => {
    if (!editor) return;
    const fieldErrors: string[] = [];
    if (!editor.title.trim()) fieldErrors.push('Template title is required.');
    if (!editor.description.trim()) fieldErrors.push('Process description is required.');
    editor.steps.forEach((s, i) => {
      if (!s.title.trim()) fieldErrors.push(`Step ${i + 1}: title is required.`);
      const offset = Number(s.offsetDays);
      if (!Number.isFinite(offset) || offset < 0) fieldErrors.push(`Step ${i + 1}: offset must be a non-negative number of days.`);
      const hasMin = s.durationMin.trim() !== '';
      const hasMax = s.durationMax.trim() !== '';
      if (hasMin !== hasMax) fieldErrors.push(`Step ${i + 1}: set both a minimum and maximum duration, or neither.`);
      if (hasMin && hasMax && Number(s.durationMin) > Number(s.durationMax)) {
        fieldErrors.push(`Step ${i + 1}: minimum duration can't be greater than the maximum.`);
      }
      if ((s.anchorKind === 'step_start' || s.anchorKind === 'step_done') && !s.anchorStepDraftId) {
        fieldErrors.push(`Step ${i + 1}: choose which step it counts from.`);
      }
    });

    const steps: WorkflowStep[] = editor.steps.map(draftToStep);

    if (steps.length > 0) {
      const result = scheduleFromTemplate(steps as ScheduleStep[], toLocalISODate(new Date()));
      result.errors.forEach(e => fieldErrors.push(e.message));
    }

    if (fieldErrors.length > 0) {
      setErrors(fieldErrors);
      return;
    }

    const template: WorkflowTemplate = {
      id: editor.templateId,
      title: editor.title.trim(),
      description: editor.description.trim(),
      visaSubclass: editor.visaSubclass.trim() || undefined,
      steps: steps.length > 0 ? steps : undefined,
      userId: currentUserId,
      version: editor.mode === 'edit' ? editor.version + 1 : 1,
      timingVerified: false,
    };

    if (editor.mode === 'edit') {
      onUpdateTemplate(template);
    } else {
      onAddTemplate(template);
    }
    closeEditor();
  };

  const TemplateCard = ({ template, index }: { template: WorkflowTemplate; index: number; key?: string }) => {
    const accent = getAccent(template, index);
    const isSystem = template.userId === null || template.userId === undefined;
    const [stepsOpen, setStepsOpen] = useState(false);
    const steps = template.steps || [];
    const length = steps.length > 0 ? typicalLength(steps as ScheduleStep[]) : null;

    return (
      <div className="card-lift bg-paper-2 dark:bg-plate-card rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
        {/* Accent top bar */}
        <div className={`h-1 w-full ${accent.bar}`} />
        <div className="p-5">
          <div className="flex items-center justify-between">
            <div className={`w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0 ${accent.icon}`}>
              <FileText size={16} strokeWidth={1.8} />
            </div>
            <div className="flex items-center gap-1.5">
              {isSystem ? (
                <>
                  <span className="text-[9px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.1em]">
                    System
                  </span>
                  <button
                    onClick={() => openDuplicate(template)}
                    className="p-1.5 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-edamame-600 dark:hover:text-edamame-400 hover:bg-edamame/10 rounded-lg transition-all"
                    aria-label="Duplicate to customise"
                    title="Duplicate to customise"
                  >
                    <Copy size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => openEdit(template)}
                    className="p-1.5 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-edamame-600 dark:hover:text-edamame-400 hover:bg-edamame/10 rounded-lg transition-all"
                    aria-label="Edit template"
                    title="Edit template"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDeleteTemplate(template.id)}
                    className="p-1.5 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                    aria-label="Delete template"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
          <h3 className="font-bold text-ink dark:text-plate-ink text-[14.5px] tracking-tight mt-3 leading-snug">
            {template.title}
          </h3>
          {template.visaSubclass && (
            <p className="text-[11px] font-semibold text-ink-faint dark:text-plate-ink-faint mt-0.5">
              Subclass {template.visaSubclass}
            </p>
          )}
          <p className="text-xs text-ink-soft dark:text-plate-ink-soft leading-relaxed mt-2 line-clamp-3">
            {template.description}
          </p>

          {(length || (steps.length > 0 && template.timingVerified === false)) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
              {length && (
                <span className="text-[11px] font-semibold text-ink-soft dark:text-plate-ink-soft">
                  {formatTypicalLength(length)}
                </span>
              )}
              {steps.length > 0 && template.timingVerified === false && (
                <span
                  tabIndex={0}
                  className="group relative inline-flex items-center text-[9.5px] font-bold uppercase tracking-wide text-ink-faint dark:text-plate-ink-faint bg-ink/5 dark:bg-plate-ink/10 rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-edamame-500"
                  title="Timing not yet reviewed by a registered agent — dates can be changed on each task."
                >
                  Not yet reviewed
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 whitespace-normal rounded-md bg-ink dark:bg-plate-ink px-2.5 py-1.5 text-[10.5px] font-normal normal-case text-paper dark:text-plate shadow-lg group-hover:block group-focus:block"
                  >
                    Timing not yet reviewed by a registered agent — dates can be changed on each task.
                  </span>
                </span>
              )}
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <button
                onClick={() => setStepsOpen(v => !v)}
                className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-edamame-600 dark:hover:text-edamame-400 transition-colors mt-3.5 select-none"
              >
                <List size={13} strokeWidth={1.8} />
                {steps.length} steps
                {stepsOpen ? <ChevronUp size={13} strokeWidth={1.8} /> : <ChevronDown size={13} strokeWidth={1.8} />}
              </button>
              {stepsOpen && (
                <ol className="mt-2.5 border-t border-ink/10 dark:border-plate-ink/15">
                  {steps.map((step, i) => (
                    <li key={step.key || i} className="flex gap-2.5 items-start py-2 border-b border-ink/10 dark:border-plate-ink/15">
                      <span className="flex-shrink-0 w-4 text-[10px] font-extrabold text-ink-faint dark:text-plate-ink-faint mt-0.5">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-ink dark:text-plate-ink leading-snug">
                            {step.title}
                          </span>
                          {step.isGate && (
                            <span
                              tabIndex={0}
                              className="group relative inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded px-1.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-edamame-500"
                              title="Gate — a step that has to be done before the case can move on; overdue gates put a case At Risk."
                            >
                              <Flag size={9} strokeWidth={2.2} /> Gate
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 whitespace-normal rounded-md bg-ink dark:bg-plate-ink px-2.5 py-1.5 text-[10.5px] font-normal normal-case text-paper dark:text-plate shadow-lg group-hover:block group-focus:block"
                              >
                                Gate — a step that has to be done before the case can move on; overdue gates put a case At Risk.
                              </span>
                            </span>
                          )}
                          {/* Estimate is the default and shown implicitly by
                              the absence of a chip — only the "Set by law"
                              exception (a legally fixed window) gets one, so
                              the timeline isn't noisy with an "ESTIMATE" chip
                              on almost every step. */}
                          {step.timing?.fixed && (
                            <span
                              tabIndex={0}
                              className="group relative inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 outline-none focus-visible:ring-2 focus-visible:ring-edamame-500"
                              title="Set by law — a legally fixed window; the agent cannot move this date. A step with no chip uses an estimate the agent can move."
                            >
                              <Scale size={9} strokeWidth={2.2} /> Set by law
                              <span
                                role="tooltip"
                                className="pointer-events-none absolute left-0 top-full z-10 mt-1 hidden w-56 whitespace-normal rounded-md bg-ink dark:bg-plate-ink px-2.5 py-1.5 text-[10.5px] font-normal normal-case text-paper dark:text-plate shadow-lg group-hover:block group-focus:block"
                              >
                                Set by law — a legally fixed window; the agent cannot move this date. A step with no chip uses an estimate the agent can move.
                              </span>
                            </span>
                          )}
                        </div>
                        {step.description && (
                          <p className="text-[11px] text-ink-faint dark:text-plate-ink-faint leading-snug mt-0.5">
                            {step.description}
                          </p>
                        )}
                        <p className="text-[11px] text-ink-soft dark:text-plate-ink-soft leading-snug mt-1">
                          {describeStepTiming(step.timing, steps)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 pt-16 md:pt-8 md:p-8 lg:p-10 bg-paper dark:bg-plate min-h-screen transition-colors duration-200 page-enter">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[26px] font-extrabold text-ink dark:text-plate-ink font-ibm-serif tracking-tight">
              Workflow Templates
            </h1>
            <p className="text-sm text-ink-soft dark:text-plate-ink-soft mt-1">
              Define standard procedures for different visa types.
            </p>
          </div>
          <div className="flex sm:justify-end">
            <button
              onClick={openCreate}
              className="btn-press flex items-center gap-2 bg-edamame hover:bg-edamame-600 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-edamame/25 text-sm whitespace-nowrap"
            >
              <Plus size={16} />
              New Template
            </button>
          </div>
        </div>

        {/* Page-level timing note — replaces a repeated per-card notice; see
            each template card's own small "Not yet reviewed" chip below,
            and the Gate/Set by law chip tooltips on each step. */}
        {hasUnverifiedTiming && (
          <div className="flex items-start gap-2 mb-6 text-[12px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/15 border border-amber-200/70 dark:border-amber-900/40 rounded-xl px-4 py-3">
            <Info size={14} strokeWidth={2} className="flex-shrink-0 mt-[1px]" />
            <p className="leading-relaxed">
              <span className="font-semibold">Timing not yet reviewed by a registered agent.</span>{' '}
              Templates marked <span className="font-semibold">Not yet reviewed</span> below use estimated
              step timing — dates can always be changed on each task. A step's <span className="font-semibold">Set by law</span> chip
              means that step's window is fixed by regulation rather than estimated; steps with no chip use an
              estimate. A <span className="font-semibold">Gate</span> step has to be done before the case can move
              on — an overdue gate puts a case At Risk.
            </p>
          </div>
        )}

      {/* Create / edit / duplicate form */}
      {editor && (
        <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-sm border border-edamame/20 dark:border-edamame/15 p-6 mb-8 modal-content">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-edamame/10 dark:bg-edamame/15 text-edamame-600 flex items-center justify-center">
                <Sparkles size={16} />
              </div>
              <h3 className="text-base font-bold text-ink dark:text-plate-ink">
                {editor.mode === 'edit' ? 'Edit Template' : 'Create New Template'}
              </h3>
            </div>
            <button
              onClick={closeEditor}
              className="p-1.5 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider mb-1.5">
                Template Title
              </label>
              <input
                type="text"
                value={editor.title}
                onChange={e => setEditor(prev => (prev ? { ...prev, title: e.target.value } : prev))}
                placeholder="e.g. 190 Visa Application — Standard"
                className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink outline-none transition-colors placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider mb-1.5">
                Process Description
              </label>
              <p className="text-xs text-ink-faint dark:text-plate-ink-faint mb-2">
                Describe the steps — the AI reads this when suggesting extra tasks for a case using this template.
              </p>
              <textarea
                value={editor.description}
                onChange={e => setEditor(prev => (prev ? { ...prev, description: e.target.value } : prev))}
                rows={3}
                placeholder="1. Gather ID documents. 2. Request skills assessment. 3. Submit EOI..."
                className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink outline-none transition-colors placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider mb-1.5">
                Visa Subclass <span className="normal-case font-normal text-ink-faint dark:text-plate-ink-faint">(optional)</span>
              </label>
              <input
                type="text"
                value={editor.visaSubclass}
                onChange={e => setEditor(prev => (prev ? { ...prev, visaSubclass: e.target.value } : prev))}
                placeholder="e.g. 190"
                className="w-full sm:w-40 px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl text-sm focus:border-edamame/50 dark:focus:border-edamame/30 text-ink dark:text-plate-ink outline-none transition-colors placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
              />
            </div>

            {/* Step editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-ink-soft dark:text-plate-ink-soft uppercase tracking-wider">
                  Steps & Timing
                </label>
                <button
                  type="button"
                  onClick={addStep}
                  className="flex items-center gap-1 text-xs font-semibold text-edamame-600 dark:text-edamame-400 hover:text-edamame-700 dark:hover:text-edamame-300 transition-colors"
                >
                  <Plus size={13} /> Add step
                </button>
              </div>

              {editor.steps.length === 0 && (
                <p className="text-xs text-ink-faint dark:text-plate-ink-faint py-3">
                  No steps yet. Add one, or save with just a title and description and let the AI suggest tasks.
                </p>
              )}

              <div className="space-y-3">
                {editor.steps.map((step, i) => {
                  const otherSteps = editor.steps.filter((_, j) => j !== i);
                  return (
                    <div key={step.draftId} className="border border-ink/15 dark:border-plate-ink/20 rounded-xl p-3.5 bg-paper dark:bg-plate">
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-5 h-5 mt-1.5 rounded-full bg-ink/10 dark:bg-plate-ink/15 text-[10px] font-extrabold text-ink-soft dark:text-plate-ink-soft flex items-center justify-center">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={step.title}
                              onChange={e => updateStep(i, { title: e.target.value })}
                              placeholder="Step title"
                              className="w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-sm text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                            />
                            <input
                              type="text"
                              value={step.description}
                              onChange={e => updateStep(i, { description: e.target.value })}
                              placeholder="Step description"
                              className="w-full px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-sm text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={anchorSelectValue(step)}
                              onChange={e => {
                                const { kind, target } = parseAnchorOptionValue(e.target.value);
                                updateStep(i, {
                                  anchorKind: kind,
                                  anchorStepDraftId: kind === 'step_start' || kind === 'step_done' ? target : '',
                                  anchorDeadlineKind: kind === 'deadline' ? (target as DeadlineKind) : step.anchorDeadlineKind,
                                });
                              }}
                              className="px-2.5 py-1.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-xs text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                            >
                              <option value="case_start">Counts from: Case start</option>
                              <option value="previous_step">Counts from: Previous step</option>
                              {otherSteps.map(s => (
                                <option key={`${s.draftId}-start`} value={anchorOptionValue('step_start', s.draftId)}>
                                  Counts from: {s.title || 'Untitled step'} — starts
                                </option>
                              ))}
                              {otherSteps.map(s => (
                                <option key={`${s.draftId}-done`} value={anchorOptionValue('step_done', s.draftId)}>
                                  Counts from: {s.title || 'Untitled step'} — done
                                </option>
                              ))}
                              {(Object.keys(DEADLINE_KIND_LABELS) as DeadlineKind[]).map(kind => (
                                <option key={kind} value={anchorOptionValue('deadline', kind)}>
                                  Counts from deadline: {DEADLINE_KIND_LABELS[kind]}
                                </option>
                              ))}
                            </select>

                            <label className="flex items-center gap-1 text-xs text-ink-soft dark:text-plate-ink-soft">
                              Offset
                              <input
                                type="number"
                                min={0}
                                value={step.offsetDays}
                                onChange={e => updateStep(i, { offsetDays: e.target.value })}
                                className="w-16 px-2 py-1 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-xs text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                              />
                              days
                            </label>

                            <label className="flex items-center gap-1 text-xs text-ink-soft dark:text-plate-ink-soft">
                              Takes
                              <input
                                type="number"
                                min={0}
                                value={step.durationMin}
                                onChange={e => updateStep(i, { durationMin: e.target.value })}
                                placeholder="min"
                                className="w-14 px-2 py-1 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-xs text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                              />
                              –
                              <input
                                type="number"
                                min={0}
                                value={step.durationMax}
                                onChange={e => updateStep(i, { durationMax: e.target.value })}
                                placeholder="max"
                                className="w-14 px-2 py-1 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-xs text-ink dark:text-plate-ink outline-none focus:border-edamame/50"
                              />
                              days
                            </label>

                            <label className="flex items-center gap-1.5 text-xs text-ink-soft dark:text-plate-ink-soft">
                              <input
                                type="checkbox"
                                checked={step.fixed}
                                onChange={e => updateStep(i, { fixed: e.target.checked })}
                                className="rounded border-ink/30"
                              />
                              Set by law
                            </label>

                            <label className="flex items-center gap-1.5 text-xs text-ink-soft dark:text-plate-ink-soft">
                              <input
                                type="checkbox"
                                checked={step.isGate}
                                onChange={e => updateStep(i, { isGate: e.target.checked })}
                                className="rounded border-ink/30"
                              />
                              Gate
                            </label>
                          </div>
                        </div>

                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => moveStep(i, -1)}
                            disabled={i === 0}
                            className="p-1 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft disabled:opacity-25 disabled:cursor-not-allowed"
                            aria-label="Move step up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(i, 1)}
                            disabled={i === editor.steps.length - 1}
                            className="p-1 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft disabled:opacity-25 disabled:cursor-not-allowed"
                            aria-label="Move step down"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStep(i)}
                            className="p-1 text-ink-faint dark:text-plate-ink-faint hover:text-red-500 dark:hover:text-red-400"
                            aria-label="Remove step"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {errors.length > 0 && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-900/30 rounded-xl px-4 py-3">
                <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 text-red-500" />
                <ul className="text-xs text-red-700 dark:text-red-400 space-y-1">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={closeEditor}
                className="px-4 py-2 text-sm font-semibold text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate-card rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="btn-press px-5 py-2 text-sm font-semibold bg-edamame hover:bg-edamame-600 text-white rounded-xl shadow-sm shadow-edamame/20 transition-all"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* System templates */}
      {systemTemplates.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[22px] h-px bg-ink/20 dark:bg-plate-ink/20" />
            <span className="text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.12em]">
              Built-in Templates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {systemTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* User templates */}
      {userTemplates.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[22px] h-px bg-ink/20 dark:bg-plate-ink/20" />
            <span className="text-[9.5px] font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-[0.12em]">
              Custom Templates
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {userTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i + systemTemplates.length} />
            ))}
          </div>
        </div>
      )}

        {templates.length === 0 && (
          <div className="text-center py-20">
            <div className="flex flex-col items-center gap-3 text-ink-faint dark:text-plate-ink-faint">
              <FileText size={36} className="opacity-25" />
              <p className="text-sm">No templates yet. Create your first template to get started.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
