import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { WorkspaceMenu, WorkspaceMenuItem, WorkspaceQuickAction } from './WorkspaceControls';

interface WorkspaceDockProps {
  /** Suggested next steps for the current task (`lib/caseOverview.ts`'s `suggestQuickActions()`). */
  quickActions: WorkspaceQuickAction[];
  /** Title of the task the suggestions are for, shown in the caption. */
  currentTaskTitle?: string;
  viewItems: WorkspaceMenuItem[];
  toolItems: WorkspaceMenuItem[];
}

/**
 * The floating, centred "Workspace" bar pinned to the bottom of Case Details
 * (design option D, using option B's bar). Holds suggested quick actions for
 * the current task plus searchable View and Tools menus, and is shown on
 * every case tab.
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
          <WorkspaceMenu
            label="View"
            items={viewItems}
            buttonCls="text-white hover:brightness-110 bg-gradient-to-br from-blue-500 to-blue-600"
            placement="up"
            align="right"
            open={openMenu === 'view'}
            onToggle={() => setOpenMenu(m => (m === 'view' ? null : 'view'))}
            onClose={() => setOpenMenu(null)}
          />
          <WorkspaceMenu
            label="Tools"
            items={toolItems}
            buttonCls="text-white hover:brightness-110 bg-gradient-to-br from-violet-400 to-violet-600"
            placement="up"
            align="right"
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
