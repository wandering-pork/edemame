import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Sparkles } from 'lucide-react';

export interface DockMenuItem {
  id: string;
  label: string;
  group: string;
  /** Short secondary text, e.g. a count. */
  hint?: string;
  /** Ranked first in its group with an "AI pick" tag, from the Agent chat's recommendations. */
  recommended?: boolean;
  onSelect: () => void;
}

export interface DockQuickAction {
  id: string;
  label: string;
  onSelect: () => void;
}

const DockMenu: React.FC<{
  label: string;
  items: DockMenuItem[];
  buttonCls: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}> = ({ label, items, buttonCls, open, onToggle, onClose }) => {
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
    const byGroup = new Map<string, DockMenuItem[]>();
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

  const select = (item: DockMenuItem | undefined) => {
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
        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold text-white whitespace-nowrap transition hover:brightness-110 ${buttonCls}`}
      >
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-[290px] bg-paper-2 dark:bg-plate-card rounded-xl shadow-2xl border border-ink/10 dark:border-plate-ink/15 p-2 text-left modal-content">
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

interface WorkspaceDockProps {
  /** Suggested next steps for the current task (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
  quickActions: DockQuickAction[];
  /** Title of the task the suggestions are for, shown in the caption. */
  currentTaskTitle?: string;
  viewItems: DockMenuItem[];
  toolItems: DockMenuItem[];
}

/**
 * The floating, centred "Workspace" bar pinned to the bottom of Case Details
 * (design option B). Holds suggested quick actions for the current task plus
 * searchable View and Tools menus — it replaces the old Workspace tab's
 * View/Tools tile grid, and is shown on every case tab.
 */
export const WorkspaceDock: React.FC<WorkspaceDockProps> = ({ quickActions, currentTaskTitle, viewItems, toolItems }) => {
  const [openMenu, setOpenMenu] = useState<'view' | 'tools' | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  return (
    <div className="sticky bottom-4 z-30 mt-6 flex justify-center pointer-events-none">
      <div
        ref={dockRef}
        role="toolbar"
        aria-label="Workspace"
        className="pointer-events-auto max-w-full flex flex-wrap justify-center items-center gap-3.5 px-4 py-2.5 rounded-[18px] border border-white/10 bg-gradient-to-br from-[#0e1b2c] to-[#14283f] shadow-[0_18px_40px_rgba(10,20,40,0.35),0_2px_6px_rgba(10,20,40,0.25)]"
      >
        <span className="flex items-center gap-1.5 pr-3.5 border-r border-white/15 text-[13px] font-bold uppercase tracking-[0.12em] text-[#7ee2a8] whitespace-nowrap">
          <Sparkles size={14} />
          Workspace
        </span>

        {quickActions.length > 0 && (
          <div className="flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10.5px] text-[#9db0c5] whitespace-nowrap max-w-[420px] truncate">
              {currentTaskTitle ? <>Suggested for “{currentTaskTitle}”</> : 'Suggested next steps'}
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {quickActions.map(action => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onSelect}
                  className="px-3 py-1.5 rounded-[10px] text-[12px] font-semibold text-[#e8eef6] bg-white/[0.07] border border-white/10 hover:bg-white/[0.14] hover:border-white/30 whitespace-nowrap transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pl-3.5 border-l border-white/15">
          <DockMenu
            label="View"
            items={viewItems}
            buttonCls="bg-gradient-to-br from-blue-500 to-blue-600"
            open={openMenu === 'view'}
            onToggle={() => setOpenMenu(m => (m === 'view' ? null : 'view'))}
            onClose={() => setOpenMenu(null)}
          />
          <DockMenu
            label="Tools"
            items={toolItems}
            buttonCls="bg-gradient-to-br from-violet-400 to-violet-600"
            open={openMenu === 'tools'}
            onToggle={() => setOpenMenu(m => (m === 'tools' ? null : 'tools'))}
            onClose={() => setOpenMenu(null)}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDock;
