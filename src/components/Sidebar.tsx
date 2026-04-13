import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Settings, LogOut, Users, Menu, X, BookTemplate, Sparkles, UsersRound, UserCog, ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { SidebarLogoArea } from './SidebarLogoArea';
import { useSidebar } from '../contexts/SidebarContext';

interface NavGroup {
  label?: string;
  items: { to: string; label: string; icon: React.ElementType }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/cases', label: 'Case Manager', icon: FileText },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/visa-advisor', label: 'Visa Advisor', icon: Sparkles },
      { to: '/templates', label: 'Templates', icon: BookTemplate },
    ],
  },
  {
    label: 'Team',
    items: [
      { to: '/team', label: 'Team View', icon: UsersRound },
      { to: '/team-members', label: 'Team Members', icon: UserCog },
    ],
  },
];

const NavItem: React.FC<{
  to: string;
  label: string;
  icon: React.ElementType;
  collapsed?: boolean;
  onClick?: () => void;
}> = ({ to, label, icon: Icon, collapsed, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={({ isActive }) =>
      `group relative w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
        collapsed ? 'px-0 py-2.5 justify-center' : 'px-4 py-2.5'
      } ${
        isActive
          ? 'bg-white/95 dark:bg-slate-800 text-edamame-600 dark:text-edamame-400 nav-active-glow'
          : 'text-white/85 dark:text-slate-400 hover:bg-white/10 dark:hover:bg-slate-800/80 hover:text-white dark:hover:text-slate-200'
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-edamame-500 rounded-r-full" />
        )}
        <Icon
          size={18}
          className={`flex-shrink-0 transition-colors ${
            isActive ? 'text-edamame-500' : 'text-white/60 dark:text-slate-500 group-hover:text-white dark:group-hover:text-slate-300'
          }`}
        />
        {!collapsed && <span className="leading-none">{label}</span>}

        {/* Tooltip shown in collapsed mode */}
        {collapsed && (
          <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-slate-700 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
            {label}
          </span>
        )}
      </>
    )}
  </NavLink>
);

export const Sidebar: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { collapsed, toggle } = useSidebar();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Prevent scroll when drawer open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo Area */}
      <div className={`relative border-b border-white/8 dark:border-slate-800 flex-shrink-0 transition-all duration-300 ${collapsed ? 'py-4' : ''}`}>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden absolute top-3 right-3 z-10 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>

        {collapsed ? (
          /* Collapsed: show compact icon mark */
          <div className="flex flex-col items-center gap-2 py-1">
            <div className="w-8 h-8 rounded-lg bg-white/15 dark:bg-edamame/20 flex items-center justify-center">
              <span className="text-white dark:text-edamame-400 font-black text-sm font-['Sniglet',_cursive] leading-none">E</span>
            </div>
          </div>
        ) : (
          <div className="w-full py-5 px-4 flex items-center justify-center min-h-[130px]">
            <SidebarLogoArea />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto py-5 custom-scrollbar space-y-4 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {navGroups.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.label && !collapsed && (
              <p className="px-4 mb-2 text-[10px] font-bold uppercase tracking-widest text-white/30 dark:text-slate-600 select-none">
                {group.label}
              </p>
            )}
            {group.label && collapsed && (
              <div className="h-px bg-white/8 dark:bg-slate-800 mx-2 mb-2" />
            )}
            {group.items.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
                onClick={() => setMobileOpen(false)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className={`py-4 border-t border-white/8 dark:border-slate-800 space-y-1 flex-shrink-0 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        <NavItem
          to="/settings"
          label="Settings"
          icon={Settings}
          collapsed={collapsed}
          onClick={() => setMobileOpen(false)}
        />
        <button
          title={collapsed ? 'Sign Out' : undefined}
          className={`group relative w-full flex items-center gap-3 rounded-xl text-sm font-semibold text-white/70 dark:text-slate-500 hover:bg-red-500/15 dark:hover:bg-red-900/20 hover:text-red-200 dark:hover:text-red-400 transition-all duration-150 ${collapsed ? 'px-0 py-2.5 justify-center' : 'px-4 py-2.5'}`}
        >
          <LogOut size={18} className="flex-shrink-0 text-white/40 dark:text-slate-600 group-hover:text-red-300 dark:group-hover:text-red-500 transition-colors" />
          {!collapsed && <span className="leading-none">Sign Out</span>}
          {collapsed && (
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-slate-700 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
              Sign Out
            </span>
          )}
        </button>

        {/* Collapse toggle — always visible */}
        <div className={`${collapsed ? 'flex justify-center pt-1' : 'px-4 pt-2 flex items-center justify-between'}`}>
          {!collapsed && (
            <span className="text-[10px] text-white/20 dark:text-slate-700 font-mono select-none">v1.0 · Edamame Legal</span>
          )}
          <button
            onClick={toggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-white/30 dark:text-slate-600 hover:text-white/70 dark:hover:text-slate-300 hover:bg-white/10 dark:hover:bg-slate-800 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger trigger — fixed top-left, visible only on mobile */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl bg-edamame shadow-lg shadow-edamame/30 text-white transition-all active:scale-95"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col bg-edamame-sidebar dark:bg-slate-900 border-r border-transparent dark:border-slate-800 h-screen fixed left-0 top-0 z-20 transition-[width] duration-300 ease-in-out overflow-hidden ${collapsed ? 'w-16' : 'w-64'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-full w-72 z-50 bg-edamame-sidebar dark:bg-slate-900 shadow-2xl sidebar-drawer ${
          mobileOpen ? 'sidebar-drawer-open' : 'sidebar-drawer-closed'
        }`}
        aria-modal="true"
        role="dialog"
      >
        {sidebarContent}
      </aside>
    </>
  );
};
