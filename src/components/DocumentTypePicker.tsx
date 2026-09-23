import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Rendered in a portal (see below) so the dropdown can never be clipped by
  // an ancestor's `overflow-hidden`/`overflow-auto` — it was previously
  // absolutely-positioned inside the trigger's own container, which cut the
  // panel off whenever that container (e.g. the Case Files upload staging
  // list) was shorter than the open dropdown.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected: DocumentType | undefined = value ? byCode.get(value) : undefined;

  const groups = useMemo(() => groupDocumentTypes(filterDocumentTypes(documentTypes, query)), [documentTypes, query]);

  const updatePanelPos = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < panelHeight && rect.top > spaceBelow;
    setPanelPos({
      top: openUpward ? Math.max(8, rect.top - panelHeight - 4) : rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - rect.width - 8),
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPos();
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Recompute once the panel has actually rendered/sized itself, so an
    // initial "open downward" guess flips to "open upward" if the real
    // (filtered-results) height wouldn't fit.
    updatePanelPos();
  }, [open, groups.length]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    const reposition = () => updatePanelPos();
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        title={selected ? `${selected.code} — ${selected.description}` : placeholder}
        className={`w-full flex items-center gap-1.5 rounded-lg border text-left transition-colors ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-[12.5px]'
        } ${
          invalid
            ? 'border-red-400 dark:border-red-500/60 bg-red-50/60 dark:bg-red-900/10'
            : 'border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card hover:border-edamame'
        }`}
      >
        <Tag size={compact ? 10 : 12} className="text-ink-faint dark:text-plate-ink-faint flex-shrink-0" />
        {selected ? (
          <>
            <span className="font-mono font-bold text-ink dark:text-plate-ink-soft flex-shrink-0">{selected.code}</span>
            <span className="text-ink-soft dark:text-plate-ink-soft truncate">{selected.description}</span>
          </>
        ) : value ? (
          // A code with no matching row (the firm deleted the type after tagging).
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{value}</span>
        ) : (
          <span className="text-ink-faint dark:text-plate-ink-faint truncate">{placeholder}</span>
        )}
        <ChevronDown size={compact ? 11 : 13} className="ml-auto text-ink-faint dark:text-plate-ink-faint flex-shrink-0" />
      </button>

      {open && panelPos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: panelPos.top, left: panelPos.left, width: Math.max(panelPos.width, 260) }}
          className="z-[70] bg-paper-2 dark:bg-plate-card rounded-xl shadow-xl border border-ink/15 dark:border-plate-ink/20 overflow-hidden modal-content"
        >
          <div className="relative border-b border-ink/10 dark:border-plate-ink/15">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft/40 dark:text-plate-ink-soft/40" />
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
              className="w-full pl-8 pr-3 py-2.5 bg-transparent text-[12px] text-ink dark:text-plate-ink-soft outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto custom-scrollbar py-1">
            {groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11.5px] text-ink-faint dark:text-plate-ink-faint">
                No document type matches "{query}". Use{' '}
                <button type="button" onClick={() => pick(OTHER_DOCUMENT_TYPE_CODE)} className="font-bold text-edamame hover:underline">
                  {OTHER_DOCUMENT_TYPE_CODE} — Other
                </button>
                .
              </div>
            ) : (
              groups.map(([category, types]) => (
                <div key={category}>
                  <div className="px-3 pt-2 pb-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-faint dark:text-plate-ink-faint">
                    {category}
                  </div>
                  {types.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.code)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-paper-2 dark:hover:bg-plate transition-colors ${
                        t.code === value ? 'bg-edamame/[0.06] dark:bg-edamame/[0.08]' : ''
                      }`}
                    >
                      <span className="font-mono text-[11px] font-bold text-ink-soft dark:text-plate-ink-soft w-14 flex-shrink-0">{t.code}</span>
                      <span className="text-[11.5px] text-ink-soft dark:text-plate-ink-soft truncate flex-1">{t.description}</span>
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
        </div>,
        document.body,
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
          ? 'bg-slate-500/[0.13] text-ink-soft dark:text-plate-ink-soft'
          : 'bg-amber-500/[0.13] text-amber-700 dark:text-amber-400'
      } ${className}`}
    >
      {code}
    </span>
  );
};

export default DocumentTypePicker;
