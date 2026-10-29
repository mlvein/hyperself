// Ingestion: files and pasted text become entries.
// All parsing and chunking runs locally. Uploads always arrive personal;
// the user promotes to shareable explicitly, one entry at a time.
import { StoreError, createEntry } from './store';
import type { EntryType } from './types';

export interface Chunk {
  title: string;
  body: string;
}

const TARGET_CHUNK = 1500;

export function titleFromFilename(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base.slice(0, 140) || 'Untitled import';
}

export function extractTitle(text: string, fallback: string): string {
  const match = text.match(/^#\s+(.+)$/m);
  return (match?.[1] ?? fallback).trim().slice(0, 140) || 'Untitled import';
}

/** Split on blank lines, pack blocks to ~TARGET_CHUNK chars, keep heading context. */
export function chunkText(title: string, text: string): Chunk[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: Chunk[] = [];
  let current = '';
  let heading = '';
  const flush = (): void => {
    if (current) chunks.push({ title, body: current.slice(0, 20000) });
    current = '';
  };
  for (const block of blocks) {
    const h = block.match(/^#{1,3}\s+(.+)$/);
    if (h?.[1]) heading = h[1].trim().slice(0, 140);
    const withContext = !block.startsWith('#') ? `Context: ${heading}\n\n${block}` : block;
    let piece = heading && !current ? withContext : block;
    if (current && current.length + piece.length + 2 > TARGET_CHUNK) {
      flush();
      piece = heading ? withContext : block;
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  flush();
  if (chunks.length <= 1) return chunks;
  return chunks.map((c, i) => ({
    title: `${c.title} (part ${i + 1} of ${chunks.length})`.slice(0, 140),
    body: c.body,
  }));
}

export function ingestDoc(
  name: string,
  text: string,
  opts?: { type?: EntryType; goalIds?: string[]; people?: string[]; at?: string },
): { created: number; title: string } {
  if (!text.trim()) throw new StoreError(`"${name}" has no readable content.`);
  const title = extractTitle(text, titleFromFilename(name));
  const chunks = chunkText(title, text);
  if (chunks.length === 0) throw new StoreError(`"${name}" has no readable content.`);
  for (const chunk of chunks) {
    createEntry({
      title: chunk.title,
      type: opts?.type ?? 'research',
      body: chunk.body,
      tag: 'personal',
      goal_ids: opts?.goalIds ?? [],
      people: opts?.people ?? [],
      source: 'upload',
      source_label: name,
      at: opts?.at,
    });
  }
  return { created: chunks.length, title };
}
