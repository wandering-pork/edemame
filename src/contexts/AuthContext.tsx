import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
// LOCAL DEV ONLY — remove with `git checkout src/contexts/AuthContext.tsx`.
import {
  DEV_OFFLINE_AUTH,
  DEV_EMAIL,
  DEV_PASSWORD,
  loadDevSession,
  saveDevSession,
  clearDevSession,
} from '@/lib/devOfflineAuth';

interface AuthContextValue {
  user: User | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // LOCAL DEV ONLY — offline session, no network.
    if (DEV_OFFLINE_AUTH) {
      setSession(loadDevSession());
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signUp: AuthContextValue['signUp'] = async (email, password, fullName, extraMetadata) => {
    // LOCAL DEV ONLY — registering just signs straight in as the dev user.
    if (DEV_OFFLINE_AUTH) {
      setSession(saveDevSession());
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
    // LOCAL DEV ONLY — validates against the credentials in src/.env.local.
    if (DEV_OFFLINE_AUTH) {
      if (email.trim().toLowerCase() !== DEV_EMAIL.toLowerCase() || password !== DEV_PASSWORD) {
        return { error: 'Invalid login credentials' };
      }
      setSession(saveDevSession());
      return { error: null };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    // LOCAL DEV ONLY
    if (DEV_OFFLINE_AUTH) {
      clearDevSession();
      setSession(null);
      return;
    }
    await supabase.auth.signOut();
  };

  const resetPassword: AuthContextValue['resetPassword'] = async (email) => {
    // LOCAL DEV ONLY — nothing to email offline.
    if (DEV_OFFLINE_AUTH) return { error: null };

    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error ? error.message : null };
  };

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, signUp, signIn, signOut, resetPassword }}
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
