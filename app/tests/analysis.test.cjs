// Focused test: knowledgebase analysis. Behavior signals, coverage gaps,
// data-type fits, and growth recommendations (connected providers excluded,
// gap-fillers ranked first). Run: npm test.
const assert = require('node:assert/strict');
const {
  PROVIDER_FITS,
  analyzeKnowledgebase,
} = require('../.test-compiled/analysis.js');
const { PROVIDERS } = require('../.test-compiled/connections.js');

const NOW = Date.parse('2026-10-27T12:00:00');
let n = 0;
const mk = (over) => ({
  id: `a${(n += 1)}`,
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
  created_at: '2026-10-26T09:00:00',
  updated_at: '2026-10-26T09:00:00',
  deleted_at: null,
  ...over,
});

// --- empty knowledgebase ---
const empty = analyzeKnowledgebase([], [], NOW);
assert.equal(empty.total, 0);
assert.equal(empty.gaps.length, 10, 'everything is a blind spot when empty');
assert.ok(/No knowledge yet/.test(empty.behavior[0]));
assert.equal(empty.recommendations.length, 3, 'still recommends where to start');

// --- populated knowledgebase ---
const entries = [
  mk({ type: 'research', people: ['Priya Nair'] }),
  mk({ type: 'research', tag: 'shareable', people: ['Priya Nair', 'Ana Reyes'] }),
  mk({ type: 'journal', updated_at: '2026-01-01T09:00:00', created_at: '2026-01-01T09:00:00' }),
  mk({ type: 'health', updated_at: '2026-10-20T09:00:00', created_at: '2026-10-20T09:00:00' }),
];
const a = analyzeKnowledgebase(entries, ['notion'], NOW);
assert.equal(a.total, 4);
assert.equal(a.shareableCount, 1);
assert.equal(a.peopleCount, 2);
assert.equal(a.topPeople[0].name, 'Priya Nair');
assert.equal(a.staleCount, 1, 'January entry is stale');
assert.ok(a.gaps.includes('finance') && a.gaps.includes('skill'), 'missing types are gaps');
assert.ok(a.behavior.some((b) => /leans research/.test(b)), 'names the dominant type');
assert.ok(a.behavior.some((b) => /Blind spots/.test(b)), 'surfaces blind spots');
assert.ok(!a.recommendations.some((r) => r.providerId === 'notion'), 'connected excluded');

// --- activity sparkline + answerable questions ---
assert.deepEqual(a.weeklyActivity.length, 4, 'four weekly buckets');
assert.equal(a.weeklyActivity[3], 2, 'two entries created this week');
assert.equal(a.weeklyActivity[2], 1, 'one entry created last week');
assert.equal(a.weeklyActivity[0], 0, 'nothing three weeks ago');
assert.ok(a.questions.includes("people I've met this week"), 'date question suggested');
assert.ok(a.questions.some((q) => q.startsWith('who might know about')), 'topic question suggested');
assert.ok(a.questions.includes('Priya Nair'), 'top person suggested as a query');

// --- synthesis cards: one per insight, multi-tagged ---
const { buildSynthesisCards, TAGS_BY_TYPE } = require('../.test-compiled/analysis.js');
assert.deepEqual(buildSynthesisCards([], empty), [], 'no cards when empty');
const cards = buildSynthesisCards(entries, a);
assert.ok(cards.length >= 3, 'several skimmable cards');
assert.ok(cards.every((c) => c.title && c.body && c.tags.length > 0), 'every card tagged');
assert.ok(cards.some((c) => c.tags.length >= 2), 'cards carry multiple tags');
assert.ok(cards.some((c) => /People/.test(c.title) && c.tags.includes('people')), 'people card');
assert.ok(cards.some((c) => c.tags.includes('finance') || c.tags.includes('personal')), 'finance/personal tags');
assert.deepEqual(TAGS_BY_TYPE['goal-note'], ['work', 'personal'], 'type maps to two tags');

// --- data-type fits cover the whole catalog honestly ---
for (const p of PROVIDERS) {
  const fit = PROVIDER_FITS[p.id];
  assert.ok(fit, `${p.id} has a data-type fit`);
  assert.ok(fit.adds.length > 0, `${p.id} adds at least one entry type`);
  assert.ok(typeof fit.note === 'string' && fit.note.length > 0, `${p.id} fit is explained`);
}
assert.ok(
  PROVIDER_FITS.health.summarizeFirst.length > 0,
  'raw health series is summarize-first, not directly integrable',
);

console.log('analysis OK: behavior signals, gaps, fits, ranked recommendations');
