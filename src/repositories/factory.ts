import type { Repositories } from './types';
import type { StorageMode } from '../types';
import { createLocalRepositories } from './local';

export function createRepositories(mode: StorageMode): Repositories {
  if (mode === 'local') {
    return createLocalRepositories();
  }
  // Cloud mode - for now, fall back to local until Supabase is configured
  // This allows the app to work without Supabase credentials
  console.warn('Cloud mode not yet configured, falling back to local storage');
  return createLocalRepositories();
}

export function getStorageMode(): StorageMode | null {
  return localStorage.getItem('edamame_storage_mode') as StorageMode | null;
}

export function setStorageMode(mode: StorageMode): void {
  localStorage.setItem('edamame_storage_mode', mode);
}
