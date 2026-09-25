import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { Case, Task } from '../types';
import {
  buildPersonPickerEntries, filterPersonPickerEntries, workloadLabel,
  type PersonPickerEntry, type PersonPickerPerson,
} from '../lib/personPicker';

const AVAILABILITY_DOT: Record<string, string> = {
  available: '#10B981',
  busy: '#F59E0B',
  offline: '#94A3B8',
};

const AVAILABILITY_LABEL: Record<string, string> = {
  available: 'Available',
  busy: 'Busy',
  offline: 'Offline',
};

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export interface PersonPickerProps {
  /** Only active/selectable people — the caller filters out disabled/former members before passing them in. */
  people: PersonPickerPerson[];
  cases: Case[];
  tasks: Task[];
  /** Current picker value (a person id), or undefined/null for none selected. */
  value: string | null | undefined;
  onChange: (personId: string | undefined) => void;
  currentUserId?: string;
  /** Shows a selectable "Unassigned" row above the list when true. */
  allowUnassigned?: boolean;
  autoFocus?: boolean;
  /** Called when Esc is pressed with an empty search box — lets a host dialog/popover close itself. */
  onEscape?: () => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Shared searchable person combobox/listbox — see src/lib/personPicker.ts for
 * the pure ordering/filtering/workload logic this renders. Used by
 * AssignCaseDialog, TaskDetailModal's Assignee field, the Case Tasks tab's
 * "Assign to…" row action, and FirmTeamMembers' hand-over panel.
 */
export const PersonPicker: React.FC<PersonPickerProps> = ({
  people, cases, tasks, value, onChange, currentUserId,
  allowUnassigned, autoFocus, onEscape, className, 'aria-label': ariaLabel,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Record<string, HTMLLIElement | null>>({});

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const entries: PersonPickerEntry[] = useMemo(
    () => buildPersonPickerEntries(people, { cases, tasks, currentUserId, currentValueId: value ?? undefined }),
    [people, cases, tasks, currentUserId, value],
  );

  const filtered = useMemo(() => filterPersonPickerEntries(entries, query), [entries, query]);

  // Flat list of selectable ids in render order: "Unassigned" (if offered) then each filtered person.
  const optionIds = useMemo(
    () => (allowUnassigned ? ['__unassigned__', ...filtered.map(e => e.id)] : filtered.map(e => e.id)),
    [allowUnassigned, filtered],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, people]);

  useEffect(() => {
    const activeId = optionIds[activeIndex];
    if (activeId && optionRefs.current[activeId]) {
      optionRefs.current[activeId]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, optionIds]);

  const selectId = (id: string | undefined) => {
    onChange(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, optionIds.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const id = optionIds[activeIndex];
      if (id === '__unassigned__') selectId(undefined);
      else if (id) selectId(id);
    } else if (e.key === 'Escape') {
      if (query) {
        e.preventDefault();
        setQuery('');
      } else if (onEscape) {
        e.preventDefault();
        onEscape();
      }
    }
  };

  return (
    <div className={className}>
      <div className="relative">
        <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="person-picker-listbox"
          aria-activedescendant={optionIds[activeIndex] ? `person-picker-option-${optionIds[activeIndex]}` : undefined}
          aria-label={ariaLabel ?? 'Search people'}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, email, or job title..."
          className="focus-ring w-full pl-9 pr-3 py-2 rounded-lg text-[13px] bg-paper dark:bg-plate border border-ink/15 dark:border-plate-ink/20 focus:border-edamame-500 outline-none transition-colors text-ink dark:text-plate-ink placeholder-ink-soft/50 dark:placeholder-plate-ink-soft/50"
        />
      </div>

      <ul
        id="person-picker-listbox"
        role="listbox"
        ref={listRef}
        aria-label={ariaLabel ?? 'People'}
        className="mt-2 max-h-64 overflow-y-auto space-y-1 pr-0.5"
      >
        {allowUnassigned && (
          <li
            id="person-picker-option-__unassigned__"
            role="option"
            aria-selected={!value}
            ref={el => { optionRefs.current['__unassigned__'] = el; }}
            onClick={() => selectId(undefined)}
            onMouseEnter={() => setActiveIndex(optionIds.indexOf('__unassigned__'))}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] transition-colors ${
              activeIndex === optionIds.indexOf('__unassigned__') ? 'bg-edamame-50 dark:bg-edamame-900/20' : 'hover:bg-paper-2 dark:hover:bg-plate-card'
            } ${!value ? 'ring-1 ring-edamame-500/40' : ''}`}
          >
            <div className="w-8 h-8 rounded-full border border-dashed border-ink/20 dark:border-plate-ink/25 flex-shrink-0" aria-hidden="true" />
            <span className="text-ink-soft dark:text-plate-ink-soft italic">Unassigned</span>
          </li>
        )}

        {filtered.length === 0 && (
          <li className="px-2.5 py-3 text-[13px] text-ink-faint dark:text-plate-ink-faint italic">No one matches "{query}".</li>
        )}

        {filtered.map(e => {
          const idx = optionIds.indexOf(e.id);
          const selected = value === e.id;
          return (
            <li
              key={e.id}
              id={`person-picker-option-${e.id}`}
              role="option"
              aria-selected={selected}
              ref={el => { optionRefs.current[e.id] = el; }}
              onClick={() => selectId(e.id)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-[13px] transition-colors ${
                idx === activeIndex ? 'bg-edamame-50 dark:bg-edamame-900/20' : 'hover:bg-paper-2 dark:hover:bg-plate-card'
              } ${selected ? 'ring-1 ring-edamame-500/40' : ''}`}
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[10.5px] font-bold">
                  {e.avatar || initialsOf(e.name)}
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-paper-2 dark:border-plate-card"
                  style={{ backgroundColor: AVAILABILITY_DOT[e.status] }}
                  role="img"
                  aria-label={AVAILABILITY_LABEL[e.status] ?? e.status}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-ink dark:text-plate-ink truncate">{e.name || e.email}</span>
                  {e.isYou && (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-edamame-50 dark:bg-edamame-900/30 text-edamame-700 dark:text-edamame-400">You</span>
                  )}
                  {e.isCurrent && !e.isYou && (
                    <span className="text-[9.5px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-ink/10 dark:bg-plate-ink/15 text-ink-soft dark:text-plate-ink-soft">Current</span>
                  )}
                </div>
                <div className="text-[11px] text-ink-soft dark:text-plate-ink-soft truncate">
                  {e.jobTitle && <span>{e.jobTitle} · </span>}
                  {workloadLabel(e)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
