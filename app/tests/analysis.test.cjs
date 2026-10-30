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

// --- synthesis sections: short Next steps / Facts / Entries, not a wall of text ---
const { buildSynthesisSections } = require('../.test-compiled/analysis.js');
const sections = buildSynthesisSections(entries, a);
assert.ok(sections.nextSteps.length > 0, 'next steps present');
assert.ok(
  sections.nextSteps.some((s) => /blind spot|Import/i.test(s)),
  'next steps point at gaps/import',
);
assert.ok(
  sections.facts.some((f) => /4 entries/.test(f)),
  'facts state totals',
);
assert.ok(
  sections.facts.some((f) => /shareable/.test(f)),
  'facts state sharing split',
);
assert.ok(!('entries' in sections), 'no recent-entries section at the bottom');
const { buildWhatMatters } = require('../.test-compiled/analysis.js');
const matters = buildWhatMatters(entries);
assert.ok(matters.interests.includes('research'), 'interests from shared knowledge');
assert.ok(matters.people.includes('Priya Nair'), 'key people from shared knowledge');
assert.ok(/shared knowledge centers on/.test(matters.headline), 'what-matters headline');
assert.ok(
  /Nothing shared yet/.test(buildWhatMatters([]).headline),
  'empty shared knowledge prompts sharing',
);

// --- synthesis cards: one per insight, multi-tagged ---
const { buildSynthesisCards, TAGS_BY_TYPE } = require('../.test-compiled/analysis.js');
assert.deepEqual(buildSynthesisCards([], empty), [], 'no cards when empty');
const cards = buildSynthesisCards(entries, a);
assert.ok(cards.length >= 2, 'thematic cards only after synthesis cleanup');
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

// --- essence: person, aspirations, potential; no people/counts/sources ---
const { buildEssence } = require('../.test-compiled/analysis.js');
const essence = buildEssence(entries, [
  { label: 'Bookworm', meaning: 'You process life through books and finish what you start.' },
]);
assert.ok(!/bookworm/i.test(essence.summary), 'essence never repeats the archetype label (shown as pills)');
const essenceText = [essence.summary, ...essence.aspirations, ...essence.potential].join(' ');
assert.ok(!/Priya|Ana Reyes|\b\d+ entries|journal entries|sources/i.test(essenceText), 'essence never names people, counts, or sources');
assert.ok(essence.potential.length > 0, 'potential surfaces growth directions');

console.log('analysis OK: behavior signals, gaps, fits, ranked recommendations');

// --- removed Synthesis cards stay removed (they belong in Paths, not Synthesis) ---
{
  const titles = cards.map((c) => c.title).join(' | ');
  assert.ok(!/Focus:|Sharing readiness|Blind spots/.test(titles), 'no focus/sharing/blind-spot cards in Synthesis');
  console.log('synthesis cleanup OK: no focus, sharing-readiness, or blind-spot cards');
}
