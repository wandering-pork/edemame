import React, { useState } from 'react';
import { Plus, Check, Pencil, Eye, EyeOff, RotateCcw, Trash2, ArrowUp, ArrowDown, Lock } from 'lucide-react';
import { useVisaConfig } from '@/contexts/VisaConfigContext';
import { isEditedPhase, PHASE_NAME_MAX, sortCasePhases } from '@/lib/casePhases';

/**
 * Configuration → Work Plans → Phases. The firm's ordered phase list; Work
 * Plan steps and case tasks are grouped by phase. Consultation is required:
 * always first, can't be renamed, hidden or removed.
 */

const inputClass =
  'px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame';
const iconBtn =
  'focus-ring p-1.5 rounded-md text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-ink/5 dark:hover:bg-plate-ink/10 transition-colors disabled:opacity-30 disabled:pointer-events-none';

export const CasePhaseSettings: React.FC = () => {
  const {
    casePhases, loading, addCasePhase, renameCasePhase, setCasePhaseHidden, deleteCasePhase, moveCasePhase, resetCasePhase,
  } = useVisaConfig();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phases = sortCasePhases(casePhases);
  const firstMovable = phases.findIndex(p => !p.required);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    }
  };

  const add = async () => {
    if (await run(() => addCasePhase(newName))) setNewName('');
  };

  const saveRename = async (id: string) => {
    if (await run(() => renameCasePhase(id, editName))) setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-bold text-ink dark:text-plate-ink">Phases</h2>
        <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mt-0.5 leading-relaxed">
          The phases a case moves through, in order. Each Work Plan task belongs to a phase, and a case's tasks are
          grouped by phase. This is separate from a case's stage (Draft → Closed), which you still set on the case.
        </p>
      </div>

      {error && (
        <div role="alert" className="text-[11.5px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-[12px] text-ink-faint dark:text-plate-ink-faint">Loading phases…</div>
      ) : (
        <ol className="rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
          {phases.map((p, i) => {
            const edited = isEditedPhase(p);
            return (
              <li key={p.id} className={`flex items-center gap-3 px-4 py-2.5 border-t first:border-t-0 border-ink/10 dark:border-plate-ink/15 ${p.hidden ? 'opacity-55' : ''}`}>
                <span className="w-6 text-[11px] font-bold text-ink-faint dark:text-plate-ink-faint tabular-nums flex-shrink-0">{i + 1}</span>
                {editingId === p.id ? (
                  <div className="flex-1 flex gap-2 min-w-0">
                    <label className="sr-only" htmlFor={`phase-${p.id}`}>Phase name</label>
                    <input
                      id={`phase-${p.id}`}
                      value={editName}
                      maxLength={PHASE_NAME_MAX}
                      autoFocus
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); saveRename(p.id); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                    <button onClick={() => saveRename(p.id)} className="inline-flex items-center gap-1 px-3 py-2 bg-edamame hover:bg-edamame-600 text-white font-bold rounded-lg text-[12px]">
                      <Check size={13} /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="px-3 py-2 text-[12px] font-semibold rounded-lg text-ink-soft dark:text-plate-ink-soft hover:bg-ink/5 dark:hover:bg-plate-ink/10">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-ink dark:text-plate-ink truncate">{p.name}</span>
                )}
                {editingId !== p.id && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {p.required && (
                      <span title="Required — always first, can't be renamed, hidden or removed" className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400">
                        <Lock size={9} /> Required
                      </span>
                    )}
                    {p.hidden && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink/5 dark:bg-plate-ink/10 text-ink-soft dark:text-plate-ink-soft">Hidden</span>}
                    {edited && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">Edited</span>}
                    {confirmDeleteId === p.id ? (
                      <>
                        <button onClick={() => { setConfirmDeleteId(null); run(() => deleteCasePhase(p.id)); }}
                          className="px-2 py-0.5 text-[10.5px] font-bold rounded bg-red-600 hover:bg-red-700 text-white">Delete</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-[10.5px] font-semibold rounded text-ink-soft dark:text-plate-ink-soft">Cancel</button>
                      </>
                    ) : !p.required && (
                      <>
                        <button onClick={() => run(() => moveCasePhase(p.id, -1))} disabled={i <= firstMovable} className={iconBtn}
                          aria-label={`Move ${p.name} up`} title="Move up"><ArrowUp size={13} /></button>
                        <button onClick={() => run(() => moveCasePhase(p.id, 1))} disabled={i === phases.length - 1} className={iconBtn}
                          aria-label={`Move ${p.name} down`} title="Move down"><ArrowDown size={13} /></button>
                        <button onClick={() => { setEditingId(p.id); setEditName(p.name); setError(null); }} className={iconBtn}
                          aria-label={`Rename ${p.name}`} title="Rename"><Pencil size={13} /></button>
                        {edited && (
                          <button onClick={() => run(() => resetCasePhase(p.id))} className={iconBtn}
                            aria-label={`Reset ${p.name} to its built-in name`} title="Reset to built-in name"><RotateCcw size={13} /></button>
                        )}
                        <button onClick={() => run(() => setCasePhaseHidden(p.id, !p.hidden))} className={iconBtn}
                          aria-label={p.hidden ? `Show ${p.name}` : `Hide ${p.name}`} title={p.hidden ? 'Show again' : 'Hide'}>
                          {p.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                        {!p.isSystemDefault && (
                          <button onClick={() => setConfirmDeleteId(p.id)} className={`${iconBtn} hover:!text-red-600`}
                            aria-label={`Delete ${p.name}`} title="Delete"><Trash2 size={13} /></button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="new-phase">New phase name</label>
        <input
          id="new-phase"
          value={newName}
          maxLength={PHASE_NAME_MAX}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="New phase name — added at the end"
          className={`${inputClass} flex-1 min-w-0`}
        />
        <button onClick={add} disabled={!newName.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[12px] transition-colors">
          <Plus size={13} /> Add phase
        </button>
      </div>
    </div>
  );
};

export default CasePhaseSettings;
