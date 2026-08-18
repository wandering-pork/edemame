import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getProfile, createProfile, updateProfile as updateProfileRow, type Profile, type ProfileUpdate } from '@/services/profileService';
import type { StorageMode } from '@/types';

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  /** Creates the profile row for a brand-new user completing onboarding. */
  completeOnboarding: (storageMode: StorageMode) => Promise<Profile>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);
const DEV_OFFLINE_AUTH = import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';

function devProfileStorageKey(userId: string): string {
  return `edamame:dev-offline-profile:${userId}`;
}

function readDevProfile(userId: string): Profile | null {
  const raw = localStorage.getItem(devProfileStorageKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (
      parsed.userId === userId &&
      (parsed.storageMode === 'local' || parsed.storageMode === 'cloud') &&
      (parsed.theme === 'classic' || parsed.theme === 'dark') &&
      typeof parsed.sidebarCollapsed === 'boolean'
    ) {
      return {
        userId,
        storageMode: parsed.storageMode,
        theme: parsed.theme,
        sidebarCollapsed: parsed.sidebarCollapsed,
        linkedFolderName: parsed.linkedFolderName ?? null,
        linkedAt: parsed.linkedAt ?? null,
      };
    }
    console.error('Invalid dev offline profile payload in localStorage.');
    localStorage.removeItem(devProfileStorageKey(userId));
    return null;
  } catch (error) {
    console.error('Failed to parse dev offline profile payload.', error);
    localStorage.removeItem(devProfileStorageKey(userId));
    return null;
  }
}

function saveDevProfile(profile: Profile): void {
  localStorage.setItem(devProfileStorageKey(profile.userId), JSON.stringify(profile));
}

function defaultDevProfile(userId: string, storageMode: StorageMode): Profile {
  return {
    userId,
    storageMode,
    theme: 'classic',
    sidebarCollapsed: false,
    linkedFolderName: null,
    linkedAt: null,
  };
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Safe: ProfileProvider is only ever rendered inside ProtectedRoute, which guarantees a session.
  const userId = user!.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_OFFLINE_AUTH) {
      setLoading(true);
      setProfile(readDevProfile(userId));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getProfile(userId)
      .then(p => { if (!cancelled) setProfile(p); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const completeOnboarding = useCallback(async (storageMode: StorageMode) => {
    if (DEV_OFFLINE_AUTH) {
      const created = defaultDevProfile(userId, storageMode);
      saveDevProfile(created);
      setProfile(created);
      return created;
    }
    const created = await createProfile(userId, storageMode);
    setProfile(created);
    return created;
  }, [userId]);

  const updateProfile = useCallback(async (update: ProfileUpdate) => {
    if (DEV_OFFLINE_AUTH) {
      const current = readDevProfile(userId) ?? defaultDevProfile(userId, 'local');
      const updated: Profile = {
        userId,
        storageMode: update.storageMode ?? current.storageMode,
        theme: update.theme ?? current.theme,
        sidebarCollapsed: update.sidebarCollapsed ?? current.sidebarCollapsed,
        linkedFolderName: update.linkedFolderName ?? current.linkedFolderName,
        linkedAt: update.linkedAt ?? current.linkedAt,
      };
      saveDevProfile(updated);
      setProfile(updated);
      return;
    }
    const updated = await updateProfileRow(userId, update);
    setProfile(updated);
  }, [userId]);

  return (
    <ProfileContext.Provider value={{ profile, loading, completeOnboarding, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
