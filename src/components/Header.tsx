import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';
import type { Notification, Theme, Client, Case, Task, WorkflowTemplate, TeamMember } from '../types';

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  userName: string;
  userEmail: string;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
  // Global search corpus + task mutations, threaded from App state.
  clients: Client[];
  cases: Case[];
  tasks: Task[];
  templates: WorkflowTemplate[];
  teamMembers?: TeamMember[];
  currentUserId?: string;
  onUpdateTask?: (task: Task) => void;
  onDeleteTask?: (id: string) => void;
  onMoveTaskDate?: (
    taskId: string,
    newDate: string,
    offsetFuture: boolean,
    taskPatch?: { title?: string; description?: string; dateLocked?: boolean },
  ) => void;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || '?';

export const Header: React.FC<HeaderProps> = ({
  theme,
  onThemeChange,
  userName,
  userEmail,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  clients,
  cases,
  tasks,
  templates,
  teamMembers,
  currentUserId,
  onUpdateTask,
  onDeleteTask,
  onMoveTaskDate,
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 bg-paper/85 dark:bg-plate/85 backdrop-blur-sm border-b border-ink/10 dark:border-plate-ink/15">
      {/* Global search — available from every module. */}
      <GlobalSearch
        clients={clients}
        cases={cases}
        tasks={tasks}
        templates={templates}
        teamMembers={teamMembers}
        currentUserId={currentUserId}
        onUpdateTask={onUpdateTask}
        onDeleteTask={onDeleteTask}
        onMoveTaskDate={onMoveTaskDate}
      />

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={() => onThemeChange(theme === 'dark' ? 'classic' : 'dark')}
        className="p-2 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:bg-ink/8 dark:hover:bg-plate-ink/10 hover:text-ink dark:hover:text-plate-ink transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Notifications */}
      <NotificationBell
        notifications={notifications}
        onMarkAsRead={onMarkAsRead}
        onMarkAllAsRead={onMarkAllAsRead}
        onDelete={onDeleteNotification}
      />

      {/* User chip */}
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-ink/8 dark:hover:bg-plate-ink/10 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-edamame-100 dark:bg-edamame-900/30 text-edamame-700 dark:text-edamame-300 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials(userName || userEmail)}
        </span>
        <span className="hidden sm:block text-[13px] font-semibold text-ink dark:text-plate-ink-soft leading-none max-w-[140px] truncate">
          {userName || userEmail}
        </span>
      </button>
    </header>
  );
};
