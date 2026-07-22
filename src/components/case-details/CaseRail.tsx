import React from 'react';
import { FolderOpen, FileText } from 'lucide-react';
import type { Client, FileTreeNode } from '../../types';

export interface RailAlert {
  color: 'red' | 'amber' | 'blue';
  text: string;
}

const alertColor: Record<RailAlert['color'], string> = {
  red: 'text-red-600 dark:text-red-400',
  amber: 'text-amber-600 dark:text-amber-400',
  blue: 'text-blue-600 dark:text-blue-400',
};

const FileTree: React.FC<{ nodes: FileTreeNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
  <div className={depth > 0 ? 'pl-3 border-l border-gray-200 dark:border-slate-800 ml-1.5' : ''}>
    {nodes.map((node, i) => (
      <div key={i}>
        <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-gray-500 dark:text-slate-400">
          {node.kind === 'directory'
            ? <FolderOpen size={11} className="text-amber-500 flex-shrink-0" />
            : <FileText size={11} className="text-gray-400 dark:text-slate-600 flex-shrink-0" />}
          <span className="truncate">{node.name}</span>
          {node.size != null && (
            <span className="ml-auto text-gray-400 dark:text-slate-600 text-[10px] flex-shrink-0">{Math.round(node.size / 1024)}KB</span>
          )}
        </div>
        {node.children && node.children.length > 0 && <FileTree nodes={node.children} depth={depth + 1} />}
      </div>
    ))}
  </div>
);

interface CaseRailProps {
  client: Client;
  applicant?: Client;
  progress: number;
  completedCount: number;
  pendingCount: number;
  alerts: RailAlert[];
  dirTree: FileTreeNode[] | null;
}

const RailLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[9.5px] font-bold uppercase tracking-[0.11em] text-gray-400 dark:text-slate-500">{children}</div>
);

export const CaseRail: React.FC<CaseRailProps> = ({
  client,
  applicant,
  progress,
  completedCount,
  pendingCount,
  alerts,
  dirTree,
}) => {
  return (
    <aside className="ed-rail xl:sticky xl:top-4 self-start bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm p-[18px]">
      <RailLabel>Case Info</RailLabel>

      {/* Client */}
      <div className="flex items-center gap-3 mt-3.5">
        <div className="w-9 h-9 rounded-full bg-edamame/10 dark:bg-edamame/15 text-edamame flex items-center justify-center text-xs font-bold flex-shrink-0">
          {client.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900 dark:text-white tracking-tight truncate">{client.name}</div>
          <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">DOB {client.dob}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1 mt-2.5 text-[11.5px] text-gray-500 dark:text-slate-400">
        <span className="truncate">{client.email}</span>
        <span>{client.phone}</span>
      </div>

      {applicant && applicant.id !== client.id && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
          <RailLabel>Applicant</RailLabel>
          <div className="flex items-center gap-2.5 mt-2.5">
            <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {applicant.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-800 dark:text-slate-200 truncate">{applicant.name}</div>
              <div className="text-[10px] text-gray-400 dark:text-slate-500">DOB {applicant.dob}</div>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="mt-4 pt-3.5 border-t border-gray-100 dark:border-slate-800">
        <div className="flex items-baseline justify-between">
          <RailLabel>Progress</RailLabel>
          <span className="text-[13px] font-extrabold text-gray-900 dark:text-white">{progress}%</span>
        </div>
        <div className="h-[5px] rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden mt-2">
          <div className="progress-fill h-full bg-edamame rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-[10.5px] text-gray-400 dark:text-slate-500 mt-1.5">
          <span>{completedCount} done</span>
          <span>{pendingCount} pending</span>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
          <RailLabel>Alerts</RailLabel>
          <div className="mt-2 space-y-0.5">
            {alerts.map((al, i) => (
              <div key={i} className={`flex items-center gap-2 text-[11.5px] font-semibold py-1 ${alertColor[al.color]}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                {al.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked workspace folder (shown only when a folder is linked) */}
      {dirTree && dirTree.length > 0 && (
        <div className="mt-3.5 pt-3.5 border-t border-gray-100 dark:border-slate-800">
          <RailLabel>Workspace</RailLabel>
          <div className="mt-2 max-h-52 overflow-y-auto custom-scrollbar">
            <FileTree nodes={dirTree} />
          </div>
        </div>
      )}
    </aside>
  );
};

export default CaseRail;
