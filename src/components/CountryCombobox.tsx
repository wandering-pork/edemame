import React, { useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { findCountry, searchCountries } from '../lib/countries';

interface CountryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Classes for the text input, so it matches the form it sits in. */
  inputClassName: string;
  id?: string;
  placeholder?: string;
}

const MAX_SHOWN = 60;

/**
 * Type-to-search country picker (ARIA combobox with a listbox). Typing
 * filters the list (names, passport codes like "IND", and demonyms like
 * "Indian"); arrow keys move, Enter picks, Escape closes. Picking stores the
 * country's name. Free text is still allowed for anything not on the list,
 * and on leaving the field an exact match ("india", "IND") is tidied to the
 * country's name.
 */
export const CountryCombobox: React.FC<CountryComboboxProps> = ({ value, onChange, inputClassName, id, placeholder = 'Start typing a country' }) => {
  const autoId = useId();
  const inputId = id ?? `country-${autoId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    // Opening on an already-picked country shows the whole list, not just itself.
    const q = findCountry(value)?.name === value ? '' : value;
    return searchCountries(q).slice(0, MAX_SHOWN);
  }, [value]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const moveTo = (i: number) => {
    setActive(i);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      moveTo(Math.min(active + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveTo(Math.max(active - 1, 0));
    } else if (e.key === 'Enter' && open && matches[active]) {
      e.preventDefault();
      pick(matches[active].name);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const selected = findCountry(value)?.name;

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          const match = findCountry(value);
          if (match && match.name !== value) onChange(match.name);
        }}
        onKeyDown={onKeyDown}
        className={`${inputClassName} pr-9`}
      />
      <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint dark:text-plate-ink-faint" />
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card shadow-lg py-1"
        >
          {matches.length === 0 ? (
            <li className="px-3.5 py-2 text-[12.5px] text-ink-faint dark:text-plate-ink-faint">
              No country matches. You can keep what you typed.
            </li>
          ) : matches.map((c, i) => (
            <li
              key={c.code}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={c.name === selected}
              // mousedown, not click, so the pick lands before the input's blur closes the list
              onMouseDown={e => { e.preventDefault(); pick(c.name); }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-[13px] cursor-pointer ${
                i === active ? 'bg-edamame-50 dark:bg-edamame-900/30 text-ink dark:text-plate-ink' : 'text-ink dark:text-plate-ink'
              }`}
            >
              <span className="flex-1 truncate">{c.name}</span>
              {c.name === selected && <Check size={14} aria-hidden className="text-edamame-700 dark:text-edamame-400" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CountryCombobox;
