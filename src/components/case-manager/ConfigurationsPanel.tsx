import React, { useMemo, useState } from 'react';
import { X, Search, Settings2, Tags, Plus, Trash2, Lock, Info, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useDocumentTypes } from '@/contexts/DocumentTypeContext';
import {
  DOCUMENT_TYPE_CODE_MAX,
  DOCUMENT_TYPE_CATEGORY_ORDER,
  DOCUMENT_TYPE_DESCRIPTION_MAX,
  filterDocumentTypes,
  groupDocumentTypes,
} from '@/lib/documentTypes';

/**
 * Case Manager → Configurations (GitHub issue #4 §3).
 *
 * Module-level settings, distinct from the account-level `pages/Settings.tsx`.
 * Built as a left-nav-of-setting-types + right-detail-pane shell so future
 * setting types (case-status workflows, category presets) drop into
 * SETTING_TYPES as siblings without restructuring the container (§3.2). This
 * round ships exactly one: Document Type.
 */

type SettingTypeId = 'document-types';

interface SettingTypeDef {
  id: SettingTypeId;
  label: string;
  description: string;
  icon: React.ElementType;
}

const SETTING_TYPES: SettingTypeDef[] = [
  {
    id: 'document-types',
    label: 'Document Type',
    description: 'The firm-wide list of document types, and which of them auto-link.',
    icon: Tags,
  },
];

const AUTO_LINK_HINT =
  'When ticked, a Case File tagged with this Document Type will automatically link itself to any matching Document Checklist item once uploaded.';

