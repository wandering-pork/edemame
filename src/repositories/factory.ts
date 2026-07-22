import type { Repositories } from './types';
import type { StorageMode } from '../types';
import { createFilesystemRepositories } from './filesystem';

export function createRepositories(mode: StorageMode, folderHandle: FileSystemDirectoryHandle | null): Repositories {
  if (mode === 'local') {
    if (!folderHandle) throw new Error('Local mode requires a linked folder before repositories can be created.');
    return createFilesystemRepositories(folderHandle);
  }
  throw new Error('Cloud storage is not available yet.');
}
