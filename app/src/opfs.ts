// OPFS persistence: the app database and vector sidecar live as files in
// the origin-private file system instead of localStorage, whose ~5 MB quota
// real exports (Takeout ZIPs, health archives) overflow. localStorage stays
// as the fallback where OPFS is unavailable (tests, older browsers), and as
// the migration source on first hydrate. All reads/writes are text; the
// vault-sealed payload is stored sealed — OPFS changes where bytes live,
// never whether they are encrypted.

export const DB_FILE = 'hyperself-db.txt';
export const VECTORS_FILE = 'hyperself-vectors.txt';

export interface Envelope {
  v: 1;
  sealed: boolean;
  payload: string;
}

export function encodeEnvelope(sealed: boolean, payload: string): string {
  const env: Envelope = { v: 1, sealed, payload };
  return JSON.stringify(env);
}

export function decodeEnvelope(text: string): Envelope | null {
  try {
    const parsed = JSON.parse(text) as Partial<Envelope>;
    if (parsed.v !== 1 || typeof parsed.payload !== 'string') return null;
    return { v: 1, sealed: parsed.sealed === true, payload: parsed.payload };
  } catch {
    return null;
  }
}

interface OpfsRoot {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<{ text(): Promise<string> }>;
    createWritable(): Promise<{
      write(data: string): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
  removeEntry(name: string): Promise<void>;
}

function opfsRoot(): Promise<OpfsRoot> | null {
  try {
    const nav = globalThis.navigator as Navigator & {
      storage?: { getDirectory?: () => Promise<OpfsRoot>; estimate?: () => Promise<{ quota?: number; usage?: number }> };
    };
    if (!nav?.storage?.getDirectory) return null;
    return nav.storage.getDirectory();
  } catch {
    return null;
  }
}

export function isOpfsAvailable(): boolean {
  return opfsRoot() !== null;
}

export async function opfsRead(name: string): Promise<string | null> {
  const rootPromise = opfsRoot();
  if (!rootPromise) return null;
  try {
    const root = await rootPromise;
    const handle = await root.getFileHandle(name);
    const file = await handle.getFile();
    const text = await file.text();
    return text || null;
  } catch {
    return null;
  }
}

export async function opfsWrite(name: string, text: string): Promise<boolean> {
  const rootPromise = opfsRoot();
  if (!rootPromise) return false;
  try {
    const root = await rootPromise;
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

export async function opfsRemove(name: string): Promise<void> {
  const rootPromise = opfsRoot();
  if (!rootPromise) return;
  try {
    const root = await rootPromise;
    await root.removeEntry(name);
  } catch {
    // Already gone.
  }
}

export async function storageEstimate(): Promise<{ quota: number; usage: number } | null> {
  try {
    const nav = globalThis.navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
    };
    if (!nav?.storage?.estimate) return null;
    const est = await nav.storage.estimate();
    return { quota: est.quota ?? 0, usage: est.usage ?? 0 };
  } catch {
    return null;
  }
}
