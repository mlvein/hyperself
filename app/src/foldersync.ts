// Folder sync diff: given the stored manifest (path -> content hash) and
// the files currently in the folder, decide what to import, replace, and
// tombstone. Pure — the UI/store layers do the actual file reading.
export interface FolderFile {
  path: string;
  hash: string;
}

export interface FolderDiff {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

export function diffFolder(
  manifest: Record<string, string>,
  current: FolderFile[],
): FolderDiff {
  const currentMap = new Map(current.map((f) => [f.path, f.hash]));
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const [path, hash] of currentMap) {
    if (!(path in manifest)) added.push(path);
    else if (manifest[path] !== hash) changed.push(path);
    else unchanged += 1;
  }
  const removed = Object.keys(manifest).filter((path) => !currentMap.has(path));
  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
    unchanged,
  };
}

export function nextManifest(current: FolderFile[]): Record<string, string> {
  return Object.fromEntries(current.map((f) => [f.path, f.hash]));
}

export function isSyncablePath(path: string): boolean {
  return /\.(md|markdown|txt|csv|html?|pdf|docx|rtf|json|ics|vcf)$/i.test(path) && !path.split('/').some((part) => part.startsWith('.'));
}
