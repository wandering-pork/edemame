import React from 'react';
import { useEdie } from '../../contexts/EdieContext';
import { EdieGeneral } from './EdieGeneral';

/** Panel width; the app shell pads its content column by the same amount on wide screens. */
export const EDIE_PUSH_PADDING_CLASS = 'xl:pr-[380px]';

/**
 * The Edie panel's frame, rendered once by the app shell so Edie is on every
 * page. A full-height panel on the right: on wide screens the app shell pads
 * its content by the panel's width (so the page, top bar included, moves
 * aside); on narrow screens it slides over the page.
 *
 * A page with its own Edie content (Case Details) claims the panel and
 * portals into it; otherwise the general assistant is shown.
 */
export const EdieShell: React.FC = () => {
  const { open, setPanelEl, pageClaimed } = useEdie();
  if (!open) return null;
  return (
    <aside
      ref={setPanelEl}
      role="complementary"
      aria-label="Edie, AI assistant"
      className="ed-edie fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] flex flex-col bg-paper-2 dark:bg-plate-card border-l border-ink/10 dark:border-plate-ink/15 shadow-2xl xl:shadow-none"
    >
      {!pageClaimed && <EdieGeneral />}
    </aside>
  );
};

export default EdieShell;
