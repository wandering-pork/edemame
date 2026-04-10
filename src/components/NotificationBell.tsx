import React, { useEffect, useRef, useState } from 'react';
import { Bell, Info, AlertTriangle, CheckCircle, XCircle, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification } from '../types';

interface NotificationBellProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: string) => void;
}

const typeConfig = {
  info: {
    Icon: Info,
    iconClass: 'text-blue-500',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: 'text-amber-500',
    bgClass: 'bg-amber-50 dark:bg-amber-900/20',
  },
  success: {
    Icon: CheckCircle,
    iconClass: 'text-green-500',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
  },
  error: {
    Icon: XCircle,
    iconClass: 'text-red-500',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
  },
} as const;

export const NotificationBell: React.FC<NotificationBellProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleBellClick = () => {
    setOpen(prev => !prev);
  };

  const handleNotificationClick = (id: string, read: boolean) => {
    if (!read) onMarkAsRead(id);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        className="relative p-2 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400 dark:text-slate-500">
                  {unreadCount} unread
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllAsRead}
                className="text-xs text-edamame-600 dark:text-edamame-400 hover:underline font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification list */}
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <Bell size={32} className="text-gray-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-gray-400 dark:text-slate-500">No notifications</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {sorted.map(notification => {
                const { Icon, iconClass, bgClass } = typeConfig[notification.type];
                return (
                  <li
                    key={notification.id}
                    className={`relative flex gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      notification.read
                        ? 'bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                        : 'bg-edamame-50 dark:bg-edamame-900/10 hover:bg-edamame-100/60 dark:hover:bg-edamame-900/20'
                    }`}
                    onClick={() => handleNotificationClick(notification.id, notification.read)}
                  >
                    {/* Type icon */}
                    <div className={`flex-shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${bgClass}`}>
                      <Icon size={15} className={iconClass} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-6">
                      <p className={`text-sm font-medium leading-snug truncate ${
                        notification.read
                          ? 'text-gray-600 dark:text-slate-400'
                          : 'text-gray-900 dark:text-slate-100'
                      }`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-[11px] text-gray-400 dark:text-slate-600 mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notification.read && (
                      <span className="absolute right-8 top-4 w-2 h-2 rounded-full bg-edamame-500 flex-shrink-0" />
                    )}

                    {/* Delete button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDelete(notification.id);
                      }}
                      className="absolute right-2 top-3 p-1 rounded text-gray-300 dark:text-slate-600 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                      aria-label="Dismiss notification"
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
