// Focused test: network graph data (user center, weighted edges, context).
const assert = require('node:assert/strict');
const { buildNetwork, personContext, CENTER_ID } = require('../.test-compiled/network.js');

let n = 0;
const mk = (over) => ({
  id: `n${(n += 1)}`,
  type: 'research',
  title: `t${n}`,
  body: 'note',
  tag: 'personal',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  people: [],
  source: 'upload',
  embedding_status: 'pending',
  created_at: '2026-10-01T09:00:00',
  updated_at: '2026-10-01T09:00:00',
  deleted_at: null,
  ...over,
});

const entries = [
  mk({ people: ['Priya Nair', 'Ana Reyes'], updated_at: '2026-10-02T09:00:00' }),
  mk({ people: ['Priya Nair'], updated_at: '2026-10-05T09:00:00' }),
  mk({ people: [] }),
];

const g = buildNetwork(entries, 'You');
assert.equal(g.nodes[0].id, CENTER_ID, 'user is the center node');
assert.equal(g.nodes.length, 3, 'center + two people');
assert.equal(g.nodes.find((x) => x.label === 'Priya Nair').count, 2, 'mention counts');
const spoke = g.links.find((l) => l.target === 'Priya Nair');
assert.equal(spoke.weight, 2, 'spoke weighted by mentions');
const cross = g.links.find((l) => l.source === 'Ana Reyes' && l.target === 'Priya Nair');
assert.equal(cross.weight, 1, 'co-mention edge weighted');

const ctx = personContext(entries, 'Priya Nair');
assert.equal(ctx.timeline.length, 2, 'timeline covers every shared moment');
assert.equal(ctx.timeline[0].at, '2026-10-01', 'timeline is chronological (created_at)');
assert.ok(ctx.timeline.some((m) => m.key && m.people.includes('Ana Reyes')), 'shared moments are key');
assert.equal(ctx.entryCount, 2);
assert.deepEqual(ctx.connectedTo, [{ name: 'Ana Reyes', shared: 1 }], 'shared connections');
assert.equal(ctx.firstSeen, '2026-10-02');
assert.equal(ctx.lastSeen, '2026-10-05');

assert.deepEqual(buildNetwork([], 'You').nodes.length, 1, 'empty KB is just the center');

console.log('network OK: center, weighted spokes, co-mentions, person context');
