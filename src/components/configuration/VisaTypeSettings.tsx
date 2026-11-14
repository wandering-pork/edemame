import React, { useMemo, useState } from 'react';
import { Search, Plus, Check, Pencil, Eye, EyeOff, RotateCcw, Trash2, Info } from 'lucide-react';
import type { VisaType } from '@/types';
import { useVisaConfig } from '@/contexts/VisaConfigContext';
import { displaySubclassCode, filterVisaTypes, isEditedDefault, NOT_CONFIRMED_LABEL } from '@/lib/visaTypes';

/**
 * Configuration → Work Plans → Visa Types. One row per subclass + substream,
 * grouped by subclass. Built-in rows can be edited, hidden and reset; rows the
 * firm adds can also be deleted.
 */

const inputClass =
  'px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame';
const iconBtn =
  'focus-ring p-1.5 rounded-md text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-ink/5 dark:hover:bg-plate-ink/10 transition-colors';

interface FormState {
  subclass: string;
  name: string;
  substream: string;
  note: string;
}

const emptyForm: FormState = { subclass: '', name: '', substream: '', note: '' };

const VisaTypeForm: React.FC<{
  initial: FormState;
  submitLabel: string;
  onSubmit: (f: FormState) => Promise<void>;
  onCancel: () => void;
}> = ({ initial, submitLabel, onSubmit, onCancel }) => {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') onCancel();
  };
  return (
    <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-3.5 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[100px_1fr_1fr] gap-2">
        <label className="sr-only" htmlFor="vt-subclass">Subclass code</label>
        <input id="vt-subclass" value={form.subclass} onChange={e => setForm({ ...form, subclass: e.target.value })} onKeyDown={onKey}
          placeholder="Code, e.g. 189" maxLength={20} className={inputClass} autoFocus />
        <label className="sr-only" htmlFor="vt-name">Subclass name</label>
        <input id="vt-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={onKey}
          placeholder="Subclass name, e.g. Skilled Independent" maxLength={120} className={inputClass} />
        <label className="sr-only" htmlFor="vt-substream">Substream</label>
        <input id="vt-substream" value={form.substream} onChange={e => setForm({ ...form, substream: e.target.value })} onKeyDown={onKey}
          placeholder="Substream (leave blank if none)" maxLength={120} className={inputClass} />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <label className="sr-only" htmlFor="vt-note">Note</label>
        <input id="vt-note" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} onKeyDown={onKey}
          placeholder="Note (optional)" maxLength={500} className={`${inputClass} flex-1 min-w-0`} />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={submit} disabled={busy || !form.subclass.trim() || !form.name.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[12px] transition-colors">
            <Check size={13} /> {submitLabel}
          </button>
          <button onClick={onCancel} className="px-3 py-2 text-[12px] font-semibold rounded-lg text-ink-soft dark:text-plate-ink-soft hover:bg-ink/5 dark:hover:bg-plate-ink/10">
            Cancel
          </button>
        </div>
      </div>
      <p className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint">
        Add one row per substream. Rows with the same code are grouped under one subclass.
      </p>
    </div>
  );
};

