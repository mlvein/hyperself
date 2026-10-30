// Folder sync: dedupe on re-import, replace on change, diff + tombstones.
const assert = require('node:assert/strict');

const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { ingestDoc, hashContent } = require('../.test-compiled/ingest.js');
const store = require('../.test-compiled/store.js');
const { diffFolder, nextManifest, isSyncablePath } = require('../.test-compiled/foldersync.js');

store.clearAll();
const first = ingestDoc('notes.md', '# Notes\n\nOriginal body text here.');
assert.equal(first.created >= 1, true);
const again = ingestDoc('notes.md', '# Notes\n\nOriginal body text here.');
assert.equal(again.skipped, true, 'identical re-import is skipped');
assert.equal(again.created, 0);
const countAfterDupe = store.listEntries().filter((e) => e.source_label === 'notes.md').length;

const changed = ingestDoc('notes.md', '# Notes\n\nRevised body text, totally different.');
assert.ok(changed.created >= 1, 'changed file re-ingests');
const afterChange = store.listEntries().filter((e) => e.source_label === 'notes.md');
assert.equal(afterChange.length, countAfterDupe, 'changed file replaces, never duplicates');
assert.ok(afterChange[0].body.includes('Revised'), 'new content wins');

const manifest = { 'a.md': hashContent('one'), 'b.md': hashContent('two'), 'gone.md': hashContent('x') };
const current = [
  { path: 'a.md', hash: hashContent('one') },
  { path: 'b.md', hash: hashContent('two revised') },
  { path: 'c.md', hash: hashContent('three') },
];
const diff = diffFolder(manifest, current);
assert.deepEqual(diff.added, ['c.md']);
assert.deepEqual(diff.changed, ['b.md']);
assert.deepEqual(diff.removed, ['gone.md']);
assert.equal(diff.unchanged, 1);
assert.deepEqual(nextManifest(current), { 'a.md': hashContent('one'), 'b.md': hashContent('two revised'), 'c.md': hashContent('three') });
assert.ok(isSyncablePath('trips/2024.md') && isSyncablePath('statements/jan.csv'), 'syncable docs + statements');
assert.ok(!isSyncablePath('.hidden/secret.md') && !isSyncablePath('photo.jpg'), 'hidden + non-docs excluded');

// Tombstone: removing from the folder deletes its entries.
store.setFolderManifest({ 'notes.md': hashContent('# Notes\n\nRevised body text, totally different.') });
assert.equal(store.deleteEntriesByLabel('notes.md'), afterChange.length, 'tombstone removes entries');
assert.equal(store.listEntries().filter((e) => e.source_label === 'notes.md').length, 0);

console.log('foldersync OK: dedupe skip, change replaces, diff + tombstone');
