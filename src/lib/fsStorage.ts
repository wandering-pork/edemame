// Thin wrapper around the File System Access API for reading/writing JSON
// records and raw file blobs inside a user-linked folder. Mirrors the shape
// of opfsStorage.ts, but every function takes the root handle explicitly
// instead of reaching for navigator.storage.getDirectory() — the root here
// is a real folder on disk the user picked, not a browser-private sandbox.

function splitPath(path: string): { dirSegments: string[]; fileName: string } {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop()!;
  return { dirSegments: parts, fileName };
}

async function getDirectory(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  for (const segment of segments) {
    try {
      dir = await dir.getDirectoryHandle(segment, { create });
    } catch {
      return null;
    }
  }
  return dir;
}

export async function ensureDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const segments = path.split('/').filter(Boolean);
  const dir = await getDirectory(root, segments, true);
  return dir!;
}

export async function writeJson(root: FileSystemDirectoryHandle, path: string, data: unknown): Promise<void> {
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectory(root, dirSegments, true);
  const fileHandle = await dir!.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

export async function readJson<T>(root: FileSystemDirectoryHandle, path: string): Promise<T | null> {
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectory(root, dirSegments, false);
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

export async function writeBlob(root: FileSystemDirectoryHandle, path: string, data: Blob): Promise<void> {
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectory(root, dirSegments, true);
  const fileHandle = await dir!.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readBlob(root: FileSystemDirectoryHandle, path: string): Promise<Blob | null> {
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectory(root, dirSegments, false);
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

export async function deleteEntry(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectory(root, dirSegments, false);
  if (!dir) return;
  try {
    await dir.removeEntry(fileName);
  } catch {
    // Already gone — nothing to delete.
  }
}

/** File names (not subdirectories) directly under dirPath, ending in .json unless allExtensions is set. */
export async function listFiles(
  root: FileSystemDirectoryHandle,
  dirPath: string,
  opts: { jsonOnly?: boolean } = { jsonOnly: true },
): Promise<string[]> {
  const segments = dirPath.split('/').filter(Boolean);
  const dir = await getDirectory(root, segments, false);
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file' && (!opts.jsonOnly || name.endsWith('.json'))) {
      names.push(name);
    }
  }
  return names;
}

/** Subdirectory names directly under dirPath (e.g. case ids under case-notes/). */
export async function listDirNames(root: FileSystemDirectoryHandle, dirPath: string): Promise<string[]> {
  const segments = dirPath.split('/').filter(Boolean);
  const dir = await getDirectory(root, segments, false);
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'directory') names.push(name);
  }
  return names;
}

export async function isEmpty(root: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of (root as any).entries()) {
    return false;
  }
  return true;
}

/** Recursively copies every file from source into dest, preserving structure. */
export async function copyTree(source: FileSystemDirectoryHandle, dest: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name, handle] of (source as any).entries()) {
    if (handle.kind === 'directory') {
      const childDest = await dest.getDirectoryHandle(name, { create: true });
      await copyTree(handle as FileSystemDirectoryHandle, childDest);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      const destFile = await dest.getFileHandle(name, { create: true });
      const writable = await destFile.createWritable();
      await writable.write(file);
      await writable.close();
    }
  }
}
