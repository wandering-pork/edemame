/**
 * LOCAL DEV ONLY — not committed. Delete this file to remove the offline login.
 *
 * Lets the app run with no Supabase project by standing in for the two things
 * that talk to Supabase before the app shell renders: the auth session and the
 * `profiles` row. Everything downstream (LocalFolderProvider, LinkFolderGate,
 * RepositoryProvider, the filesystem repositories) is untouched and runs
 * exactly as it does in production.
 *
 * Gated on VITE_DEV_OFFLINE_AUTH, which is absent on Vercel, so production can
 * only ever take the real Supabase path.
 */
import type { Session, User } from '@supabase/supabase-js';
import type { Profile } from '@/services/profileService';

export const DEV_OFFLINE_AUTH = import.meta.env.VITE_DEV_OFFLINE_AUTH === 'true';

export const DEV_EMAIL = import.meta.env.VITE_DEV_AUTH_EMAIL ?? 'test@edamame.local';
export const DEV_PASSWORD = import.meta.env.VITE_DEV_AUTH_PASSWORD ?? 'Edamame!2026';
export const DEV_NAME = import.meta.env.VITE_DEV_AUTH_NAME ?? 'Test Practitioner';

/**
 * Fixed so the linked-folder handle (keyed by user id in IndexedDB) and the
 * "you" team member survive restarts. A real UUID because downstream code
 * treats user ids as such.
 */
export const DEV_USER_ID = '00000000-4444-4444-8888-000000000001';

const SESSION_KEY = 'edamame.dev.session';
const PROFILE_KEY = `edamame.dev.profile.${DEV_USER_ID}`;

export function makeDevSession(): Session {
  const now = Math.floor(Date.now() / 1000);
  const user: User = {
    id: DEV_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: DEV_EMAIL,
    app_metadata: { provider: 'dev' },
    user_metadata: { full_name: DEV_NAME },
    created_at: new Date(0).toISOString(),
  } as User;

  return {
    access_token: 'dev-offline-access-token',
    refresh_token: 'dev-offline-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: now + 60 * 60 * 24 * 365,
    user,
  } as Session;
}

export function loadDevSession(): Session | null {
  return localStorage.getItem(SESSION_KEY) ? makeDevSession() : null;
}

export function saveDevSession(): Session {
  localStorage.setItem(SESSION_KEY, '1');
  return makeDevSession();
}

export function clearDevSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadDevProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export function saveDevProfile(profile: Profile): Profile {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}
