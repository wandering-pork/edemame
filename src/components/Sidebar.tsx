import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, FileText, Settings, LogOut, Users, Menu, X,
  BookTemplate, Sparkles, UsersRound, UserCog, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
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
    className={({ isActive }) =>
      `group relative flex items-center rounded-lg text-[13px] font-medium transition-all duration-150 overflow-visible ${
        collapsed
          ? 'w-10 h-10 mx-auto justify-center'
          : 'w-full px-3 py-2.5 gap-3'
      } ${
        isActive
          ? collapsed
            ? 'bg-white/20 dark:bg-white/10 text-white shadow-inner'
            : 'bg-white/15 dark:bg-white/8 text-white'
          : 'text-white/55 dark:text-white/40 hover:bg-white/10 dark:hover:bg-white/6 hover:text-white/90'
      }`
    }
  >
    {({ isActive }) => (
      <>
        {/* Active indicator bar — expanded only */}
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-white rounded-r-full opacity-90" />
        )}

        {/* Active dot — collapsed only */}
        {isActive && collapsed && (
          <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full ring-1 ring-edamame-sidebar dark:ring-slate-900" />
        )}

        <Icon
          size={collapsed ? 17 : 16}
          className={`flex-shrink-0 transition-colors duration-150 ${
            isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'
          }`}
        />

        {!collapsed && (
          <span className="leading-none tracking-[-0.01em]">{label}</span>
        )}

        {/* Tooltip — collapsed mode */}
        {collapsed && (
          <span
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap z-[100] shadow-xl
                       bg-gray-950/95 dark:bg-slate-800 text-white
                       opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100
                       transition-all duration-100 origin-left"
          >
            {label}
            {/* Arrow */}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-950/95 dark:border-r-slate-800" />
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

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const sidebarContent = (isDrawer = false) => (
    <div className="flex flex-col h-full select-none">

      {/* ── Header: Logo + Collapse Toggle ── */}
      <div className="flex-shrink-0">

        {/* Top row: toggle (right) or mobile close */}
        <div className={`flex items-center px-2 pt-2 pb-0 ${collapsed && !isDrawer ? 'justify-center' : 'justify-end'}`}>
          {isDrawer ? (
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white/50 hover:text-white transition-all duration-150"
            >
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          )}
        </div>

        {/* Logo — links to dashboard */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `block transition-opacity duration-150 ${isActive ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`
          }
        >
          {collapsed && !isDrawer ? (
            /* Collapsed monogram */
            <div className="flex items-center justify-center py-3 w-full">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center ring-1 ring-white/10 shadow-inner">
                <span
                  className="text-white font-black text-base leading-none"
                  style={{ fontFamily: "'Sniglet', cursive" }}
                >
                  E
                </span>
              </div>
            </div>
          ) : (
            /* Full logo */
            <div className="flex items-center justify-center pt-2 pb-2 px-4 min-h-[110px]">
              <SidebarLogoArea />
            </div>
          )}
        </NavLink>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/8 dark:bg-white/5" />
      </div>

      {/* ── Navigation ── */}
      <nav className={`flex-1 overflow-y-auto py-4 custom-scrollbar ${collapsed && !isDrawer ? 'px-3' : 'px-3'} space-y-5`}>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {/* Section label */}
            {group.label && !(collapsed && !isDrawer) && (
              <p className="px-3 mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25 select-none">
                {group.label}
              </p>
            )}
            {/* Divider instead of label when collapsed */}
            {group.label && collapsed && !isDrawer && gi > 0 && (
              <div className="h-px bg-white/8 mx-2 mb-3" />
            )}

            <div className={`space-y-0.5 ${collapsed && !isDrawer ? 'flex flex-col items-center' : ''}`}>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  to={item.to}
                  label={item.label}
                  icon={item.icon}
                  collapsed={collapsed && !isDrawer}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="flex-shrink-0 pb-4 pt-2">
        <div className="mx-4 h-px bg-white/8 dark:bg-white/5 mb-3" />
        <div className={`px-3 space-y-0.5 ${collapsed && !isDrawer ? 'flex flex-col items-center space-y-0.5' : ''}`}>
          <NavItem
            to="/settings"
            label="Settings"
            icon={Settings}
            collapsed={collapsed && !isDrawer}
            onClick={() => setMobileOpen(false)}
          />

          {/* Sign Out */}
          <button
            className={`group relative flex items-center rounded-lg text-[13px] font-medium
              text-white/40 hover:bg-red-500/15 hover:text-red-300 transition-all duration-150
              ${collapsed && !isDrawer ? 'w-10 h-10 mx-auto justify-center' : 'w-full px-3 py-2.5 gap-3'}
            `}
          >
            <LogOut
              size={collapsed && !isDrawer ? 17 : 16}
              className="flex-shrink-0 text-white/35 group-hover:text-red-400 transition-colors"
            />
            {!(collapsed && !isDrawer) && (
              <span className="leading-none tracking-[-0.01em]">Sign Out</span>
            )}
            {collapsed && !isDrawer && (
              <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap z-[100] shadow-xl bg-gray-950/95 dark:bg-slate-800 text-white opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-100 origin-left">
                Sign Out
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-950/95 dark:border-r-slate-800" />
              </span>
            )}
          </button>
        </div>

        {/* Version — expanded only */}
        {!(collapsed && !isDrawer) && (
          <p className="px-6 mt-3 text-[10px] text-white/18 font-mono tracking-wider select-none">
            v1.0 · Edamame Legal
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 p-2.5 rounded-xl bg-edamame shadow-lg shadow-edamame/30 text-white active:scale-95 transition-transform"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* ── Desktop sidebar ── */}
      <aside
        className={`
          hidden md:flex flex-col
          bg-edamame-sidebar dark:bg-slate-900
          border-r border-transparent dark:border-slate-800
          h-screen fixed left-0 top-0 z-20
          transition-[width] duration-300 ease-in-out
          overflow-hidden
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
        {/* Subtle depth texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(255,255,255,0.5) 24px, rgba(255,255,255,0.5) 25px)',
          }}
        />
        <div className="relative z-10 flex flex-col h-full">
          {sidebarContent(false)}
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
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
        {sidebarContent(true)}
      </aside>
    </>
  );
};
