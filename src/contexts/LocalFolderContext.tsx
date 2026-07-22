import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useProfile } from './ProfileContext';
import { saveHandle, loadHandle } from '@/lib/folderHandleStore';
import { isEmpty, copyTree } from '@/lib/fsStorage';

export type FolderStatus = 'checking' | 'unlinked' | 'needs-permission' | 'ready' | 'not-applicable';

interface LocalFolderContextValue {
  status: FolderStatus;
  rootHandle: FileSystemDirectoryHandle | null;
  supported: boolean;
  /** First-time link, or re-linking after 'unlinked'. */
  linkFolder: () => Promise<void>;
  /** Re-grant permission on an already-saved handle (requires a user gesture). */
  reconnect: () => Promise<void>;
  /** Settings-driven redirect to a different folder. */
  changeFolder: () => Promise<{ outcome: 'copied' | 'adopted' | 'cancelled'; folderName?: string }>;
}

const LocalFolderContext = createContext<LocalFolderContextValue | null>(null);

const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export function LocalFolderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user!.id;
  const { profile, updateProfile } = useProfile();
  const [status, setStatus] = useState<FolderStatus>('checking');
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.storageMode !== 'local') {
      setStatus('not-applicable');
      return;
    }
    let cancelled = false;
    (async () => {
      const saved = await loadHandle(userId);
      if (cancelled) return;
      if (!saved) {
        setStatus('unlinked');
        return;
      }
      const perm = await (saved as any).queryPermission({ mode: 'readwrite' });
      if (cancelled) return;
      if (perm === 'granted') {
        setRootHandle(saved);
        setStatus('ready');
      } else {
        setRootHandle(saved);
        setStatus('needs-permission');
      }
    })();
    return () => { cancelled = true; };
  }, [profile, userId]);

  const linkFolder = useCallback(async () => {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    await saveHandle(userId, handle);
    setRootHandle(handle);
    setStatus('ready');
    await updateProfile({ linkedFolderName: handle.name, linkedAt: new Date().toISOString() });
  }, [userId, updateProfile]);

  const reconnect = useCallback(async () => {
    if (!rootHandle) return;
    const perm = await (rootHandle as any).requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') setStatus('ready');
  }, [rootHandle]);

  const changeFolder = useCallback(async (): Promise<{ outcome: 'copied' | 'adopted' | 'cancelled'; folderName?: string }> => {
    let target: FileSystemDirectoryHandle;
    try {
      target = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    } catch {
      return { outcome: 'cancelled' };
    }

    const targetIsEmpty = await isEmpty(target);
    if (targetIsEmpty && rootHandle) {
      await copyTree(rootHandle, target);
    }

    await saveHandle(userId, target);
    setRootHandle(target);
    setStatus('ready');
    await updateProfile({ linkedFolderName: target.name, linkedAt: new Date().toISOString() });

    return { outcome: targetIsEmpty ? 'copied' : 'adopted', folderName: target.name };
  }, [rootHandle, userId, updateProfile]);

  return (
    <LocalFolderContext.Provider value={{ status, rootHandle, supported, linkFolder, reconnect, changeFolder }}>
      {children}
    </LocalFolderContext.Provider>
  );
}

export function useLocalFolder(): LocalFolderContextValue {
  const ctx = useContext(LocalFolderContext);
  if (!ctx) throw new Error('useLocalFolder must be used within LocalFolderProvider');
  return ctx;
}
