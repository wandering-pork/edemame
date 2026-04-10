async function getDirectoryForPath(
  root: FileSystemDirectoryHandle,
  segments: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  return dir;
}

function splitPath(path: string): { dirSegments: string[]; fileName: string } {
  const parts = path.split('/').filter(Boolean);
  const fileName = parts.pop()!;
  return { dirSegments: parts, fileName };
}

export async function saveFile(path: string, data: Blob): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const { dirSegments, fileName } = splitPath(path);
  const dir = await getDirectoryForPath(root, dirSegments);
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readFile(path: string): Promise<Blob | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const { dirSegments, fileName } = splitPath(path);
    const dir = await getDirectoryForPath(root, dirSegments);
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file;
  } catch {
    return null;
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const { dirSegments, fileName } = splitPath(path);
    const dir = await getDirectoryForPath(root, dirSegments);
    await dir.removeEntry(fileName);
  } catch {
    // File doesn't exist — nothing to delete
  }
}
