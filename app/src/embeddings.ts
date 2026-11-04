// Local embeddings from a Meta model. Vectors are computed by the Meta
// Llama model served on this device (the same local server as synthesis)
// and persisted in OPFS keyed by entry id (localStorage fallback/migration
// source); they inherit the entry's tag boundary by never leaving the
// device. When no Meta model server is reachable, embedding fails and
// search degrades to keyword-only — no non-Meta embedding model is used.

import { loadGlimmerConfig } from './engine';

export const EMBEDDING_MODEL_ID = 'llama3.2:3b';
export const EMBEDDING_DIMS = 3072;

const VECTOR_KEY = 'hyperself.vectors.v2';

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

let vectorsCache: Record<string, number[]> | null = null;
let vectorsOpfs = false;
let vectorsDirty = false;
let vectorsHydrated = false;
let vectorPersist: Promise<void> = Promise.resolve();

function readLocalVectors(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(VECTOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadVectors(): Record<string, number[]> {
  if (!vectorsCache) vectorsCache = readLocalVectors();
  return vectorsCache;
}

/** One-time startup hydration from OPFS (see opfs.ts); localStorage migrates. */
export async function hydrateVectors(): Promise<void> {
  if (vectorsHydrated) return;
  vectorsHydrated = true;
  const { VECTORS_FILE, isOpfsAvailable, opfsRead } = await import('./opfs');
  if (!isOpfsAvailable()) return;
  const raw = await opfsRead(VECTORS_FILE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, number[]>;
      if (parsed && typeof parsed === 'object' && !vectorsDirty) vectorsCache = parsed;
    } catch {
      // Corrupt sidecar: keep whatever local state exists.
    }
  }
  vectorsOpfs = true;
  if (vectorsCache && Object.keys(vectorsCache).length > 0) saveVectors(vectorsCache);
}

function saveVectors(vectors: Record<string, number[]>): void {
  vectorsCache = vectors;
  vectorsDirty = true;
  if (vectorsOpfs) {
    const text = JSON.stringify(vectors);
    vectorPersist = vectorPersist
      .then(async () => {
        const { VECTORS_FILE, opfsWrite } = await import('./opfs');
        if (await opfsWrite(VECTORS_FILE, text)) {
          try { localStorage.removeItem(VECTOR_KEY); } catch { /* ignore */ }
        }
      })
      .catch(() => undefined);
    return;
  }
  try {
    localStorage.setItem(VECTOR_KEY, JSON.stringify(vectors));
  } catch {
    // Storage full/unavailable: embeddings degrade to keyword search.
  }
}

export function getVector(entryId: string): number[] | undefined {
  return loadVectors()[entryId];
}

export function putVector(entryId: string, vector: number[]): void {
  const vectors = loadVectors();
  vectors[entryId] = vector;
  saveVectors(vectors);
}

export function dropVector(entryId: string): void {
  const vectors = loadVectors();
  if (entryId in vectors) {
    delete vectors[entryId];
    saveVectors(vectors);
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

export async function embedText(text: string, fetchFn: FetchFn = defaultFetch): Promise<number[]> {
  const cfg = loadGlimmerConfig();
  const res = await fetchFn(`${cfg.endpoint}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL_ID, input: text.slice(0, 4000) }),
  });
  if (!res.ok) throw new Error(`Meta embedding model returned HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
    embedding?: number[];
    embeddings?: number[][];
  };
  const vector = data.data?.[0]?.embedding ?? data.embedding ?? data.embeddings?.[0] ?? [];
  if (vector.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding size: ${vector.length}`);
  }
  return vector;
}

export async function embedEntry(entry: { id: string; title: string; body: string }): Promise<number[]> {
  const vector = await embedText(`${entry.title}\n\n${entry.body}`);
  putVector(entry.id, vector);
  return vector;
}
