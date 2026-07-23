import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Sun, Moon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import type { Notification, Theme } from '../types';

interface HeaderProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  userName: string;
  userEmail: string;
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (id: string) => void;
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
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm border-b border-gray-100 dark:border-slate-800">
      {/* Global search */}
      <div className="relative flex-1 max-w-[420px]">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
        <input
          type="search"
          placeholder="Search cases, clients, tasks…"
          className="w-full pl-9 pr-3 py-2 text-[13px] rounded-lg bg-gray-100 dark:bg-slate-800 border border-transparent
                     text-gray-700 dark:text-slate-200 placeholder:text-gray-400 dark:placeholder:text-slate-500
                     focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-edamame-300 dark:focus:border-edamame-700
                     focus:ring-[3px] focus:ring-edamame-500/[.18] transition-colors"
        />
      </div>

      <div className="flex-1" />

      {/* Theme toggle */}
      <button
        onClick={() => onThemeChange(theme === 'dark' ? 'classic' : 'dark')}
        className="p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
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
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="w-7 h-7 rounded-full bg-edamame-100 dark:bg-edamame-900/30 text-edamame-700 dark:text-edamame-300 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials(userName || userEmail)}
        </span>
        <span className="hidden sm:block text-[13px] font-semibold text-gray-700 dark:text-slate-200 leading-none max-w-[140px] truncate">
          {userName || userEmail}
        </span>
      </button>
    </header>
  );
};
