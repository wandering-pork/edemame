import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True only when both env vars are actually present — i.e. the client below is
 * talking to a real project rather than the placeholder fallback. Cloud storage
 * mode routes all app data through Supabase, so callers must check this before
 * assuming reads/writes can work at all.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in src/.env.local — ' +
    'see https://supabase.com/dashboard/project/_/settings/api. Auth and cloud storage will not work until this is set.'
  );
}

// Fall back to a syntactically valid placeholder so createClient() doesn't throw and
// blank the whole app when Supabase isn't configured yet — auth calls will just fail.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key');
