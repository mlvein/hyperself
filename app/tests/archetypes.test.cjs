// Focused test: archetypes distinguish collecting from finishing.
// Margin Annotator = reads/finishes a lot; Shelf Cartographer = collects/TBR, rarely reads.
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
assert.ok(readerLabels.includes('Margin Annotator'), 'finisher is a Margin Annotator');
assert.ok(!readerLabels.includes('Shelf Cartographer'), 'finisher is not a cartographer');

const hoarderLabels = computeArchetypes(hoarder).map((a) => a.label);
assert.ok(hoarderLabels.includes('Shelf Cartographer'), 'collector is a Shelf Cartographer');
assert.ok(!hoarderLabels.includes('Margin Annotator'), 'collector is not an annotator');

assert.deepEqual(computeArchetypes([]), [], 'no data, no archetypes');
const top = computeArchetypes([...reader, ...hoarder]);
assert.ok(top.length <= 4 && top[0].score >= top[top.length - 1].score, 'ranked, capped at four');

assert.ok(top.every((a) => a.meaning.length > 20 && a.watchFor.length > 10), 'archetypes carry expounded meaning + watch-for');
assert.ok(/margins|metabolised/i.test(computeArchetypes(reader)[0].meaning + computeArchetypes(reader).map((a) => a.meaning).join(' ')), 'margin annotator expounded');

console.log('archetypes OK: annotator vs cartographer, conflicts resolve, ranked cap');

// --- Two-layer labels: traits, strength/trend, timeline, user agency ---
{
  const {
    applyArchetypePreferences,
    computeArchetypeTimeline,
    computeTraitDimensions,
  } = require('../.test-compiled/archetypes.js');
  const timedReader = reader.map((e, i) => ({
    ...e,
    id: `timed-${i}`,
    created_at: `${2008 + i * 3}-01-01T09:00:00`,
    updated_at: `${2008 + i * 3}-01-01T09:00:00`,
  }));
  const topReader = computeArchetypes(timedReader)[0];
  assert.ok(topReader.strength >= 1 && topReader.strength <= 100, 'archetype strength is normalized');
  assert.ok(topReader.confidence >= 1 && topReader.confidence <= 100, 'archetype confidence is normalized');
  assert.ok(['rising', 'steady', 'fading', 'emerging'].includes(topReader.trend), 'archetype trend is explicit');

  const traits = computeTraitDimensions(timedReader);
  assert.equal(traits.length, 5, 'five inferred trait dimensions');
  assert.ok(traits.every((t) => t.score >= 0 && t.score <= 100 && t.confidence >= 0 && t.confidence <= 100), 'trait scores and confidence are bounded');
  assert.ok(traits.some((t) => t.id === 'curiosity'), 'curiosity dimension present');
  assert.ok(traits.every((t) => /inferred|Behavioral/.test(t.inspiredBy)), 'traits disclose inferred framing');

  const eras = computeArchetypeTimeline(timedReader);
  assert.ok(eras.length >= 2, 'long history produces multiple archetype eras');
  assert.ok(eras.every((era) => era.archetypes.length > 0), 'each era has archetypes');

  const renamed = applyArchetypePreferences(computeArchetypes(reader), {
    bookworm: { status: 'confirmed', customLabel: 'Deep Reader', updated_at: '2026-01-01T00:00:00' },
  });
  assert.equal(renamed[0].label, 'Deep Reader', 'rename wins over generated label');
  assert.equal(renamed[0].confirmed, true, 'confirmed preference is visible');
  const dismissed = applyArchetypePreferences(computeArchetypes(reader), {
    bookworm: { status: 'dismissed', updated_at: '2026-01-01T00:00:00' },
  });
  assert.ok(!dismissed.some((a) => a.id === 'margin-annotator'), 'legacy Not me (bookworm) still filters the renamed archetype');
  console.log('archetype layers OK: traits, strength/trend, eras, confirm/rename/dismiss');
}
