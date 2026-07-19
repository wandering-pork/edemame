import React, { createContext, useContext, useMemo } from 'react';
import type { Repositories } from '../repositories/types';
import { createRepositories } from '../repositories/factory';
import type { StorageMode } from '../types';
import { useAuth } from './AuthContext';

interface RepositoryContextValue {
  repositories: Repositories;
  storageMode: StorageMode;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({ children, storageMode }: { children: React.ReactNode; storageMode: StorageMode }) {
  const { user } = useAuth();
  // Safe: RepositoryProvider is only ever rendered inside ProtectedRoute, which guarantees a session.
  const userId = user!.id;
  const value = useMemo(() => ({
    repositories: createRepositories(storageMode, userId),
    storageMode,
  }), [storageMode, userId]);

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
