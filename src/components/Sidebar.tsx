import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, FileText, Settings, LogOut, Users, Menu, X,
  BookTemplate, Sparkles, UsersRound, UserCog, PanelLeftClose, PanelLeftOpen,
  Building2, Check, ChevronsUpDown,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { SidebarLogoArea } from './SidebarLogoArea';
import { useSidebar } from '../contexts/SidebarContext';
import { useAuth } from '../contexts/AuthContext';
import { useStorageMode } from '../contexts/RepositoryContext';
import { useFirm } from '../contexts/FirmContext';
import { firmRoleLabel } from '../lib/firmDirectory';

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
            ? 'bg-edamame/12 dark:bg-edamame/15 text-ink dark:text-plate-ink shadow-inner'
            : 'bg-edamame/10 dark:bg-edamame/15 text-ink dark:text-plate-ink'
          : 'text-ink-faint dark:text-plate-ink-faint hover:bg-ink/5 dark:hover:bg-plate-ink/8 hover:text-ink dark:hover:text-plate-ink'
      }`
    }
  >
    {({ isActive }) => (
      <>
        {/* Active indicator bar — expanded only */}
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-edamame-600 dark:bg-edamame-400 rounded-r-full opacity-90" />
        )}

        {/* Active dot — collapsed only */}
        {isActive && collapsed && (
          <span className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-edamame-600 dark:bg-edamame-400 rounded-full ring-1 ring-paper dark:ring-plate" />
        )}

        <Icon
          size={collapsed ? 17 : 16}
          className={`flex-shrink-0 transition-colors duration-150 ${
            isActive ? 'text-edamame-700 dark:text-edamame-400' : 'text-ink-faint dark:text-plate-ink-faint group-hover:text-ink-soft dark:group-hover:text-plate-ink-soft'
          }`}
        />

        {!collapsed && (
          <span className="leading-none tracking-[-0.01em]">{label}</span>
        )}

        {/* Tooltip — collapsed mode */}
        {collapsed && (
          <span
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap z-[100] shadow-xl
                       bg-ink dark:bg-plate-card text-paper dark:text-plate-ink
                       opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100
                       transition-all duration-100 origin-left"
          >
            {label}
            {/* Arrow */}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink dark:border-r-plate-card" />
          </span>
        )}
      </>
    )}
  </NavLink>
);

/**
 * Step 1 · 1G.5 — the current firm's name under the logo, cloud mode only
 * (local mode has no firm concept — useFirm() returns firm: null there, so
 * this renders nothing). With more than one active membership it becomes a
 * switcher: a menu listing every firm the user belongs to, their role in
 * each, and a checkmark on the current one. Picking another firm updates
 * profiles.current_firm_id and reloads (FirmContext.switchFirm) — the same
 * full-reload pattern the storage-mode switch already uses, since cloud
 * repositories are built for one firm.
 */
const FirmSwitcher: React.FC<{ collapsed: boolean; isDrawer: boolean }> = ({ collapsed, isDrawer }) => {
  const storageMode = useStorageMode();
  const { firm, memberships, switchFirm } = useFirm();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const effectivelyCollapsed = collapsed && !isDrawer;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (storageMode !== 'cloud' || !firm) return null;

  const canSwitch = memberships.length > 1;

  const handlePick = async (firmId: string) => {
    if (firmId === firm.id || switching) return;
    setSwitching(true);
    setOpen(false);
    try {
      await switchFirm(firmId);
    } catch (err) {
      console.error('Failed to switch firms:', err);
      setSwitching(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative px-3 pb-2 ${effectivelyCollapsed ? 'flex justify-center' : ''}`}>
      <button
        type="button"
        onClick={() => canSwitch && setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={effectivelyCollapsed ? firm.name : undefined}
        className={`group relative flex items-center rounded-lg text-[12px] font-medium transition-all duration-150 ${
          effectivelyCollapsed ? 'w-9 h-9 justify-center' : 'w-full px-2.5 py-2 gap-2'
        } ${canSwitch ? 'cursor-pointer hover:bg-ink/6 dark:hover:bg-plate-ink/10' : 'cursor-default'} ${
          open ? 'bg-ink/6 dark:bg-plate-ink/10' : ''
        }`}
        disabled={switching}
      >
        <Building2 size={effectivelyCollapsed ? 15 : 14} className="flex-shrink-0 text-ink-faint dark:text-plate-ink-faint" />
        {!effectivelyCollapsed && (
          <>
            <span className="flex-1 min-w-0 text-left truncate text-ink-soft dark:text-plate-ink-soft">
              {switching ? 'Switching...' : firm.name}
            </span>
            {canSwitch && (
              <ChevronsUpDown size={12} className="flex-shrink-0 text-ink-faint dark:text-plate-ink-faint" />
            )}
          </>
        )}
        {effectivelyCollapsed && (
          <span
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap z-[100] shadow-xl
                       bg-ink dark:bg-plate-card text-paper dark:text-plate-ink
                       opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100
                       transition-all duration-100 origin-left"
          >
            {firm.name}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink dark:border-r-plate-card" />
          </span>
        )}
      </button>

      {open && canSwitch && (
        <div
          role="menu"
          aria-label="Switch firm"
          className={`absolute z-[110] mt-1 min-w-[220px] rounded-xl border border-ink/10 dark:border-plate-ink/15 bg-paper dark:bg-plate-card shadow-xl py-1.5 ${
            effectivelyCollapsed ? 'left-[calc(100%+10px)] top-0' : 'left-3 right-3'
          }`}
        >
          {memberships.map(m => (
            <button
              key={m.firmId}
              type="button"
              role="menuitemradio"
              aria-checked={m.firmId === firm.id}
              onClick={() => handlePick(m.firmId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12.5px] text-ink dark:text-plate-ink hover:bg-ink/6 dark:hover:bg-plate-ink/10 transition-colors"
            >
              <span className="w-3.5 flex-shrink-0">
                {m.firmId === firm.id && <Check size={13} className="text-edamame-600 dark:text-edamame-400" />}
              </span>
              <span className="flex-1 min-w-0 truncate font-medium">{m.firmName}</span>
              <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-ink-faint dark:text-plate-ink-faint">
                {firmRoleLabel(m.role)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebar();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    setMobileOpen(false);
    await signOut();
    navigate('/', { replace: true });
  };

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
              className="p-1.5 rounded-lg text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink hover:bg-ink/8 dark:hover:bg-plate-ink/10 transition-colors"
            >
              <X size={16} />
            </button>
          ) : (
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex items-center justify-center w-7 h-7 rounded-lg bg-ink/6 dark:bg-plate-ink/10 hover:bg-ink/10 dark:hover:bg-plate-ink/15 text-ink-faint dark:text-plate-ink-faint hover:text-ink dark:hover:text-plate-ink transition-all duration-150"
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
              <div className="w-9 h-9 rounded-xl bg-ink/8 dark:bg-plate-ink/10 flex items-center justify-center ring-1 ring-ink/10 dark:ring-plate-ink/15 shadow-inner">
                <span
                  className="text-edamame-700 dark:text-edamame-400 font-black text-base leading-none"
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

        {/* Current firm / switcher (cloud mode only) */}
        <FirmSwitcher collapsed={collapsed} isDrawer={isDrawer} />

        {/* Divider */}
        <div className="mx-4 h-px bg-ink/10 dark:bg-plate-ink/15" />
      </div>

      {/* ── Navigation ── */}
      <nav className={`flex-1 overflow-y-auto py-4 custom-scrollbar ${collapsed && !isDrawer ? 'px-3' : 'px-3'} space-y-5`}>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {/* Section label */}
            {group.label && !(collapsed && !isDrawer) && (
              <p className="px-3 mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-soft/40 dark:text-plate-ink-soft/40 select-none">
                {group.label}
              </p>
            )}
            {/* Divider instead of label when collapsed */}
            {group.label && collapsed && !isDrawer && gi > 0 && (
              <div className="h-px bg-ink/10 dark:bg-plate-ink/15 mx-2 mb-3" />
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
        <div className="mx-4 h-px bg-ink/10 dark:bg-plate-ink/15 mb-3" />
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
            onClick={handleSignOut}
            className={`group relative flex items-center rounded-lg text-[13px] font-medium
              text-ink-faint dark:text-plate-ink-faint hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-all duration-150
              ${collapsed && !isDrawer ? 'w-10 h-10 mx-auto justify-center' : 'w-full px-3 py-2.5 gap-3'}
            `}
          >
            <LogOut
              size={collapsed && !isDrawer ? 17 : 16}
              className="flex-shrink-0 text-ink-faint dark:text-plate-ink-faint group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors"
            />
            {!(collapsed && !isDrawer) && (
              <span className="leading-none tracking-[-0.01em]">Sign Out</span>
            )}
            {collapsed && !isDrawer && (
              <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-md text-[12px] font-medium whitespace-nowrap z-[100] shadow-xl bg-ink dark:bg-plate-card text-paper dark:text-plate-ink opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 transition-all duration-100 origin-left">
                Sign Out
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink dark:border-r-plate-card" />
              </span>
            )}
          </button>
        </div>

        {/* Version — expanded only */}
        {!(collapsed && !isDrawer) && (
          <p className="px-6 mt-3 text-[10px] text-ink-soft/40 dark:text-plate-ink-soft/40 font-mono tracking-wider select-none">
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
          bg-paper dark:bg-plate
          border-r border-ink/10 dark:border-plate-ink/15
          h-screen fixed left-0 top-0 z-20
          transition-[width] duration-300 ease-in-out
          overflow-hidden
          ${collapsed ? 'w-16' : 'w-[240px]'}
        `}
      >
        {/* Subtle depth texture */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.035] text-ink dark:text-plate-ink"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, currentColor 24px, currentColor 25px)',
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
        className={`md:hidden fixed left-0 top-0 h-full w-72 z-50 bg-paper dark:bg-plate shadow-2xl sidebar-drawer ${
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
