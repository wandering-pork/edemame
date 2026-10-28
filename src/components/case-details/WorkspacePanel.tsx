import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { WorkspaceMenu, WorkspaceMenuItem, WorkspaceQuickAction, WorkspaceSuggestionCards } from './WorkspaceControls';

const HIDDEN_KEY = 'edamame.caseWorkspaceHidden';

function loadHidden(): boolean {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function saveHidden(hidden: boolean) {
  try {
    sessionStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // sessionStorage unavailable (private mode etc.) — the choice just won't persist.
  }
}

interface WorkspacePanelProps {
  /** Suggested next steps for the current task (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
  quickActions: WorkspaceQuickAction[];
  /** Title of the task the suggestions are for. */
  currentTaskTitle?: string;
  viewItems: WorkspaceMenuItem[];
  toolItems: WorkspaceMenuItem[];
}

const menuButtonCls =
  'border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink hover:border-edamame hover:text-edamame-700 dark:hover:text-edamame-400';

/**
 * The Workspace side card on the Overview's right-hand column (design option
 * A — "Overview + side Workspace"): searchable View and Tools menus plus
 * suggested next steps for the current task, shown as cards. **Hide**
 * collapses it to a slim button for the rest of the browser session.
 */
export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ quickActions, currentTaskTitle, viewItems, toolItems }) => {
  const [hidden, setHidden] = useState(loadHidden);
  const [openMenu, setOpenMenu] = useState<'view' | 'tools' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  const toggleHidden = (next: boolean) => {
    setHidden(next);
    saveHidden(next);
    setOpenMenu(null);
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => toggleHidden(false)}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-edamame/30 bg-edamame/5 text-[12px] font-bold text-edamame-700 dark:text-edamame-400 hover:bg-edamame/10 transition-colors"
      >
        <Sparkles size={13} /> Show Workspace
      </button>
    );
  }

  return (
    <section
      ref={panelRef}
      aria-label="Workspace"
      className="rounded-xl border border-edamame/30 bg-gradient-to-b from-edamame/[0.07] to-paper-2 dark:from-edamame/10 dark:to-plate-card shadow-sm p-[18px]"
    >
      <div className="flex items-center gap-2 mb-3.5">
        <Sparkles size={13} className="text-edamame" />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-soft dark:text-plate-ink-soft">Workspace</span>
        <button
          type="button"
          onClick={() => toggleHidden(true)}
          className="ml-auto text-[11.5px] font-semibold text-edamame-700 dark:text-edamame-400 hover:underline"
        >
          Hide
        </button>
      </div>

      <div className="flex gap-2 mb-3.5">
        <WorkspaceMenu
          label="View"
          items={viewItems}
          buttonCls={menuButtonCls}
          open={openMenu === 'view'}
          onToggle={() => setOpenMenu(m => (m === 'view' ? null : 'view'))}
          onClose={() => setOpenMenu(null)}
        />
        <WorkspaceMenu
          label="Tools"
          items={toolItems}
          buttonCls={menuButtonCls}
          open={openMenu === 'tools'}
          onToggle={() => setOpenMenu(m => (m === 'tools' ? null : 'tools'))}
          onClose={() => setOpenMenu(null)}
          align="right"
        />
      </div>

      {quickActions.length > 0 && (
        <>
          <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mb-2">
            {currentTaskTitle ? <>Suggested for <b className="text-ink dark:text-plate-ink">{currentTaskTitle}</b></> : 'Suggested next steps'}
          </div>
          <WorkspaceSuggestionCards actions={quickActions} />
          <p className="mt-2.5 text-[10.5px] text-ink-faint dark:text-plate-ink-faint">Suggestions change as you move through tasks.</p>
        </>
      )}
    </section>
  );
};

export default WorkspacePanel;
