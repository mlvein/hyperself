// Legacy packs: versioned JSON snapshots of shareable entries.
// (.zip packaging is a later step; the manifest shape is already final.)
import { EMBEDDING_MODEL_ID } from './embeddings';
import type { Entry, PackEntryPayload, PackFile, PackManifest } from './types';

export class PackError extends Error {}

export const PACK_EMBEDDING_MODEL = EMBEDDING_MODEL_ID;

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Entry types that count as the user's expertise on their own, plus
 * any entry evidenced by a linked skill. */
export const EXPERTISE_TYPES: readonly string[] = ['finding', 'method', 'research', 'skill'];

export function isExpertiseEntry(entry: Entry): boolean {
  return EXPERTISE_TYPES.includes(entry.type) || (entry.skill_ids?.length ?? 0) > 0;
}

export interface PackCuration {
  expertiseOnly?: boolean;
}

/** Shareable-only first (personal never enters a pack), then curation. */
export function curatedPackEntries(entries: Entry[], curation: PackCuration = {}): Entry[] {
  const shareable = entries.filter((e) => e.deleted_at === null && e.tag === 'shareable');
  return curation.expertiseOnly ? shareable.filter(isExpertiseEntry) : shareable;
}

export async function exportPackText(
  entries: Entry[],
  authorLabel: string,
  version: string,
  curation: PackCuration = {},
): Promise<{ filename: string; json: string }> {
  const label = authorLabel.trim() || 'anonymous';
  const shareable = curatedPackEntries(entries, curation);
  if (shareable.length === 0) {
    throw new PackError(
      curation.expertiseOnly
        ? 'Nothing to export: no shareable entries match this pack’s expertise curation. Mark findings or methods shareable, or turn off expertise-only.'
        : 'Nothing to export: no entries are tagged shareable.',
    );
  }
  const payloads: PackEntryPayload[] = shareable.map((e) => ({
    id: e.id,
    type: e.type,
    title: e.title,
    body: e.body,
    created_at: e.created_at,
    updated_at: e.updated_at,
  }));
  const manifest: PackManifest = {
    pack_id: crypto.randomUUID(),
    version: version.trim() || '0.1.0',
    author_label: label,
    created_at: new Date().toISOString(),
    embedding_model: PACK_EMBEDDING_MODEL,
    entries: [],
    entry_count: payloads.length,
  };
  for (const p of payloads) {
    manifest.entries.push({
      entry_id: p.id,
      type: p.type,
      title: p.title,
      sha256: await sha256Hex(p.body),
    });
  }
  const file: PackFile = { manifest, entries: payloads };
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    filename: `hyperself-pack-${slug}-${manifest.version}.json`,
    json: JSON.stringify(file, null, 2),
  };
}

export async function importPackText(json: string): Promise<PackFile> {
  let file: PackFile;
  try {
    file = JSON.parse(json) as PackFile;
  } catch {
    throw new PackError('Not a valid pack file: unparseable JSON.');
  }
  if (!file.manifest || !Array.isArray(file.entries)) {
    throw new PackError('Not a valid pack file: missing manifest or entries.');
  }
  if (file.manifest.entry_count !== file.entries.length) {
    throw new PackError('Pack failed verification: entry count mismatch.');
  }
  const byId = new Map(file.entries.map((e) => [e.id, e]));
  for (const summary of file.manifest.entries) {
    const entry = byId.get(summary.entry_id);
    if (!entry) throw new PackError(`Pack failed verification: missing entry ${summary.entry_id}.`);
    // Importer rejects anything claiming to be personal — packs must be shareable-only.
    if ((entry as unknown as { tag?: string }).tag === 'personal') {
      throw new PackError('Pack rejected: contains an entry claiming to be personal.');
    }
    const digest = await sha256Hex(entry.body);
    if (digest !== summary.sha256) {
      throw new PackError(`Pack failed verification: hash mismatch on "${entry.title}".`);
    }
  }
  return file;
}
