import React, { createContext, useContext, useMemo } from 'react';
import type { Repositories } from '../repositories/types';
import { createRepositories } from '../repositories/factory';
import type { StorageMode } from '../types';

interface RepositoryContextValue {
  repositories: Repositories;
  storageMode: StorageMode;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({ children, storageMode }: { children: React.ReactNode; storageMode: StorageMode }) {
  const value = useMemo(() => ({
    repositories: createRepositories(storageMode),
    storageMode,
  }), [storageMode]);

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
