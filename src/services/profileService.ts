import { supabase } from '@/lib/supabaseClient';
import type { StorageMode, Theme } from '@/types';

export interface Profile {
  userId: string;
  storageMode: StorageMode;
  theme: Theme;
  sidebarCollapsed: boolean;
  linkedFolderName: string | null;
  linkedAt: string | null;
}

interface ProfileRow {
  user_id: string;
  storage_mode: StorageMode;
  theme: Theme;
  sidebar_collapsed: boolean;
  linked_folder_name: string | null;
  linked_at: string | null;
}

function fromRow(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    storageMode: row.storage_mode,
    theme: row.theme,
    sidebarCollapsed: row.sidebar_collapsed,
    linkedFolderName: row.linked_folder_name,
    linkedAt: row.linked_at,
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
  linkedFolderName?: string | null;
  linkedAt?: string | null;
}

export async function updateProfile(userId: string, update: ProfileUpdate): Promise<Profile> {
  const patch: Partial<ProfileRow> = {};
  if (update.storageMode !== undefined) patch.storage_mode = update.storageMode;
  if (update.theme !== undefined) patch.theme = update.theme;
  if (update.sidebarCollapsed !== undefined) patch.sidebar_collapsed = update.sidebarCollapsed;
  if (update.linkedFolderName !== undefined) patch.linked_folder_name = update.linkedFolderName;
  if (update.linkedAt !== undefined) patch.linked_at = update.linkedAt;

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as ProfileRow);
}
