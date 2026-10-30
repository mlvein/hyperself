// Focused test: Paths insights. Stale entries alert, secrets flag high,
// sharing draws an exposure review, fresh data confirms currency, and pin /
// acknowledge state round-trips with stable ids. Run: npm test.
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

const {
  acknowledge,
  buildInsights,
  loadPathsState,
  togglePin,
  unacknowledge,
} = require('../.test-compiled/insights.js');

const freshStamp = new Date().toISOString();
let n = 0;
const mk = (over) => ({
  id: `e${(n += 1)}`,
  type: 'finding',
  title: `t${n}`,
  body: 'a clean note',
  tag: 'personal',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  source: 'upload',
  embedding_status: 'pending',
  created_at: freshStamp,
  updated_at: freshStamp,
  deleted_at: null,
  ...over,
});

assert.deepEqual(buildInsights([]), [], 'empty knowledgebase yields no insights');

const stale = mk({ updated_at: '2020-01-01T00:00:00' });
const staleInsights = buildInsights([stale]);
const staleOnly = staleInsights.find((i) => i.id.startsWith('stale:'));
assert.ok(staleOnly, 'stale insight present alongside coverage insight');
assert.equal(staleOnly.severity, 'warn');
assert.deepEqual(staleOnly.kinds, ['goto-import', 'acknowledge', 'expound']);

const risky = mk({ body: 'key AKIAIOSFODNN7EXAMPLE here' });
const sec = buildInsights([risky]).find((i) => i.id.startsWith('sec:'));
assert.ok(sec, 'secret entry yields a security insight');
assert.equal(sec.severity, 'high');

const shared = mk({ tag: 'shareable' });
const exposure = buildInsights([shared]).find((i) => i.id === 'exposure');
assert.ok(exposure, 'shared entries yield an exposure review');
assert.equal(exposure.severity, 'info');

const current = mk({});
const fresh = buildInsights([current]).find((i) => i.id === 'fresh');
assert.ok(fresh, 'recent entries yield a freshness note');

const ids1 = buildInsights([stale, risky, shared]).map((i) => i.id);
const ids2 = buildInsights([stale, risky, shared]).map((i) => i.id);
assert.deepEqual(ids1, ids2, 'insight ids are stable across builds');

assert.equal(togglePin('stale:x'), true);
assert.deepEqual(loadPathsState().pinned, ['stale:x']);
assert.equal(togglePin('stale:x'), false);
assert.deepEqual(loadPathsState().pinned, []);

acknowledge('sec:y');
assert.ok(loadPathsState().acked['sec:y'], 'acknowledge records a timestamp');
unacknowledge('sec:y');
assert.ok(!('sec:y' in loadPathsState().acked), 'unacknowledge clears');

console.log('paths insights OK: stale/security/exposure/fresh, stable ids, pin+ack state');

// --- coverage blind spot lives in Paths, with an attached next step ---
{
  const gap = buildInsights([mk({ type: 'finding' })]).find((i) => i.id === 'gap:coverage');
  assert.ok(gap, 'missing types yield a coverage blind-spot insight in Paths');
  assert.equal(gap.severity, 'info');
  assert.ok(/Blind spot/.test(gap.title), 'blind-spot title');
  assert.ok(gap.kinds.includes('goto-import'), 'blind spot routes to Import');
  assert.ok(/Next step/i.test('Next step: ' + (gap.nextStep ?? '')), 'next step attached to the insight');
  assert.ok((gap.nextStep ?? '').length > 10, 'next step is concrete');
  const allTypes = ['journal', 'goal-note', 'skill', 'health', 'finance', 'relationship', 'finding', 'method', 'research', 'document'];
  const full = allTypes.map((t) => mk({ type: t }));
  assert.ok(!buildInsights(full).some((i) => i.id === 'gap:coverage'), 'no blind spot when coverage is complete');
  console.log('paths blind spot OK: coverage gap in Paths with attached next step');
}
