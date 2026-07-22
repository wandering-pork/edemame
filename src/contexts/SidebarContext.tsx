import React, { createContext, useContext, useState, useEffect } from 'react';
import { useProfile } from './ProfileContext';

interface SidebarContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
  setCollapsed: () => {},
});

export const useSidebar = () => useContext(SidebarContext);

export const SidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, updateProfile } = useProfile();
  const [collapsed, setCollapsedState] = useState<boolean>(profile?.sidebarCollapsed ?? false);

  useEffect(() => {
    if (profile) setCollapsedState(profile.sidebarCollapsed);
  }, [profile]);

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    updateProfile({ sidebarCollapsed: v });
  };

  const toggle = () => setCollapsed(!collapsed);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
};
