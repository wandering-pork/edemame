import React from 'react';
import { useEdie } from '../../contexts/EdieContext';
import { BrandImage } from '../BrandImage';
import { shortcutLabel } from '../../lib/shortcutLabel';

interface EdieButtonProps {
  /**
   * `topbar`: the app's top bar, on pages without their own Edie content.
   * Hidden while a page has claimed Edie, so there is only ever one button.
   * `page`: inside a page's own header (Case Details), next to its actions,
   * where the user is already looking. Only this placement shows the
   * one-time tip.
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
  const { open, setOpen, suggestionCount, pageClaimed, hintSeen, markHintSeen } = useEdie();
  if (placement === 'topbar' && pageClaimed) return null;

  const shortcut = shortcutLabel('j');
  const showCount = !open && suggestionCount > 0;
  const showTip = placement === 'page' && !open && !hintSeen && suggestionCount > 0;
  const suggestionsText = `${suggestionCount} ${suggestionCount === 1 ? 'suggestion' : 'suggestions'}`;
  const label = showCount ? `Ask Edie, ${suggestionsText}` : open ? 'Close Edie' : 'Ask Edie';

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-pressed={open}
        aria-label={label}
        aria-describedby={showTip ? 'edie-tip' : undefined}
        title={`Edie, AI assistant (${shortcut})`}
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

      {/* One-time tip pointing at the button, until the user opens Edie or dismisses it. */}
      {showTip && (
        <div
          id="edie-tip"
          role="note"
          onKeyDown={e => { if (e.key === 'Escape') markHintSeen(); }}
          className="edie-tip-in absolute right-0 top-full mt-3 z-30 w-[280px] rounded-xl border border-edamame/40 bg-paper-2 dark:bg-plate-card shadow-xl shadow-edamame/10 p-3.5 text-left"
        >
          {/* Arrow pointing up at the button */}
          <span aria-hidden="true" className="absolute -top-[7px] right-8 w-3 h-3 rotate-45 bg-paper-2 dark:bg-plate-card border-l border-t border-edamame/40" />
          <p className="text-[13px] font-bold text-ink dark:text-plate-ink">Edie has {suggestionsText} for this case</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft dark:text-plate-ink-soft">
            Edie can draft client emails, summarise the case and answer questions about it. Open Edie any time with{' '}
            <kbd className="px-1 py-px rounded border border-ink/15 dark:border-plate-ink/20 bg-paper dark:bg-plate font-sans text-[11px] font-semibold text-ink dark:text-plate-ink">{shortcut}</kbd>.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={markHintSeen}
              className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-ink-soft dark:text-plate-ink-soft hover:text-ink dark:hover:text-plate-ink transition-colors"
            >
              Got it
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn-press px-3 py-1.5 rounded-lg bg-edamame hover:bg-edamame-600 text-white text-[12px] font-bold transition-colors"
            >
              Show suggestions
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EdieButton;
