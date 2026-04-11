import React from 'react';

type StatusType = 'active' | 'pending' | 'at-risk' | 'completed';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

const statusConfig: Record<StatusType, { bg: string; text: string; border: string; label: string }> = {
  active: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-l-4 border-green-500',
    label: 'Active'
  },
  pending: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-l-4 border-amber-500',
    label: 'Pending'
  },
  'at-risk': {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-l-4 border-red-500',
    label: 'At Risk'
  },
  completed: {
    bg: 'bg-slate-50 dark:bg-slate-900/20',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-l-4 border-slate-400',
    label: 'Completed'
  }
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = ''
}) => {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <div
      className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${config.bg} ${config.text} ${className}`}
    >
      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
        status === 'active' ? 'bg-green-500 animate-pulse' :
        status === 'pending' ? 'bg-amber-500 animate-pulse' :
        status === 'at-risk' ? 'bg-red-500 animate-pulse' :
        'bg-slate-400'
      }`} />
      {displayLabel}
    </div>
  );
};

export const StatusCardBorder: React.FC<{ status: StatusType }> = ({ status }) => {
  const config = statusConfig[status];
  return <div className={`absolute top-0 left-0 bottom-0 ${config.border}`} />;
};
