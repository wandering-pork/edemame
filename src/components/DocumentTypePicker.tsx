import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronDown, Tag } from 'lucide-react';
import { useDocumentTypes } from '@/contexts/DocumentTypeContext';
import { filterDocumentTypes, groupDocumentTypes, OTHER_DOCUMENT_TYPE_CODE } from '@/lib/documentTypes';
import type { DocumentType } from '../types';

interface DocumentTypePickerProps {
  value?: string;
  onChange: (code: string) => void;
  /** Rendered on the trigger when nothing is selected. */
  placeholder?: string;
  /** Tighter trigger for inline use inside a checklist row. */
  compact?: boolean;
  /** Marks the trigger when a value is required but missing. */
  invalid?: boolean;
  className?: string;
}

/**
 * Search-as-you-type Document Type picker, grouped by category (issue #4 §3.5).
 *
 * The list runs to ~90 rows, so a flat <select> is unusable — typing filters on
 * both code and description, and `OTH — Other` is always reachable as the
 * escape hatch so a user is never blocked by an uncategorisable document.
 */
export const DocumentTypePicker: React.FC<DocumentTypePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select a document type…',
  compact,
  invalid,
  className = '',
}) => {
  const { documentTypes, byCode } = useDocumentTypes();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected: DocumentType | undefined = value ? byCode.get(value) : undefined;

  const groups = useMemo(() => groupDocumentTypes(filterDocumentTypes(documentTypes, query)), [documentTypes, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={selected ? `${selected.code} — ${selected.description}` : placeholder}
        className={`w-full flex items-center gap-1.5 rounded-lg border text-left transition-colors ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-[12.5px]'
        } ${
          invalid
            ? 'border-red-400 dark:border-red-500/60 bg-red-50/60 dark:bg-red-900/10'
            : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 hover:border-edamame'
        }`}
      >
        <Tag size={compact ? 10 : 12} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
        {selected ? (
          <>
            <span className="font-mono font-bold text-gray-800 dark:text-slate-200 flex-shrink-0">{selected.code}</span>
            <span className="text-gray-500 dark:text-slate-400 truncate">{selected.description}</span>
          </>
        ) : value ? (
          // A code with no matching row (the firm deleted the type after tagging).
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{value}</span>
        ) : (
          <span className="text-gray-400 dark:text-slate-500 truncate">{placeholder}</span>
        )}
        <ChevronDown size={compact ? 11 : 13} className="ml-auto text-gray-400 dark:text-slate-500 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 min-w-[260px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-800 overflow-hidden modal-content">
          <div className="relative border-b border-gray-100 dark:border-slate-800">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 dark:text-slate-600" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const first = groups[0]?.[1]?.[0];
                  if (first) pick(first.code);
                }
              }}
              placeholder="Search by code or description…"
              className="w-full pl-8 pr-3 py-2.5 bg-transparent text-[12px] text-gray-800 dark:text-slate-200 outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11.5px] text-gray-400 dark:text-slate-500">
                No document type matches "{query}". Use{' '}
                <button type="button" onClick={() => pick(OTHER_DOCUMENT_TYPE_CODE)} className="font-bold text-edamame hover:underline">
                  {OTHER_DOCUMENT_TYPE_CODE} — Other
                </button>
                .
              </div>
            ) : (
              groups.map(([category, types]) => (
                <div key={category}>
                  <div className="px-3 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-slate-500">
                    {category}
                  </div>
                  {types.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.code)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                        t.code === value ? 'bg-edamame/[0.06] dark:bg-edamame/[0.08]' : ''
                      }`}
                    >
                      <span className="font-mono text-[11px] font-bold text-gray-700 dark:text-slate-300 w-14 flex-shrink-0">{t.code}</span>
                      <span className="text-[11.5px] text-gray-600 dark:text-slate-400 truncate flex-1">{t.description}</span>
                      {t.autoLink && (
                        <span
                          title="Auto-link is on for this Document Type"
                          className="text-[8.5px] font-bold px-1.5 py-px rounded-full bg-edamame/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0"
                        >
                          AUTO
                        </span>
                      )}
                      {t.code === value && <Check size={12} className="text-edamame flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Read-only code badge used on checklist rows and Case Files entries. */
export const DocumentTypeBadge: React.FC<{ code?: string; className?: string }> = ({ code, className = '' }) => {
  const { byCode } = useDocumentTypes();
  if (!code) return null;
  const type = byCode.get(code);
  return (
    <span
      title={type ? `${type.code} — ${type.description}` : `${code} — this Document Type is no longer configured`}
      className={`inline-flex items-center font-mono text-[9.5px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-md ${
        type
          ? 'bg-slate-500/[0.13] text-slate-600 dark:text-slate-300'
          : 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400'
      } ${className}`}
    >
      {code}
    </span>
  );
};

export default DocumentTypePicker;
