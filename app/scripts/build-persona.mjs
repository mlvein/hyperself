// Validates every personas/*.source.json against the tag model and emits
// public/personas/<id>.json, loaded by the app through the real store path
// (create personal, then promote to shareable). Run: npm run personas.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NON_SHAREABLE = ['journal', 'health', 'finance', 'relationship', 'document'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'personas');
const outDir = join(root, 'public', 'personas');
mkdirSync(outDir, { recursive: true });

const files = readdirSync(sourceDir).filter((f) => f.endsWith('.source.json')).sort();
if (files.length === 0) throw new Error('no persona sources in personas/');

for (const file of files) {
  const source = JSON.parse(readFileSync(join(sourceDir, file), 'utf8'));
  for (const field of ['id', 'label']) {
    if (typeof source[field] !== 'string' || !source[field].trim()) {
      throw new Error(`${file}: missing ${field}`);
    }
  }
  if (!Array.isArray(source.entries) || source.entries.length === 0) {
    throw new Error(`${file}: no entries`);
  }
  for (const e of source.entries) {
    for (const field of ['at', 'type', 'title', 'body', 'tag']) {
      if (typeof e[field] !== 'string' || !e[field].trim()) {
        throw new Error(`${file}: entry missing ${field}: ${JSON.stringify(e).slice(0, 80)}`);
      }
    }
    if (Number.isNaN(Date.parse(e.at))) throw new Error(`${file}: bad date "${e.title}"`);
    if (e.people !== undefined) {
      if (!Array.isArray(e.people) || e.people.some((p) => typeof p !== 'string' || !p.trim())) {
        throw new Error(`${file}: bad people list "${e.title}"`);
      }
    }
    if (e.via !== undefined && (typeof e.via !== 'string' || !e.via.trim())) {
      throw new Error(`${file}: bad via "${e.title}"`);
    }
    if (e.tag === 'shareable' && NON_SHAREABLE.includes(e.type)) {
      throw new Error(`${file}: violates tag model "${e.title}" (${e.type}) marked shareable`);
    }
  }
  const entries = [...source.entries].sort((a, b) => (a.at < b.at ? -1 : 1));
  writeFileSync(
    join(outDir, `${source.id}.json`),
    JSON.stringify(
      { id: source.id, label: source.label, tagline: source.tagline ?? '', entries },
      null,
      2,
    ) + '\n',
  );
  const shared = entries.filter((e) => e.tag === 'shareable').length;
  const years = `${entries[0].at.slice(0, 4)}–${entries[entries.length - 1].at.slice(0, 4)}`;
  console.log(
    `wrote ${source.id}.json: ${entries.length} entries (${shared} shareable), ${years}, tag model holds`,
  );
}
