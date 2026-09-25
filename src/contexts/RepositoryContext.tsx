import React, { createContext, useContext, useMemo } from 'react';
import type { Repositories } from '../repositories/types';
import { createRepositories } from '../repositories/factory';
import type { StorageMode } from '../types';
import { useLocalFolder } from './LocalFolderContext';
import { useAuth } from './AuthContext';

interface RepositoryContextValue {
  repositories: Repositories;
  storageMode: StorageMode;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

/**
 * Only ever rendered once LocalFolderContext reports status 'ready' (local mode)
 * or a firm is known (cloud mode) — see AppRoutes/CloudAppGate in App.tsx.
 */
export function RepositoryProvider({ children, storageMode, firmId }: { children: React.ReactNode; storageMode: StorageMode; firmId?: string | null }) {
  const { rootHandle } = useLocalFolder();
  // Safe: RepositoryProvider is only ever rendered inside ProtectedRoute, which guarantees a session.
  const { user } = useAuth();
  const userId = user!.id;
  const value = useMemo(() => ({
    repositories: createRepositories(storageMode, rootHandle, userId, firmId),
    storageMode,
  }), [storageMode, rootHandle, userId, firmId]);

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepositories must be used within RepositoryProvider');
  return ctx.repositories;
}

export function useStorageMode(): StorageMode {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useStorageMode must be used within RepositoryProvider');
  return ctx.storageMode;
}
