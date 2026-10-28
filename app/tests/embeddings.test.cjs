// Focused test: local embeddings plumbing. Cosine math, vector persistence,
// embedding_status transitions, and hybrid ranking (semantic boost can
// outrank a keyword-only match). The model itself needs a browser, so fake
// vectors stand in for it. Run: npm test.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => {
    mem.set(String(k), String(v));
  },
  removeItem: (k) => {
    mem.delete(String(k));
  },
};

const store = require('../.test-compiled/store.js');
const emb = require('../.test-compiled/embeddings.js');
const { runKnowledgeSearch } = require('../.test-compiled/search.js');

// --- cosine ---
assert.equal(emb.cosineSimilarity([1, 0], [1, 0]), 1, 'identical vectors score 1');
assert.equal(emb.cosineSimilarity([1, 0], [0, 1]), 0, 'orthogonal vectors score 0');
assert.equal(emb.cosineSimilarity([], []), 0, 'empty vectors score 0');

// --- status transitions + vector lifecycle ---
store.clearAll();
const entry = store.createEntry({
  title: 'Figma auto-layout, finally clicked',
  type: 'research',
  body: 'Frames hug or fill; constraints handle the rest.',
  people: ['Ana Reyes'],
});
assert.equal(store.getEntry(entry.id).embedding_status, 'pending', 'born pending');
emb.putVector(entry.id, [0.9, 0.1]);
assert.deepEqual(emb.getVector(entry.id), [0.9, 0.1], 'vector persists by entry id');
store.setEmbeddingStatus(entry.id, 'indexed');
assert.equal(store.getEntry(entry.id).embedding_status, 'indexed', 'pending → indexed');
store.setEmbeddingStatus(entry.id, 'stale');
assert.equal(store.getEntry(entry.id).embedding_status, 'stale', 'indexed → stale');
store.deleteEntry(entry.id);
assert.equal(emb.getVector(entry.id), undefined, 'delete drops the vector');

// --- hybrid ranking: semantic match beats keyword-only ---
const TODAY = new Date(2026, 9, 27);
let n = 0;
const mk = (over) => ({
  id: `s${(n += 1)}`,
  type: 'research',
  title: `t${n}`,
  body: 'note',
  tag: 'personal',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  people: [],
  source: 'upload',
  embedding_status: 'indexed',
  created_at: '2026-10-20T09:00:00',
  updated_at: '2026-10-20T09:00:00',
  deleted_at: null,
  ...over,
});
const keywordHit = mk({ title: 'layout grid basics', body: 'the layout of a page' });
const semanticHit = mk({ title: 'frames that hug', body: 'nested frames follow the layout' });
const vectors = {
  [keywordHit.id]: [1, 0, 0],
  [semanticHit.id]: [0.95, 0.05, 0],
};
const plain = runKnowledgeSearch('layout', [keywordHit, semanticHit], TODAY);
assert.equal(plain.entries[0].id, keywordHit.id, 'keyword-only ranks title hit first');
const hybrid = runKnowledgeSearch('layout', [keywordHit, semanticHit], TODAY, {
  vectors,
  queryVector: [1, 0, 0],
});
assert.equal(hybrid.entries[0].id, keywordHit.id, 'aligned vector keeps the lead');
const flipped = runKnowledgeSearch('layout', [keywordHit, semanticHit], TODAY, {
  vectors: { [keywordHit.id]: [0, 1, 0], [semanticHit.id]: [0.95, 0.05, 0] },
  queryVector: [1, 0, 0],
});
assert.equal(flipped.entries[0].id, semanticHit.id, 'semantic boost outranks keyword-only');

store.clearAll();
console.log('embeddings OK: cosine, persistence, status flow, hybrid ranking');
