import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in src/.env.local — ' +
    'see https://supabase.com/dashboard/project/_/settings/api. Auth will not work until this is set.'
  );
}

// Fall back to a syntactically valid placeholder so createClient() doesn't throw and
// blank the whole app when Supabase isn't configured yet — auth calls will just fail.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key');
