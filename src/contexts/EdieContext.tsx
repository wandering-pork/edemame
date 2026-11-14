import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useProfile } from './ProfileContext';
import type { FocusConversation } from '../types';

interface EdieContextValue {
  /** Whether the Edie panel is open. Saved on the user's profile. */
  open: boolean;
  setOpen: (next: boolean | ((open: boolean) => boolean)) => void;
  /** The open panel's element; a page renders its own Edie content into it via a portal. */
  panelEl: HTMLElement | null;
  setPanelEl: (el: HTMLElement | null) => void;
  /** True while a page (Case Details) is supplying Edie's content instead of the general chat. */
  pageClaimed: boolean;
  /** Called by a page on mount; returns the release function for unmount. */
  claimPanel: () => () => void;
  /** Suggestion count for the Edie button's badge; set by the claiming page. */
  suggestionCount: number;
  setSuggestionCount: (n: number) => void;
  /** False until the user dismisses the one-time "Ask Edie" tip (saved on the profile). */
  hintSeen: boolean;
  markHintSeen: () => void;
  /** General (non-case) chats. Kept for the browser session only. */
  generalConversations: FocusConversation[];
  setGeneralConversations: (convs: FocusConversation[]) => void;
}

const EdieContext = createContext<EdieContextValue | null>(null);

export function useEdie(): EdieContextValue {
  const ctx = useContext(EdieContext);
  if (!ctx) throw new Error('useEdie must be used inside EdieProvider');
  return ctx;
}

/**
 * Edie, the AI assistant, on every page of the app shell. Holds the panel's
 * open state (saved to `profiles.edie_open`, like `sidebar_collapsed`), the
 * Ctrl/Cmd+J shortcut, and the slot a page fills with its own Edie content.
 */
export const EdieProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, updateProfile } = useProfile();
  const [open, setOpenState] = useState<boolean>(profile?.edieOpen ?? false);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [generalConversations, setGeneralConversations] = useState<FocusConversation[]>([]);
  // Treated as seen until the profile has loaded, so the tip never flashes.
  const [hintSeen, setHintSeen] = useState<boolean>(profile?.edieHintSeen ?? true);
  const profileHintSeen = profile?.edieHintSeen;
  useEffect(() => {
    if (profileHintSeen !== undefined) setHintSeen(profileHintSeen);
  }, [profileHintSeen]);
  const hintSeenRef = useRef(hintSeen);
  hintSeenRef.current = hintSeen;
  const markHintSeen = useCallback(() => {
    if (hintSeenRef.current) return;
    setHintSeen(true);
    updateProfile({ edieHintSeen: true }).catch(err => console.error('Could not save Edie tip state', err));
  }, [updateProfile]);

  // Follow the profile when it loads or changes on another device's write.
  const profileOpen = profile?.edieOpen;
  useEffect(() => {
    if (profileOpen !== undefined) setOpenState(profileOpen);
  }, [profileOpen]);

  const openRef = useRef(open);
  openRef.current = open;
  const setOpen = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    const value = typeof next === 'function' ? next(openRef.current) : next;
    if (value === openRef.current) return;
    setOpenState(value);
    // Opening Edie means the user has found it, so the one-time tip is no
    // longer needed. Saved in the same write, so the two can't race.
    const dismissTip = value && !hintSeenRef.current;
    if (dismissTip) setHintSeen(true);
    updateProfile({ edieOpen: value, ...(dismissTip ? { edieHintSeen: true } : {}) })
      .catch(err => console.error('Could not save Edie panel state', err));
  }, [updateProfile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const claimPanel = useCallback(() => {
    setClaims(n => n + 1);
    return () => {
      setClaims(n => n - 1);
      setSuggestionCount(0);
    };
  }, []);

  const value = useMemo<EdieContextValue>(() => ({
    open,
    setOpen,
    panelEl,
    setPanelEl,
    pageClaimed: claims > 0,
    claimPanel,
    suggestionCount,
    setSuggestionCount,
    hintSeen,
    markHintSeen,
    generalConversations,
    setGeneralConversations,
  }), [open, setOpen, panelEl, claims, claimPanel, suggestionCount, hintSeen, markHintSeen, generalConversations]);

  return <EdieContext.Provider value={value}>{children}</EdieContext.Provider>;
};
