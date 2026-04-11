import React from 'react';

type PriorityType = 'urgent' | 'pending' | 'normal' | 'done';

interface TaskPriorityProps {
  priority: PriorityType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const priorityConfig: Record<PriorityType, { color: string; icon: string; label: string }> = {
  urgent: {
    color: 'text-red-500',
    icon: '●',
    label: 'Urgent'
  },
  pending: {
    color: 'text-amber-500',
    icon: '●',
    label: 'Pending'
  },
  normal: {
    color: 'text-slate-400 dark:text-slate-600',
    icon: '●',
    label: 'Normal'
  },
  done: {
    color: 'text-green-500',
    icon: '✓',
    label: 'Done'
  }
};

export const TaskPriority: React.FC<TaskPriorityProps> = ({
  priority,
  size = 'md',
  className = ''
}) => {
  const config = priorityConfig[priority];
  const sizeClass = {
    sm: 'text-xs',
    md: 'text-base',
    lg: 'text-lg'
  }[size];

  return (
    <span
      className={`inline-flex items-center ${sizeClass} ${config.color} font-bold ${className}`}
      title={config.label}
    >
      {config.icon}
    </span>
  );
};

export const getPriorityType = (daysUntil: number, isCompleted: boolean): PriorityType => {
  if (isCompleted) return 'done';
  if (daysUntil < 0) return 'urgent';
  if (daysUntil === 0) return 'urgent';
  if (daysUntil <= 3) return 'pending';
  return 'normal';
};
