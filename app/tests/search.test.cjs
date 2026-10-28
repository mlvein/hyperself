// Focused test: local knowledgebase search. Date queries resolve people by
// day/range, topic queries rank people by matching entries, everything else
// falls back to keywords. Run: npm test.
const assert = require('node:assert/strict');
const {
  extractDate,
  extractTopic,
  parseSearchQuery,
  runKnowledgeSearch,
} = require('../.test-compiled/search.js');

const TODAY = new Date(2026, 9, 27); // Oct 27 2026 local

// --- date extraction ---
assert.deepEqual(extractDate('people I met on 2026-10-03', TODAY), {
  start: '2026-10-03',
  end: '2026-10-03',
  label: 'October 3, 2026',
});
assert.equal(extractDate("people I've met yesterday", TODAY).start, '2026-10-26');
assert.equal(extractDate('met on Oct 4', TODAY).start, '2026-10-04');
assert.equal(extractDate('met in october', TODAY).start, '2026-10-01');
assert.equal(extractDate('met in october', TODAY).end, '2026-10-31');
assert.equal(extractDate('who knows Figma', TODAY), null, 'topic query has no date');

// --- topic extraction ---
assert.equal(extractTopic('People I know who might know about Figma'), 'figma');
assert.equal(extractTopic('who can help with taxes?'), 'taxes');
assert.equal(extractTopic('experts in sourdough'), 'sourdough');
assert.equal(extractTopic('people I met on Oct 4'), null);

// --- query parsing ---
assert.equal(parseSearchQuery("people I've met on 2026-10-03", TODAY).kind, 'people-by-date');
assert.equal(parseSearchQuery('people I met yesterday', TODAY).kind, 'people-by-date');
assert.equal(
  parseSearchQuery('People I know who might know about Figma', TODAY).kind,
  'people-by-topic',
);
assert.equal(parseSearchQuery('figma checklist', TODAY).kind, 'general');
assert.deepEqual(parseSearchQuery('', TODAY).tokens, []);

// --- end-to-end over entries ---
let n = 0;
const mk = (over) => ({
  id: `e${(n += 1)}`,
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
  created_at: '2026-10-04T09:00:00',
  updated_at: '2026-10-04T09:00:00',
  deleted_at: null,
  ...over,
});

const coffee = mk({ title: 'Coffee with Priya', people: ['Priya Nair'] });
const other = mk({
  title: 'Solo teardown',
  created_at: '2026-10-05T09:00:00',
  updated_at: '2026-10-05T09:00:00',
});
const figmaNote = mk({
  title: 'Auto-layout notes',
  type: 'research',
  body: 'Figma auto-layout is flexbox with training wheels',
  people: ['Ana Reyes'],
  created_at: '2026-10-20T09:00:00',
  updated_at: '2026-10-20T09:00:00',
});

const byDate = runKnowledgeSearch("people I've met on Oct 4", [coffee, other, figmaNote], TODAY);
assert.equal(byDate.parsed.kind, 'people-by-date');
assert.deepEqual(byDate.people.map((p) => p.name), ['Priya Nair']);
assert.deepEqual(byDate.entries.map((e) => e.id), [coffee.id]);
assert.ok(/1 person/.test(byDate.summary), 'date summary counts people');

const byTopic = runKnowledgeSearch(
  'People I know who might know about Figma',
  [coffee, other, figmaNote],
  TODAY,
);
assert.equal(byTopic.parsed.kind, 'people-by-topic');
assert.equal(byTopic.people[0].name, 'Ana Reyes', 'topic author ranks first');
assert.ok(byTopic.people[0].why.includes('Auto-layout'), 'why cites evidence');
assert.ok(byTopic.entries.some((e) => e.id === figmaNote.id));

const general = runKnowledgeSearch('teardown', [coffee, other, figmaNote], TODAY);
assert.equal(general.parsed.kind, 'general');
assert.ok(general.entries.some((e) => e.id === other.id), 'keyword fallback matches');

const empty = runKnowledgeSearch('zzz qqqq', [coffee], TODAY);
assert.deepEqual(empty.people, []);
assert.deepEqual(empty.entries, []);

console.log('search OK: date/topic/general parsing + people rollups + evidence');
