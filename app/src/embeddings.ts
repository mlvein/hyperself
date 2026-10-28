// Local embeddings (Transformers.js). Vectors are computed on-device and
// persisted in localStorage keyed by entry id; they inherit the entry's tag
// boundary by never leaving the browser. The model download is the only
// network touch, and it carries no user data.

export const EMBEDDING_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMS = 384;

const VECTOR_KEY = 'hyperself.vectors.v1';

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

export function loadVectors(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(VECTOR_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveVectors(vectors: Record<string, number[]>): void {
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

type Extractor = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface TransformersModule {
  pipeline(
    task: string,
    model: string,
    opts?: { device?: string; dtype?: string },
  ): Promise<Extractor>;
}

let extractorPromise: Promise<Extractor> | null = null;

async function loadExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule;
      try {
        return await mod.pipeline('feature-extraction', EMBEDDING_MODEL_ID, {
          device: 'webgpu',
        });
      } catch {
        return mod.pipeline('feature-extraction', EMBEDDING_MODEL_ID, { dtype: 'q8' });
      }
    })();
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await loadExtractor();
  const output = await extractor(text.slice(0, 4000), { pooling: 'mean', normalize: true });
  const rows = output.tolist();
  const vector = rows[0] ?? [];
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