export const VisaTypeSettings: React.FC = () => {
  const { visaTypes, loading, addVisaType, updateVisaType, setVisaTypeHidden, deleteVisaType, resetVisaType } = useVisaConfig();
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hiddenCount = visaTypes.filter(t => t.hidden).length;

  const groups = useMemo(() => {
    const rows = filterVisaTypes(visaTypes, query).filter(t => showHidden || !t.hidden);
    const map = new Map<string, VisaType[]>();
    for (const t of rows) map.set(t.subclass, [...(map.get(t.subclass) ?? []), t]);
    return [...map.entries()];
  }, [visaTypes, query, showHidden]);

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[15px] font-bold text-ink dark:text-plate-ink">Visa Types</h2>
        <p className="text-[12px] text-ink-soft dark:text-plate-ink-soft mt-0.5 leading-relaxed">
          The subclasses and substreams offered when you set up a Work Plan or a case. Hide anything your firm
          doesn't handle. <span className="font-semibold">{NOT_CONFIRMED_LABEL}</span> is always available for
          consultation-only plans and cases, so it isn't listed here.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/40 dark:text-plate-ink-soft/40" />
          <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search visa types"
            placeholder="Search by subclass, substream or note…"
            className="w-full pl-8 pr-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12px] text-ink-soft dark:text-plate-ink-soft outline-none focus:border-edamame transition-colors" />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hiddenCount > 0 && (
            <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft dark:text-plate-ink-soft cursor-pointer">
              <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} className="accent-edamame" />
              Show hidden ({hiddenCount})
            </label>
          )}
          <button onClick={() => { setAdding(a => !a); setEditingId(null); setError(null); }}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white transition-colors">
            <Plus size={12} /> Add visa type
          </button>
        </div>
      </div>

      {adding && (
        <VisaTypeForm
          initial={emptyForm}
          submitLabel="Add"
          onCancel={() => setAdding(false)}
          onSubmit={async f => { if (await run(() => addVisaType(f))) setAdding(false); }}
        />
      )}

      {error && (
        <div role="alert" className="text-[11.5px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-[12px] text-ink-faint dark:text-plate-ink-faint">Loading visa types…</div>
      ) : groups.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-ink-faint dark:text-plate-ink-faint">
          {query ? `No visa type matches "${query}".` : 'No visa types yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([subclass, rows]) => (
            <div key={subclass} className="rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-paper-2/60 dark:bg-plate-card/40">
                <span className="text-[12px] font-bold text-ink dark:text-plate-ink">
                  {displaySubclassCode(subclass)} <span className="font-semibold text-ink-soft dark:text-plate-ink-soft">{rows[0].name}</span>
                </span>
                <span className="text-[10.5px] font-bold text-ink-faint dark:text-plate-ink-faint">
                  {rows.filter(r => r.substream).length || 'No'} substream{rows.filter(r => r.substream).length === 1 ? '' : 's'}
                </span>
              </div>
              {rows.map(t => {
                if (editingId === t.id) {
                  return (
                    <div key={t.id} className="px-3 py-2 border-t border-ink/10 dark:border-plate-ink/15">
                      <VisaTypeForm
                        initial={{ subclass: t.subclass, name: t.name, substream: t.substream, note: t.note }}
                        submitLabel="Save"
                        onCancel={() => setEditingId(null)}
                        onSubmit={async f => { if (await run(() => updateVisaType(t.id, f))) setEditingId(null); }}
                      />
                    </div>
                  );
                }
                const edited = isEditedDefault(t);
                return (
                  <div key={t.id} className={`flex items-center gap-3 px-4 py-2 border-t border-ink/10 dark:border-plate-ink/15 ${t.hidden ? 'opacity-55' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] text-ink dark:text-plate-ink truncate">
                        {t.substream || <span className="italic text-ink-faint dark:text-plate-ink-faint">No substream</span>}
                      </div>
                      {t.note && (
                        <div className="text-[11px] text-ink-faint dark:text-plate-ink-faint flex items-start gap-1 mt-0.5">
                          <Info size={11} className="mt-[2px] flex-shrink-0" /> <span>{t.note}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {t.hidden && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink/5 dark:bg-plate-ink/10 text-ink-soft dark:text-plate-ink-soft">Hidden</span>}
                      {edited && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300">Edited</span>}
                      {t.isSystemDefault && !edited && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ink/5 dark:bg-plate-ink/10 text-ink-faint dark:text-plate-ink-faint">Built-in</span>}
                      {confirmDeleteId === t.id ? (
                        <>
                          <button onClick={() => { setConfirmDeleteId(null); run(() => deleteVisaType(t.id)); }}
                            className="px-2 py-0.5 text-[10.5px] font-bold rounded bg-red-600 hover:bg-red-700 text-white">Delete</button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-0.5 text-[10.5px] font-semibold rounded text-ink-soft dark:text-plate-ink-soft">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(t.id); setAdding(false); setError(null); }} className={iconBtn}
                            aria-label={`Edit ${t.subclass} ${t.substream || ''}`.trim()} title="Edit"><Pencil size={13} /></button>
                          {edited && (
                            <button onClick={() => run(() => resetVisaType(t.id))} className={iconBtn}
                              aria-label="Reset to built-in values" title="Reset to built-in values"><RotateCcw size={13} /></button>
                          )}
                          <button onClick={() => run(() => setVisaTypeHidden(t.id, !t.hidden))} className={iconBtn}
                            aria-label={t.hidden ? 'Show' : 'Hide'} title={t.hidden ? 'Show in pickers again' : 'Hide from pickers'}>
                            {t.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          {!t.isSystemDefault && (
                            <button onClick={() => setConfirmDeleteId(t.id)} className={`${iconBtn} hover:!text-red-600`}
                              aria-label="Delete" title="Delete"><Trash2 size={13} /></button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint">
        Hiding a visa type only removes it from pickers — plans and cases already using it keep their value.
      </p>
    </div>
  );
};

export default VisaTypeSettings;
