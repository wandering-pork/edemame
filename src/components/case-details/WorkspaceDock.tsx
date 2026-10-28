import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { WorkspaceMenu, WorkspaceMenuItem, WorkspaceQuickAction } from './WorkspaceControls';

const COLLAPSED_KEY = 'edamame.caseWorkspaceCollapsed';

function loadCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    sessionStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    // sessionStorage unavailable (private mode etc.) — the choice just won't persist.
  }
}

interface WorkspaceDockProps {
  /** Suggested next steps for the current task (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
  quickActions: WorkspaceQuickAction[];
  /** Title of the task the suggestions are for, shown in the caption. */
  currentTaskTitle?: string;
  viewItems: WorkspaceMenuItem[];
  toolItems: WorkspaceMenuItem[];
}

/**
 * The floating, centred "Workspace" bar pinned to the bottom of Case Details,
 * on every case tab (design option D). Holds suggested quick actions for the
 * current task plus searchable View and Tools menus. The collapse button
 * shrinks it to a small "Workspace" pill for the rest of the browser session,
 * so it never has to sit over content you're reading.
 */
export const WorkspaceDock: React.FC<WorkspaceDockProps> = ({ quickActions, currentTaskTitle, viewItems, toolItems }) => {
  const [collapsed, setCollapsed] = useState(loadCollapsed);
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

  const setCollapsedAndSave = (next: boolean) => {
    setCollapsed(next);
    saveCollapsed(next);
    setOpenMenu(null);
  };

  const surfaceCls =
    'pointer-events-auto border border-white/10 bg-[#11202f] shadow-[0_18px_40px_rgba(12,32,24,0.28),0_2px_6px_rgba(12,32,24,0.2)]';

  if (collapsed) {
    return (
      <div className="sticky bottom-4 z-30 mt-6 flex justify-center pointer-events-none">
        <button
          type="button"
          onClick={() => setCollapsedAndSave(false)}
          aria-expanded={false}
          className={`${surfaceCls} btn-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-[#7ee2a8] hover:text-white transition-colors`}
        >
          <Sparkles size={13} />
          Workspace
          {quickActions.length > 0 && (
            <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-edamame text-white text-[10px] tracking-normal flex items-center justify-center">
              {quickActions.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-4 z-30 mt-6 flex justify-center pointer-events-none">
      <div
        ref={dockRef}
        role="toolbar"
        aria-label="Workspace"
        className={`${surfaceCls} max-w-full flex flex-wrap justify-center items-center gap-3.5 px-4 py-2.5 rounded-[18px]`}
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
                  title={action.detail}
                  className="btn-press px-3 py-1.5 rounded-[10px] text-[12px] font-semibold text-[#e8eef6] bg-white/[0.07] border border-white/10 hover:bg-white/[0.14] hover:border-white/30 whitespace-nowrap transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pl-3.5 border-l border-white/15">
          <WorkspaceMenu
            label="View"
            items={viewItems}
            buttonCls="text-white bg-edamame hover:bg-edamame-600"
            placement="up"
            align="right"
            open={openMenu === 'view'}
            onToggle={() => setOpenMenu(m => (m === 'view' ? null : 'view'))}
            onClose={() => setOpenMenu(null)}
          />
          <WorkspaceMenu
            label="Tools"
            items={toolItems}
            buttonCls="text-[#e8eef6] bg-white/[0.07] border border-white/15 hover:bg-white/[0.14] hover:border-white/30"
            placement="up"
            align="right"
            open={openMenu === 'tools'}
            onToggle={() => setOpenMenu(m => (m === 'tools' ? null : 'tools'))}
            onClose={() => setOpenMenu(null)}
          />
          <button
            type="button"
            onClick={() => setCollapsedAndSave(true)}
            title="Collapse Workspace"
            className="p-1.5 rounded-lg text-[#9db0c5] hover:text-white hover:bg-white/10 transition-colors"
          >
            <ChevronDown size={15} />
            <span className="sr-only">Collapse Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDock;
