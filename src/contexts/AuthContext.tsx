import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

type AuthUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

interface AuthContextValue {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    extraMetadata?: Record<string, unknown>
  ) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEV_OFFLINE_AUTH = import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';
const DEV_TEST_EMAIL = (import.meta.env.VITE_DEV_AUTH_EMAIL as string | undefined)?.trim().toLowerCase() || 'test@edamame.local';
const DEV_TEST_PASSWORD = import.meta.env.VITE_DEV_AUTH_PASSWORD as string | undefined;
const DEV_TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEV_OFFLINE_USER_KEY = 'edamame:dev-offline-auth-user';

interface DevOfflineUserRecord {
  id: string;
  email: string;
  fullName: string;
}

function toAuthUser(record: DevOfflineUserRecord): AuthUser {
  return {
    id: record.id,
    email: record.email,
    user_metadata: { full_name: record.fullName },
  };
}

function readDevOfflineUser(): DevOfflineUserRecord | null {
  const raw = localStorage.getItem(DEV_OFFLINE_USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DevOfflineUserRecord>;
    if (
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.fullName === 'string'
    ) {
      return { id: parsed.id, email: parsed.email, fullName: parsed.fullName };
    }
    console.error('Invalid dev offline auth payload in localStorage.');
    localStorage.removeItem(DEV_OFFLINE_USER_KEY);
    return null;
  } catch (error) {
    console.error('Failed to parse dev offline auth payload.', error);
    localStorage.removeItem(DEV_OFFLINE_USER_KEY);
    return null;
  }
}

function saveDevOfflineUser(record: DevOfflineUserRecord): void {
  localStorage.setItem(DEV_OFFLINE_USER_KEY, JSON.stringify(record));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_OFFLINE_AUTH) {
      const stored = readDevOfflineUser();
      setSession(null);
      setUser(stored ? toAuthUser(stored) : null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName, extraMetadata) => {
    if (DEV_OFFLINE_AUTH) {
      if (!DEV_TEST_PASSWORD) {
        return {
          error: 'Dev offline mode requires VITE_DEV_AUTH_PASSWORD to be set in local env.',
          needsEmailConfirmation: false,
        };
      }
      if (email.trim().toLowerCase() !== DEV_TEST_EMAIL || password !== DEV_TEST_PASSWORD) {
        return {
          error: `Dev offline mode allows only ${DEV_TEST_EMAIL} with the configured test password.`,
          needsEmailConfirmation: false,
        };
      }
      const company = typeof extraMetadata?.company === 'string' ? extraMetadata.company : undefined;
      const displayName = fullName.trim() || 'Edamame Test User';
      const record: DevOfflineUserRecord = {
        id: DEV_TEST_USER_ID,
        email: DEV_TEST_EMAIL,
        fullName: company ? `${displayName} (${company})` : displayName,
      };
      saveDevOfflineUser(record);
      setSession(null);
      setUser(toAuthUser(record));
      return { error: null, needsEmailConfirmation: false };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, ...extraMetadata } },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // If email confirmation is required, Supabase returns a user with no session.
    const needsEmailConfirmation = !!data.user && !data.session;
    return { error: null, needsEmailConfirmation };
  };

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    if (DEV_OFFLINE_AUTH) {
      if (!DEV_TEST_PASSWORD) {
        return { error: 'Dev offline mode requires VITE_DEV_AUTH_PASSWORD to be set in local env.' };
      }
      if (email.trim().toLowerCase() !== DEV_TEST_EMAIL || password !== DEV_TEST_PASSWORD) {
        return { error: 'Invalid email or password.' };
      }
      const existing = readDevOfflineUser();
      const record: DevOfflineUserRecord = existing ?? {
        id: DEV_TEST_USER_ID,
        email: DEV_TEST_EMAIL,
        fullName: 'Edamame Test User',
      };
      saveDevOfflineUser(record);
      setSession(null);
      setUser(toAuthUser(record));
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    if (DEV_OFFLINE_AUTH) {
      localStorage.removeItem(DEV_OFFLINE_USER_KEY);
      setSession(null);
      setUser(null);
      return;
    }
    await supabase.auth.signOut();
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    if (DEV_OFFLINE_AUTH) {
      return { error: `Password reset is unavailable in dev offline mode. Use ${DEV_TEST_EMAIL}.` };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error ? error.message : null };
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signUp, signIn, signOut, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
