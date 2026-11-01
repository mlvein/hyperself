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
  dismissInsight,
  loadPathsState,
  togglePin,
  unacknowledge,
  undismissInsight,
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
assert.ok(staleOnly, 'stale insight present');
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

dismissInsight('stale:z');
assert.ok(loadPathsState().dismissed['stale:z'], 'dismiss records a timestamp');
undismissInsight('stale:z');
assert.ok(!('stale:z' in loadPathsState().dismissed), 'undismiss clears');
assert.deepEqual(loadPathsState().dismissed, {}, 'dismissed defaults to empty record');

console.log('paths insights OK: stale/security/exposure/fresh, stable ids, pin+ack+dismiss state');

// --- Paths layout: suggestions on Insights, History beside Templates ---
{
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const insightsAt = html.indexOf('id="sub-insights"');
  const templatesAt = html.indexOf('id="sub-templates"');
  const historyAt = html.indexOf('id="sub-history"');
  const suggestedAt = html.indexOf('id="templateList"');
  assert.ok(suggestedAt > insightsAt && suggestedAt < templatesAt, 'suggested paths render inside Insights');
  assert.ok(historyAt > templatesAt, 'History pane sits after Templates');
  assert.ok(html.includes('data-sub="history"'), 'History menu sits beside Templates');
  assert.ok(html.includes('approved or dismissed'), 'History covers approved + dismissed insights');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
  assert.ok(main.includes("data-action=\"dismiss\"") || main.includes("'dismiss'"), 'insights offer a dismiss action');
  console.log('paths layout OK: suggestions on Insights, History beside Templates');
}

// --- no Blind spot card on Paths (removed; History holds reviewed items) ---
{
  const partial = buildInsights([mk({ type: 'finding' })]);
  assert.ok(!partial.some((i) => i.id === 'gap:coverage'), 'no coverage blind-spot insight');
  assert.ok(!partial.some((i) => /Blind spot/.test(i.title)), 'no Blind spot title on Paths');
  const allTypes = ['journal', 'goal-note', 'skill', 'health', 'finance', 'relationship', 'finding', 'method', 'research', 'document'];
  const full = allTypes.map((t) => mk({ type: t }));
  assert.ok(!buildInsights(full).some((i) => i.id === 'gap:coverage'), 'no blind spot with complete coverage either');
  console.log('paths blind spot removed OK: no gap:coverage insight');
}
