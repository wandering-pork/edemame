import React from 'react';
import { useEdie } from '../../contexts/EdieContext';
import { BrandImage } from '../BrandImage';

interface EdieButtonProps {
  /**
   * `topbar`: the app's top bar, on pages without their own Edie content.
   * Hidden while a page has claimed Edie, so there is only ever one button.
   * `page`: inside a page's own header (Case Details), next to its actions,
   * where the user is already looking.
   */
  placement: 'topbar' | 'page';
}

/**
 * The one button that opens Edie on a page. A soft green pill with the pod
 * mark, so it reads as the AI entry point without competing with a page's
 * solid green primary action. While Edie is closed and the page has
 * suggestions, their count sits inside the pill (animating in once).
 */
export const EdieButton: React.FC<EdieButtonProps> = ({ placement }) => {
  const { open, setOpen, suggestionCount, pageClaimed } = useEdie();
  if (placement === 'topbar' && pageClaimed) return null;

  const showCount = !open && suggestionCount > 0;
  const label = showCount
    ? `Ask Edie, ${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'}`
    : open ? 'Close Edie' : 'Ask Edie';

  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      aria-pressed={open}
      aria-label={label}
      title="Edie, AI assistant (Ctrl+J)"
      className={`btn-press inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-[12.5px] font-bold whitespace-nowrap transition-colors ${
        open
          ? 'border-edamame bg-edamame text-white'
          : 'border-edamame/40 bg-edamame/10 dark:bg-edamame/15 text-edamame-700 dark:text-edamame-300 hover:bg-edamame/15 dark:hover:bg-edamame/25 hover:border-edamame'
      }`}
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${open ? 'bg-white/90' : 'bg-paper-2 dark:bg-plate-card'}`}>
        <BrandImage variant="mark" alt="" className="w-5 h-5 object-contain" />
      </span>
      Ask Edie
      {showCount && (
        <span
          key={suggestionCount}
          aria-hidden="true"
          className="edie-count-in min-w-[18px] h-[18px] px-1 rounded-full bg-edamame text-white text-[10.5px] font-bold flex items-center justify-center"
        >
          {suggestionCount}
        </span>
      )}
    </button>
  );
};

export default EdieButton;
