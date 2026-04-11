import React from 'react';
import { Case, Task, Client, TeamMember } from '../types';
import { ProgressRing } from './ProgressRing';
import { StatusBadge, StatusCardBorder } from './StatusBadge';
import { ChevronRight, Calendar, AlertCircle, UserPlus } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface CaseCardProps {
  case: Case;
  client: Client;
  tasks: Task[];
  onViewDetails: (caseId: string) => void;
  owner?: TeamMember;
  onAssignClick?: (caseId: string) => void;
  className?: string;
}

export const CaseCard: React.FC<CaseCardProps> = ({
  case: caseData,
  client,
  tasks,
  onViewDetails,
  owner,
  onAssignClick,
  className = ''
}) => {
  const completedTasks = tasks.filter(t => t.isCompleted).length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Determine status
  let status: 'active' | 'pending' | 'at-risk' | 'completed' = 'active';
  if (progress === 100) status = 'completed';
  else if (progress === 0) status = 'pending';
  else {
    // Check for overdue tasks
    const hasOverdue = tasks.some(t => !t.isCompleted && new Date(t.date) < new Date());
    if (hasOverdue) status = 'at-risk';
  }

  // Find next task
  const nextTask = tasks
    .filter(t => !t.isCompleted && new Date(t.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

  const caseStartDate = tasks.length > 0
    ? format(new Date(tasks[0].date), 'MMM d')
    : 'N/A';

  const daysInProgress = Math.floor(
    (new Date().getTime() - new Date(caseData.createdAt || new Date()).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div
      className={`relative group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 hover:shadow-lg hover:scale-[1.01] card-lift cursor-pointer ${className}`}
      onClick={() => onViewDetails(caseData.id)}
    >
      <StatusCardBorder status={status} />

      <div className="p-6 pl-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex-1 pr-4">
            <h3 className="text-lg font-ibm-serif font-bold text-slate-900 dark:text-white mb-1">
              {caseData.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {client.name} • DOB {client.dob || 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {owner ? (
              <div
                className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600"
                title={`Owned by ${owner.name}`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-edamame-400 to-edamame-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {owner.avatar || owner.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[80px] truncate">
                  {owner.name.split(' ')[0]}
                </span>
              </div>
            ) : (
              onAssignClick && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAssignClick(caseData.id); }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-edamame-500 hover:text-edamame-500 transition-colors"
                >
                  <UserPlus size={11} /> Assign
                </button>
              )
            )}
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-edamame-500 transition-colors" />
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-3 gap-6 items-center">
          {/* Progress Ring */}
          <div className="flex justify-center">
            <div className="relative w-24 h-24">
              <ProgressRing percentage={progress} size={96} strokeWidth={3} />
            </div>
          </div>

          {/* Case info */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Progress
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {completedTasks}/{totalTasks} tasks done
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                Duration
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {daysInProgress} days in progress
              </p>
            </div>
          </div>

          {/* Status and next task */}
          <div className="space-y-3">
            <StatusBadge status={status} />
            {nextTask && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <Calendar className="w-4 h-4 text-edamame-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-slate-900 dark:text-white line-clamp-1">
                    {nextTask.title}
                  </p>
                  <p className="text-slate-600 dark:text-slate-400">
                    Due: {format(new Date(nextTask.date), 'MMM d')}
                  </p>
                </div>
              </div>
            )}
            {status === 'at-risk' && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-semibold">
                <AlertCircle className="w-4 h-4" />
                Overdue tasks
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
