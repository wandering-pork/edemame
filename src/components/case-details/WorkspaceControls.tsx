import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Sparkles } from 'lucide-react';

export interface WorkspaceMenuItem {
  id: string;
  label: string;
  group: string;
  /** Short secondary text, e.g. a count. */
  hint?: string;
  /** Ranked first in its group with an "AI pick" tag, from the Agent chat's recommendations. */
  recommended?: boolean;
  onSelect: () => void;
}

export interface WorkspaceQuickAction {
  id: string;
  label: string;
  /** Second line, shown only by the card layout (`WorkspaceSuggestionCards`). */
  detail?: string;
  onSelect: () => void;
}

/** Searchable, grouped View/Tools dropdown shared by every Workspace layout. */
export const WorkspaceMenu: React.FC<{
  label: string;
  items: WorkspaceMenuItem[];
  buttonCls: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Which way the menu opens from its button. */
  placement?: 'up' | 'down';
  align?: 'left' | 'right';
}> = ({ label, items, buttonCls, open, onToggle, onClose, placement = 'down', align = 'left' }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // Grouped, recommended-first within each group; flat order drives keyboard navigation.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? items.filter(i => `${i.label} ${i.group} ${i.hint ?? ''}`.toLowerCase().includes(q)) : items;
    const order: string[] = [];
    const byGroup = new Map<string, WorkspaceMenuItem[]>();
    for (const item of matched) {
      if (!byGroup.has(item.group)) { byGroup.set(item.group, []); order.push(item.group); }
      byGroup.get(item.group)!.push(item);
    }
    return order.map(g => ({
      group: g,
      items: [...byGroup.get(g)!].sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended)),
    }));
  }, [items, query]);
  const flat = groups.flatMap(g => g.items);

  const select = (item: WorkspaceMenuItem | undefined) => {
    if (!item) return;
    onClose();
    item.onSelect();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold whitespace-nowrap transition ${buttonCls}`}
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} z-50 w-[290px] bg-paper-2 dark:bg-plate-card rounded-xl shadow-2xl border border-ink/10 dark:border-plate-ink/15 p-2 text-left modal-content`}>
          <div className="relative mb-1.5">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); onClose(); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flat.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); select(flat[activeIndex]); }
              }}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
              className="w-full pl-8 pr-2.5 py-1.5 bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 rounded-lg text-[12.5px] text-ink dark:text-plate-ink outline-none focus:border-edamame"
            />
          </div>
          <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto custom-scrollbar">
            {groups.map(({ group, items: groupItems }) => (
              <div key={group}>
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-faint dark:text-plate-ink-faint">{group}</div>
                {groupItems.map(item => {
                  const index = flat.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => select(item)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-left text-ink dark:text-plate-ink ${index === activeIndex ? 'bg-edamame/10 dark:bg-edamame/15' : ''}`}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.recommended && (
                        <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-edamame/10 text-edamame-700 dark:text-edamame-400 flex-shrink-0">AI PICK</span>
                      )}
                      {item.hint && <span className="ml-auto text-[11px] text-ink-faint dark:text-plate-ink-faint whitespace-nowrap">{item.hint}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {flat.length === 0 && (
              <div className="px-2 py-2.5 text-[12px] text-ink-faint dark:text-plate-ink-faint">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** Suggested next steps as stacked cards (label + detail), for the side-card and drawer layouts. */
export const WorkspaceSuggestionCards: React.FC<{ actions: WorkspaceQuickAction[] }> = ({ actions }) => (
  <div className="space-y-2">
    {actions.map(action => (
      <button
        key={action.id}
        type="button"
        onClick={action.onSelect}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-ink/10 dark:border-plate-ink/15 bg-paper-2 dark:bg-plate-card text-left hover:border-edamame hover:shadow-md transition"
      >
        <span className="w-7 h-7 rounded-lg bg-edamame/10 text-edamame-700 dark:text-edamame-400 flex items-center justify-center flex-shrink-0">
          <Sparkles size={13} />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-ink dark:text-plate-ink">{action.label}</span>
          {action.detail && <span className="block text-[11px] text-ink-faint dark:text-plate-ink-faint truncate">{action.detail}</span>}
        </span>
      </button>
    ))}
  </div>
);
