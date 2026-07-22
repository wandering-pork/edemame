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

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Safe: ProfileProvider is only ever rendered inside ProtectedRoute, which guarantees a session.
  const userId = user!.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProfile(userId)
      .then(p => { if (!cancelled) setProfile(p); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const completeOnboarding = useCallback(async (storageMode: StorageMode) => {
    const created = await createProfile(userId, storageMode);
    setProfile(created);
    return created;
  }, [userId]);

  const updateProfile = useCallback(async (update: ProfileUpdate) => {
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
