import React, { useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { WorkflowTemplate } from '../../types';
import { EXISTING_TASKS_CHOICES, orderPlansForSubclass, type ExistingTasksChoice } from '../../lib/visaPlanChange';
import { subclassShortLabel } from '../../lib/visaTypes';

/**
 * "Set up tasks for this visa" (Work Plans spec, step 4). Shown when a case's
 * subclass changes to a real one. The agent must pick a Work Plan (matching
 * plans first) and choose what happens to the current tasks. Nothing is saved
 * until Confirm; Cancel leaves the case exactly as it was.
 */

interface Props {
  subclass: string;
  substream?: string;
  templates: WorkflowTemplate[];
  currentTaskCount: number;
  openTaskCount: number;
  busy: boolean;
  onConfirm: (planId: string, existing: ExistingTasksChoice) => void;
  onCancel: () => void;
}

export const ChangeVisaPlanDialog: React.FC<Props> = ({
  subclass, substream, templates, currentTaskCount, openTaskCount, busy, onConfirm, onCancel,
}) => {
  const { matching, others } = useMemo(() => orderPlansForSubclass(templates, subclass, substream), [templates, subclass, substream]);
  const [planId, setPlanId] = useState(matching[0]?.id ?? '');
  const [existing, setExisting] = useState<ExistingTasksChoice>('none');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const plan = templates.find(t => t.id === planId);
  const stepCount = plan?.steps?.length ?? 0;
  const phaseCount = new Set((plan?.steps ?? []).map(s => s.phase).filter(Boolean)).size;

  const confirm = () => {
    if (!planId) return;
    if (existing === 'delete' && currentTaskCount > 0 && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onConfirm(planId, existing);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="visa-plan-title">
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-ink/10 dark:border-plate-ink/15">
        <div className="p-6 border-b border-ink/10 dark:border-plate-ink/15 flex items-start justify-between gap-3">
          <div>
            <h3 id="visa-plan-title" className="text-lg font-bold text-ink dark:text-plate-ink">Set up tasks for this visa</h3>
            <p className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5">
              Visa: {subclassShortLabel(subclass, substream)}
            </p>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label="Cancel" className="p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label htmlFor="visa-plan-select" className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1">
              Work Plan <span className="normal-case font-normal">(required)</span>
            </label>
            <select
              id="visa-plan-select"
              value={planId}
              onChange={e => setPlanId(e.target.value)}
              disabled={busy}
              className="w-full px-4 py-2.5 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-xl focus:ring-2 focus:ring-edamame outline-none text-ink dark:text-plate-ink"
            >
              <option value="">Select a work plan…</option>
              {matching.length > 0 && (
                <optgroup label="Matches this visa">
                  {matching.map(t => (
                    <option key={t.id} value={t.id}>{t.title}{t.visaSubstream ? ` · ${t.visaSubstream}` : ''}</option>
                  ))}
                </optgroup>
              )}
              {others.length > 0 && (
                <optgroup label="Other plans">
                  {others.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </optgroup>
              )}
            </select>
            <p className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mt-1.5">
              {plan
                ? stepCount > 0
                  ? `${stepCount} task${stepCount === 1 ? '' : 's'}${phaseCount ? ` across ${phaseCount} phase${phaseCount === 1 ? '' : 's'}` : ''} will be added, dated from today.`
                  : 'This plan has no steps, so no tasks will be added — you can generate them with AI from the case afterwards.'
                : matching.length === 0
                  ? 'No plan matches this visa yet — pick another plan.'
                  : ''}
            </p>
          </div>

          <fieldset>
            <legend className="block text-xs font-bold text-ink-faint dark:text-plate-ink-faint uppercase tracking-wider mb-1.5">
              What should happen to the current tasks?
            </legend>
            {currentTaskCount === 0 ? (
              <p className="text-[12.5px] text-ink-soft dark:text-plate-ink-soft">This case has no tasks yet.</p>
            ) : (
              <div className="space-y-1">
                {EXISTING_TASKS_CHOICES.map(c => (
                  <label key={c.value} className="flex items-start gap-2.5 py-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="existing-tasks"
                      value={c.value}
                      checked={existing === c.value}
                      onChange={() => { setExisting(c.value); setConfirmDelete(false); }}
                      disabled={busy}
                      className="mt-1 accent-edamame-500"
                    />
                    <span>
                      <span className="text-[13px] font-semibold text-ink dark:text-plate-ink">{c.label}</span>{' '}
                      <span className="text-[12px] text-ink-faint dark:text-plate-ink-faint">
                        {c.value === 'delete'
                          ? `Remove all ${currentTaskCount} current task${currentTaskCount === 1 ? '' : 's'}.`
                          : c.value === 'done'
                            ? `Close ${openTaskCount} open task${openTaskCount === 1 ? '' : 's'} as done.`
                            : c.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          {confirmDelete && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 px-3.5 py-3 text-[12.5px] text-red-700 dark:text-red-300">
              <AlertTriangle size={15} className="flex-shrink-0 mt-px" />
              <span>
                This permanently deletes {currentTaskCount} task{currentTaskCount === 1 ? '' : 's'}. Click <strong>Delete and continue</strong> to go ahead.
              </span>
            </div>
          )}
        </div>

        <div className="p-6 bg-paper-2 dark:bg-plate-card/50 border-t border-ink/10 dark:border-plate-ink/15 flex justify-end gap-3">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-sm font-bold text-ink-soft dark:text-plate-ink-soft hover:text-ink">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!planId || busy}
            className={`px-6 py-2 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-40 ${
              confirmDelete ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-edamame hover:bg-edamame-600 shadow-edamame/20'
            }`}
          >
            {busy ? 'Applying…' : confirmDelete ? 'Delete and continue' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeVisaPlanDialog;
