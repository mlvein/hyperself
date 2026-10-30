// Provenance: ownership classification + profile-mismatch warning.
const assert = require('node:assert/strict');

const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { ingestDoc } = require('../.test-compiled/ingest.js');
const store = require('../.test-compiled/store.js');
const { computeArchetypes } = require('../.test-compiled/archetypes.js');
const { buildEssence } = require('../.test-compiled/analysis.js');
const { scanEntry } = require('../.test-compiled/security.js');

store.clearAll();
// Six reader-heavy pieces of SOMEONE ELSE's material, declared Reference.
for (let i = 0; i < 6; i += 1) {
  ingestDoc(`ref-${i}.md`, `# Reference ${i}\n\nFinished reading this novel; the last chapter re-read twice.`, {
    ownership: 'reference',
  });
}
assert.deepEqual(
  computeArchetypes(store.listEntries()).map((a) => a.label),
  [],
  'reference material never creates archetypes',
);
const essence = buildEssence(store.listEntries(), []);
assert.ok(!/novel|reading/i.test(essence.aspirations.join(' ')), 'reference stays out of essence');

// Declared ownership persists on the stored entry.
ingestDoc('mine.md', '# Mine\n\nMy own notes about my reading.', { ownership: 'shared' });
assert.equal(store.listEntries().find((e) => e.source_label === 'mine.md').ownership, 'shared');

// Profile-mismatch: identifiers present, owner never mentioned -> warn, never block.
const base = store.listEntries().find((e) => e.source_label === 'mine.md');
const foreign = {
  ...base,
  title: 'Lab results',
  body: 'Patient: Daniel Cole. Contact daniel.cole@example.com, account 88392017.',
  ownership: 'mine',
};
assert.ok(
  scanEntry(foreign, 'Maya Reyes').some((f) => f.level === 'warn' && /someone else/.test(f.message)),
  'foreign identifiers warn supportively',
);
const own = { ...foreign, body: 'Patient: Maya Reyes. Contact maya@example.com.' };
assert.ok(
  !scanEntry(own, 'Maya Reyes').some((f) => /someone else/.test(f.message)),
  'own documents stay silent',
);
const declared = { ...foreign, ownership: 'reference' };
assert.ok(
  !scanEntry(declared, 'Maya Reyes').some((f) => /someone else/.test(f.message)),
  'declared reference never triggers the warning',
);

console.log('ownership OK: classification persists, reference excluded, mismatch warns only');
