import React, { useEffect, useRef, useState } from 'react';
import { Pin, PinOff, Sparkles, X } from 'lucide-react';
import { WorkspaceMenu, WorkspaceMenuItem, WorkspaceQuickAction, WorkspaceSuggestionCards } from './WorkspaceControls';

const PINNED_KEY = 'edamame.caseWorkspacePinned';

function loadPinned(): boolean {
  try {
    return sessionStorage.getItem(PINNED_KEY) === '1';
  } catch {
    return false;
  }
}

function savePinned(pinned: boolean) {
  try {
    sessionStorage.setItem(PINNED_KEY, pinned ? '1' : '0');
  } catch {
    // sessionStorage unavailable (private mode etc.) — the pin just won't persist.
  }
}

interface WorkspaceDrawerProps {
  /** Suggested next steps for the current task (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
  quickActions: WorkspaceQuickAction[];
  /** Title of the task the suggestions are for. */
  currentTaskTitle?: string;
  viewItems: WorkspaceMenuItem[];
  toolItems: WorkspaceMenuItem[];
  /** Told whenever the drawer is open *and* pinned, so the page can make room for it. */
  onDockedChange?: (docked: boolean) => void;
}

const menuButtonCls =
  'border border-ink/15 dark:border-plate-ink/20 bg-paper-2 dark:bg-plate-card text-ink dark:text-plate-ink hover:border-edamame hover:text-edamame-700 dark:hover:text-edamame-400';

/**
 * Case Details' on-demand Workspace (design option C — "Tabbed + Workspace
 * drawer"): a floating **Workspace** button bottom-right on every case tab
 * opens a right-hand drawer with searchable View/Tools menus and suggested
 * next steps for the current task. Unpinned, the drawer closes after you pick
 * something (or on Esc / Close); **Pin** keeps it open, for the rest of the
 * browser session.
 */
export const WorkspaceDrawer: React.FC<WorkspaceDrawerProps> = ({ quickActions, currentTaskTitle, viewItems, toolItems, onDockedChange }) => {
  const [pinned, setPinned] = useState(loadPinned);
  const [open, setOpen] = useState(pinned);
  const [openMenu, setOpenMenu] = useState<'view' | 'tools' | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    onDockedChange?.(open && pinned);
  }, [open, pinned, onDockedChange]);

  // Close any open menu on an outside click.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

  // Esc closes an unpinned drawer (menus handle their own Esc first).
  useEffect(() => {
    if (!open || pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !openMenu) {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pinned, openMenu]);

  const close = () => {
    setOpen(false);
    setOpenMenu(null);
    if (pinned) {
      setPinned(false);
      savePinned(false);
    }
  };

  const togglePinned = () => {
    setPinned(p => {
      savePinned(!p);
      return !p;
    });
  };

  // After picking something, an unpinned drawer gets out of the way.
  const afterSelect = <T extends { onSelect: () => void }>(item: T): T => ({
    ...item,
    onSelect: () => {
      if (!pinned) setOpen(false);
      item.onSelect();
    },
  });

  return (
    <>
      {!open && (
        <button
          ref={fabRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls="case-workspace-drawer"
          className="btn-press fixed right-6 bottom-6 z-40 inline-flex items-center gap-1.5 px-[18px] py-3 rounded-full bg-edamame hover:bg-edamame-600 text-white text-[13px] font-bold shadow-[0_6px_18px_rgba(20,102,58,0.35)] transition-colors"
        >
          <Sparkles size={14} /> Workspace
        </button>
      )}

      {open && (
        <aside
          ref={drawerRef}
          id="case-workspace-drawer"
          aria-label="Workspace"
          className="fixed right-0 top-0 bottom-0 z-40 w-[340px] max-w-full overflow-y-auto custom-scrollbar bg-paper-2 dark:bg-plate-card border-l border-ink/15 dark:border-plate-ink/20 shadow-[-8px_0_24px_rgba(0,0,0,0.08)] p-[18px]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-edamame" />
            <h2 className="text-[15px] font-bold text-ink dark:text-plate-ink">Workspace</h2>
            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={pinned}
              title={pinned ? 'Unpin — close after picking something' : 'Pin — keep the Workspace open'}
              className={`ml-auto p-1.5 rounded-lg transition-colors ${
                pinned
                  ? 'text-edamame-700 dark:text-edamame-400 bg-edamame/10'
                  : 'text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-ink/5'
              }`}
            >
              {pinned ? <PinOff size={14} /> : <Pin size={14} />}
              <span className="sr-only">{pinned ? 'Unpin Workspace' : 'Pin Workspace'}</span>
            </button>
            <button
              type="button"
              onClick={close}
              className="p-1.5 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-ink/5 transition-colors"
            >
              <X size={15} />
              <span className="sr-only">Close Workspace</span>
            </button>
          </div>
          <p className="text-[11px] text-ink-faint dark:text-plate-ink-faint mb-3.5">
            {pinned ? 'Pinned — stays open as you work.' : 'Pin it to keep it open.'}
          </p>

          <div className="flex gap-2 mb-4">
            <WorkspaceMenu
              label="View"
              items={viewItems.map(afterSelect)}
              buttonCls={menuButtonCls}
              open={openMenu === 'view'}
              onToggle={() => setOpenMenu(m => (m === 'view' ? null : 'view'))}
              onClose={() => setOpenMenu(null)}
            />
            <WorkspaceMenu
              label="Tools"
              items={toolItems.map(afterSelect)}
              buttonCls={menuButtonCls}
              open={openMenu === 'tools'}
              onToggle={() => setOpenMenu(m => (m === 'tools' ? null : 'tools'))}
              onClose={() => setOpenMenu(null)}
            />
          </div>

          {quickActions.length > 0 && (
            <>
              <div className="text-[11.5px] text-ink-faint dark:text-plate-ink-faint mb-2">
                {currentTaskTitle ? <>Suggested for <b className="text-ink dark:text-plate-ink">{currentTaskTitle}</b></> : 'Suggested next steps'}
              </div>
              <WorkspaceSuggestionCards actions={quickActions.map(afterSelect)} />
              <p className="mt-2.5 text-[10.5px] text-ink-faint dark:text-plate-ink-faint">Suggestions change as you move through tasks.</p>
            </>
          )}
        </aside>
      )}
    </>
  );
};

export default WorkspaceDrawer;
