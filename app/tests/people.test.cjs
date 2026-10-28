// Focused test: people tagging + network rollups. createEntry stores people
// normalized, add/remove round-trips, listPeople groups across entries with
// count-descending order. Run: npm test.
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

store.clearAll();
const a = store.createEntry({
  title: 'Coffee',
  type: 'journal',
  body: 'met Priya',
  people: ['Priya Nair', ' Priya Nair ', ''],
});
assert.deepEqual(store.getEntry(a.id).people, ['Priya Nair'], 'names normalized + deduped');

const b = store.createEntry({ title: 'Swap', type: 'method', body: 'format', people: ['Ana Reyes'] });
store.addPersonToEntry(b.id, 'Priya Nair');
assert.deepEqual(store.getEntry(b.id).people.sort(), ['Ana Reyes', 'Priya Nair']);

const rollup = store.listPeople();
assert.equal(rollup.length, 2);
assert.equal(rollup[0].name, 'Priya Nair', 'ordered by entry count desc');
assert.deepEqual(rollup[0].entryIds.sort(), [a.id, b.id].sort());

store.removePersonFromEntry(b.id, 'Priya Nair');
assert.deepEqual(store.getEntry(b.id).people, ['Ana Reyes']);
assert.equal(
  store.listPeople().find((p) => p.name === 'Priya Nair').entryIds.length,
  1,
  'rollup shrinks after untag',
);

store.clearAll();
console.log('people OK: normalize, add/remove, network rollup');
