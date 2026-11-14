import { supabase } from '@/lib/supabaseClient';
import type { StorageMode, Theme } from '@/types';

export interface Profile {
  userId: string;
  storageMode: StorageMode;
  theme: Theme;
  sidebarCollapsed: boolean;
  /** Whether the Edie assistant panel is open. */
  edieOpen: boolean;
  /** Whether the user has dismissed the one-time "Ask Edie" tip on a case. */
  edieHintSeen: boolean;
  linkedFolderName: string | null;
  linkedAt: string | null;
  /** The firm this user is currently acting as (Step 1 · 1F). Cloud-only; null in local mode and for a cloud user with no firm yet. */
  currentFirmId: string | null;
}

interface ProfileRow {
  user_id: string;
  storage_mode: StorageMode;
  theme: Theme;
  sidebar_collapsed: boolean;
  edie_open?: boolean | null;
  edie_hint_seen?: boolean | null;
  linked_folder_name: string | null;
  linked_at: string | null;
  current_firm_id: string | null;
}

function fromRow(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    storageMode: row.storage_mode,
    theme: row.theme,
    sidebarCollapsed: row.sidebar_collapsed,
    edieOpen: row.edie_open ?? false,
    edieHintSeen: row.edie_hint_seen ?? false,
    linkedFolderName: row.linked_folder_name,
    linkedAt: row.linked_at,
    currentFirmId: row.current_firm_id ?? null,
  };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as ProfileRow) : null;
}

export async function createProfile(userId: string, storageMode: StorageMode): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, storage_mode: storageMode })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}

export interface ProfileUpdate {
  storageMode?: StorageMode;
  theme?: Theme;
  sidebarCollapsed?: boolean;
  edieOpen?: boolean;
  edieHintSeen?: boolean;
  linkedFolderName?: string | null;
  linkedAt?: string | null;
  /** Self-heal path only — normally set server-side by the `create_firm`/accept-invite RPCs, not through this update. See FirmContext.tsx. */
  currentFirmId?: string | null;
}

export async function updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
  const patch: Partial<ProfileRow> = {};
  if (update.storageMode !== undefined) patch.storage_mode = update.storageMode;
  if (update.theme !== undefined) patch.theme = update.theme;
  if (update.sidebarCollapsed !== undefined) patch.sidebar_collapsed = update.sidebarCollapsed;
  if (update.edieOpen !== undefined) patch.edie_open = update.edieOpen;
  if (update.edieHintSeen !== undefined) patch.edie_hint_seen = update.edieHintSeen;
  if (update.linkedFolderName !== undefined) patch.linked_folder_name = update.linkedFolderName;
  if (update.linkedAt !== undefined) patch.linked_at = update.linkedAt;
  if (update.currentFirmId !== undefined) patch.current_firm_id = update.currentFirmId;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}
