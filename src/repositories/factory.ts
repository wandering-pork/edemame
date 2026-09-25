import type { Repositories } from './types';
import type { StorageMode } from '../types';
import { createFilesystemRepositories } from './filesystem';
import { createCloudRepositories } from './cloud';

/**
 * `firmId` is required for cloud mode (Step 1 · 1F — every cloud table is
 * firm-scoped) and ignored for local mode (firms are cloud-only). Callers in
 * cloud mode must not construct repositories before a firm is known — see
 * `App.tsx`'s CloudAppGate, which only renders `RepositoryProvider` once
 * `useFirm().firm` is non-null.
 */
export function createRepositories(mode: StorageMode, folderHandle: FileSystemDirectoryHandle | null, userId: string, firmId?: string | null): Repositories {
  if (mode === 'local') {
    if (!folderHandle) throw new Error('Local mode requires a linked folder before repositories can be created.');
    return createFilesystemRepositories(folderHandle);
  }
  if (!firmId) throw new Error('Cloud mode requires a firm before repositories can be created.');
  return createCloudRepositories(userId, firmId);
}