export const ConfigurationsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [activeType, setActiveType] = useState<SettingTypeId>('document-types');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-paper-2 dark:bg-plate-card rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-ink/10 dark:border-plate-ink/15 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-ink/10 dark:border-plate-ink/15 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-edamame/10 dark:bg-edamame/15 flex items-center justify-center">
              <Settings2 size={15} className="text-edamame" />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-ink dark:text-plate-ink leading-tight">Case Manager Configurations</h3>
              <p className="text-[11px] text-ink-faint dark:text-plate-ink-faint">
                Settings that apply across every case in this account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-faint dark:text-plate-ink-faint hover:text-ink-soft dark:hover:text-plate-ink-soft rounded-lg hover:bg-paper-2 dark:hover:bg-plate-card transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Left nav of setting types + right detail pane */}
        <div className="flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-[220px_1fr]">
          <nav className="hidden sm:block border-r border-ink/10 dark:border-plate-ink/15 p-3 space-y-1 overflow-y-auto custom-scrollbar">
            {SETTING_TYPES.map(t => {
              const Icon = t.icon;
              const isActive = t.id === activeType;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveType(t.id)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    isActive
                      ? 'bg-edamame/[0.08] dark:bg-edamame/[0.12] text-edamame-700 dark:text-edamame-400'
                      : 'text-ink-soft dark:text-plate-ink-soft hover:bg-paper-2 dark:hover:bg-plate'
                  }`}
                >
                  <Icon size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="text-[12.5px] font-bold leading-tight">{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 overflow-y-auto custom-scrollbar p-5">
            {activeType === 'document-types' && <DocumentTypeSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};

const DocumentTypeSettings: React.FC = () => {
  const { documentTypes, loading, addDocumentType, updateDocumentType, deleteDocumentType } = useDocumentTypes();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code: '', description: '', category: DOCUMENT_TYPE_CATEGORY_ORDER[0] });

  const groups = useMemo(() => groupDocumentTypes(filterDocumentTypes(documentTypes, query)), [documentTypes, query]);
  const autoLinkCount = documentTypes.filter(t => t.autoLink).length;

  const toggleCollapsed = (cat: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const handleAdd = async () => {
    await run(async () => {
      await addDocumentType(form);
      setForm({ code: '', description: '', category: form.category });
      setAdding(false);
    });
  };

  const categoryOptions = useMemo(() => {
    const custom = documentTypes.map(t => t.category).filter(c => !DOCUMENT_TYPE_CATEGORY_ORDER.includes(c));
    return [...DOCUMENT_TYPE_CATEGORY_ORDER, ...Array.from(new Set(custom))];
  }, [documentTypes]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-[14px] font-bold text-ink dark:text-plate-ink">Document Type</h4>
        <p className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft mt-0.5 leading-relaxed">
          The shared vocabulary for classifying Case Files and Document Checklist items. System defaults are locked —
          you can still choose which of them auto-link, and add your own types below.
        </p>
      </div>

      {/* Search + auto-link legend */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/40 dark:text-plate-ink-soft/40" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by code, description or category…"
            className="w-full pl-8 pr-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12px] text-ink-soft dark:text-plate-ink-soft outline-none focus:border-edamame transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-ink-faint dark:text-plate-ink-faint">
            {autoLinkCount} of {documentTypes.length} auto-link
          </span>
          <button
            onClick={() => { setAdding(a => !a); setError(null); }}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white transition-colors"
          >
            <Plus size={12} /> Add type
          </button>
        </div>
      </div>

      {adding && (
        <div className="rounded-xl border border-dashed border-ink/15 dark:border-plate-ink/20 p-3.5 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
              maxLength={DOCUMENT_TYPE_CODE_MAX}
              placeholder="CODE"
              className="sm:w-28 px-3 py-2 font-mono uppercase bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
            />
            <input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              maxLength={DOCUMENT_TYPE_DESCRIPTION_MAX}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              placeholder="Description"
              className="flex-1 min-w-0 px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
            />
            <select
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              className="sm:w-56 px-3 py-2 bg-paper-2 dark:bg-plate-card border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
            >
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleAdd}
              disabled={!form.code.trim() || !form.description.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-edamame hover:bg-edamame-600 disabled:opacity-40 text-white font-bold rounded-lg text-[12px] transition-colors flex-shrink-0"
            >
              <Check size={13} /> Save
            </button>
          </div>
          <p className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint">
            Code: up to {DOCUMENT_TYPE_CODE_MAX} characters, uppercase letters and digits only, unique within your firm.
          </p>
        </div>
      )}

      {error && (
        <div className="text-[11.5px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Column header with the auto-link hint */}
      <div className="flex items-center justify-end gap-1.5 pr-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-faint dark:text-plate-ink-faint">Auto-link</span>
        <span title={AUTO_LINK_HINT} className="text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-edamame cursor-help">
          <Info size={12} />
        </span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-[12px] text-ink-faint dark:text-plate-ink-faint">Loading document types…</div>
      ) : groups.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-ink-faint dark:text-plate-ink-faint">
          {documentTypes.length === 0 ? 'No document types configured.' : `No document type matches "${query}".`}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(([category, types]) => {
            const isCollapsed = collapsed.has(category) && !query;
            return (
              <div key={category} className="rounded-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden">
                <button
                  onClick={() => toggleCollapsed(category)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-paper-2/60 dark:bg-plate-card/40 dark:bg-plate-card/40"
                >
                  <span className="text-[12px] font-bold text-ink dark:text-plate-ink">{category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-bold text-ink-faint dark:text-plate-ink-faint">{types.length}</span>
                    {isCollapsed ? <ChevronRight size={13} className="text-ink-faint dark:text-plate-ink-faint" /> : <ChevronDown size={13} className="text-ink-faint dark:text-plate-ink-faint" />}
                  </div>
                </button>
                {!isCollapsed && types.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-2 border-t border-ink/10 dark:border-plate-ink/15"
                  >
                    <span className="font-mono text-[11.5px] font-bold text-ink dark:text-plate-ink-soft w-16 flex-shrink-0">{t.code}</span>
                    <span className="flex-1 min-w-0 text-[12px] text-ink-soft dark:text-plate-ink-soft truncate">{t.description}</span>
                    {t.isSystemDefault ? (
                      <span title="System default — cannot be renamed, recoded or deleted" className="text-ink-soft/40 dark:text-plate-ink-soft/40 flex-shrink-0">
                        <Lock size={11} />
                      </span>
                    ) : confirmDeleteId === t.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setConfirmDeleteId(null); run(() => deleteDocumentType(t.id)); }}
                          className="px-2 py-0.5 text-[10.5px] font-bold rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 text-[10.5px] font-semibold rounded text-ink-soft dark:text-plate-ink-soft hover:text-ink-soft dark:hover:text-plate-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(t.id)}
                        title="Delete this firm-added document type"
                        className="p-1 text-ink-soft/40 dark:text-plate-ink-soft/40 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    <label title={AUTO_LINK_HINT} className="flex items-center flex-shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.autoLink}
                        onChange={e => run(() => updateDocumentType(t.id, { autoLink: e.target.checked }))}
                        className="w-3.5 h-3.5 accent-edamame cursor-pointer"
                      />
                    </label>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10.5px] text-ink-faint dark:text-plate-ink-faint leading-relaxed">
        Changing an auto-link setting doesn't rewrite existing checklists straight away — it takes effect the next time
        a case's Document Checklist tab is opened or refreshed. Verified and Waived items are never changed by auto-link.
      </p>
    </div>
  );
};

export default ConfigurationsPanel;
