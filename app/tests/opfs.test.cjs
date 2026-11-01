// OPFS storage: envelope round-trip, graceful absence, store fallback.
// Node has no OPFS, so availability must be false and the store must keep
// working on localStorage exactly as before; OPFS behavior itself needs a
// real browser. What is asserted here: the contract the browser path uses.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const { encodeEnvelope, decodeEnvelope, isOpfsAvailable, opfsRead, storageEstimate } = require('../.test-compiled/opfs.js');
const store = require('../.test-compiled/store.js');

assert.equal(isOpfsAvailable(), false, 'no OPFS in Node');
assert.equal(decodeEnvelope(encodeEnvelope(false, '{"a":1}')).payload, '{"a":1}', 'plain envelope round-trips');
assert.equal(decodeEnvelope(encodeEnvelope(true, 'sealed-bytes')).sealed, true, 'sealed flag round-trips');
assert.equal(decodeEnvelope('not json'), null, 'corrupt envelope refuses');
assert.equal(decodeEnvelope('{"v":2,"payload":"x"}'), null, 'unknown version refuses');

(async () => {
  assert.equal(await opfsRead('hyperself-db.txt'), null, 'read without OPFS is null, not a throw');
  assert.equal(await storageEstimate(), null, 'estimate without OPFS is null');
  assert.equal(store.isOpfsBacked(), false, 'store reports fallback mode');
  await store.hydrateStore();
  store.clearAll();
  const e = store.createEntry({ title: 'Offline entry', type: 'finding', body: 'stored without OPFS' });
  assert.equal(store.getEntry(e.id).title, 'Offline entry', 'store works on localStorage fallback');
  assert.ok(mem.get('hyperself.v1').includes('Offline entry'), 'fallback persists to localStorage');
  console.log('opfs OK: envelope, graceful absence, localStorage fallback intact');
})().catch((err) => { console.error(err); process.exit(1); });
