import React from 'react';
import { useEdie } from '../../contexts/EdieContext';
import { BrandImage } from '../BrandImage';

/**
 * Edie's button in the app's top bar, on every page. Shows a count badge
 * when Edie is closed and the current page has suggestions.
 */
export const EdieButton: React.FC = () => {
  const { open, setOpen, suggestionCount } = useEdie();
  const label = suggestionCount > 0 && !open ? `Edie, ${suggestionCount} suggestions` : 'Edie';
  return (
    <button
      onClick={() => setOpen(o => !o)}
      aria-pressed={open}
      aria-label={label}
      title="Edie, AI assistant (Ctrl+J)"
      className={`relative inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full border text-[12.5px] font-bold transition-colors ${
        open
          ? 'border-edamame bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-400'
          : 'border-ink/15 dark:border-plate-ink/20 text-ink-soft dark:text-plate-ink-soft hover:border-edamame hover:text-edamame'
      }`}
    >
      <BrandImage variant="mark" alt="" className="w-6 h-6 object-contain" />
      Edie
      {!open && suggestionCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-edamame text-white text-[9.5px] font-bold flex items-center justify-center">
          {suggestionCount}
        </span>
      )}
    </button>
  );
};

export default EdieButton;
