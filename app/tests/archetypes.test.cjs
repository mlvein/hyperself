// Focused test: archetypes distinguish collecting from finishing.
// Bookworm = reads/finishes a lot; Book Hoarder = collects/TBR, rarely reads.
const assert = require('node:assert/strict');
const { computeArchetypes } = require('../.test-compiled/archetypes.js');

let n = 0;
const mk = (over) => ({
  id: `ar${(n += 1)}`,
  type: 'journal',
  title: `t${n}`,
  body: 'note',
  tag: 'personal',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  people: [],
  source: 'upload',
  embedding_status: 'pending',
  created_at: '2020-01-01T09:00:00',
  updated_at: '2020-01-01T09:00:00',
  deleted_at: null,
  ...over,
});
const reader = Array.from({ length: 6 }, () =>
  mk({ type: 'research', tag: 'shareable', body: 'Finished reading this novel; the last chapter re-read twice.' }),
);
const hoarder = Array.from({ length: 6 }, () =>
  mk({ body: 'Bought three more for the TBR to-read pile; shelves groaning, still unread.' }),
);

const readerLabels = computeArchetypes(reader).map((a) => a.label);
assert.ok(readerLabels.includes('Bookworm'), 'finisher is a Bookworm');
assert.ok(!readerLabels.includes('Book Hoarder'), 'finisher is not a hoarder');

const hoarderLabels = computeArchetypes(hoarder).map((a) => a.label);
assert.ok(hoarderLabels.includes('Book Hoarder'), 'collector is a Book Hoarder');
assert.ok(!hoarderLabels.includes('Bookworm'), 'collector is not a Bookworm');

assert.deepEqual(computeArchetypes([]), [], 'no data, no archetypes');
const top = computeArchetypes([...reader, ...hoarder]);
assert.ok(top.length <= 4 && top[0].score >= top[top.length - 1].score, 'ranked, capped at four');

assert.ok(top.every((a) => a.meaning.length > 20 && a.watchFor.length > 10), 'archetypes carry expounded meaning + watch-for');
assert.ok(/metabolise|process life/i.test(computeArchetypes(reader)[0].meaning + computeArchetypes(reader).map((a) => a.meaning).join(' ')), 'bookworm expounded');

console.log('archetypes OK: bookworm vs hoarder, conflicts resolve, ranked cap');
