import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getProfile, createProfile, updateProfile as updateProfileRow, type Profile, type ProfileUpdate } from '@/services/profileService';
import type { StorageMode } from '@/types';
import { readValidatedJson, writeLocalJson } from '@/lib/devLocalStorage';

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  /** Creates the profile row for a brand-new user completing onboarding. */
  completeOnboarding: (storageMode: StorageMode) => Promise<Profile>;
  updateProfile: (update: ProfileUpdate) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);
// Gated transitively by `import.meta.env.DEV` (see AuthContext.tsx's
// DEV_OFFLINE_AUTH) — this whole branch, including the localStorage use
// below, is dead-code-eliminated from production builds.
const DEV_OFFLINE_AUTH = import.meta.env.DEV && import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';

function devProfileStorageKey(userId: string): string {
  return `edamame:dev-offline-profile:${userId}`;
}

function isDevProfile(userId: string): (value: unknown) => value is Profile {
  return (value: unknown): value is Profile => {
    const parsed = value as Partial<Profile> | null;
    return (
      !!parsed &&
      parsed.userId === userId &&
      (parsed.storageMode === 'local' || parsed.storageMode === 'cloud') &&
      (parsed.theme === 'classic' || parsed.theme === 'dark') &&
      typeof parsed.sidebarCollapsed === 'boolean' &&
      (parsed.linkedFolderName === undefined || parsed.linkedFolderName === null || typeof parsed.linkedFolderName === 'string') &&
      (parsed.linkedAt === undefined || parsed.linkedAt === null || typeof parsed.linkedAt === 'string')
    );
  };
}

function readDevProfile(userId: string): Profile | null {
  const profile = readValidatedJson(devProfileStorageKey(userId), isDevProfile(userId));
  if (!profile) return null;
  // Normalize omitted optional fields to `null` to match the Profile shape.
  return {
    ...profile,
    linkedFolderName: profile.linkedFolderName ?? null,
    linkedAt: profile.linkedAt ?? null,
  };
}

// Deliberate, narrow exception to root CLAUDE.md's "no app data lives in the
// browser" policy: this is dev-only tooling, never active in a production
// build (see the DEV_OFFLINE_AUTH guard above), used purely to let local dev
// work without a live Supabase project. Real user profiles always go through
// services/profileService.ts to the `profiles` table.
function saveDevProfile(profile: Profile): void {
  writeLocalJson(devProfileStorageKey(profile.userId), profile);
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
      // Mirrors services/profileService.ts's `!== undefined` checks exactly:
      // `??` would treat an explicit `null` (clearing a field) the same as
      // `undefined` (field not touched) and silently drop the clear.
      const updated: Profile = {
        userId,
        storageMode: update.storageMode !== undefined ? update.storageMode : current.storageMode,
        theme: update.theme !== undefined ? update.theme : current.theme,
        sidebarCollapsed: update.sidebarCollapsed !== undefined ? update.sidebarCollapsed : current.sidebarCollapsed,
        linkedFolderName: update.linkedFolderName !== undefined ? update.linkedFolderName : current.linkedFolderName,
        linkedAt: update.linkedAt !== undefined ? update.linkedAt : current.linkedAt,
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
