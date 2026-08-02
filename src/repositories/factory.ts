import type { Repositories } from './types';
import type { StorageMode } from '../types';
import { createFilesystemRepositories } from './filesystem';
import { createCloudRepositories } from './cloud';

export function createRepositories(mode: StorageMode, folderHandle: FileSystemDirectoryHandle | null, userId: string): Repositories {
  if (mode === 'local') {
    if (!folderHandle) throw new Error('Local mode requires a linked folder before repositories can be created.');
    return createFilesystemRepositories(folderHandle);
  }
  return createCloudRepositories(userId);
}
