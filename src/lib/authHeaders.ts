import { supabase } from './supabaseClient';

/**
 * JSON request headers carrying the signed-in user's access token, for the api/ functions that
 * require sign-in (check-eligibility, generate-tasks, scan-passport-gemini, focus-chat, …).
 * Async and read at call time via getSession(), which returns a refreshed token if the old one
 * expired, so services that aren't React components can use it too and never send a stale token.
 * With no session the header is simply left off and the server answers 401.
 */
export async function authJsonHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
