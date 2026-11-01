// Structured extraction: known people link exactly, recurring candidates
// link cautiously, goals/skills link on real signals, and ingest wires all
// three onto entries. Precision cases matter as much as recall here.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const {
  extractCandidatePeople,
  extractKnownPeople,
  lexiconSkillHits,
  matchGoals,
  matchSkills,
} = require('../.test-compiled/extract.js');
const store = require('../.test-compiled/store.js');
const { ingestDoc } = require('../.test-compiled/ingest.js');

// --- pure extraction ---
assert.deepEqual(extractKnownPeople('Lunch with Priya Nair today', ['Priya Nair', 'Ana Reyes']), ['Priya Nair'], 'known person matches');
assert.deepEqual(extractKnownPeople('No names here', ['Priya Nair']), [], 'no false known match');
assert.deepEqual(
  extractCandidatePeople('Met Sofia Hale at school. Sofia Hale brought forms. Thinking in Systems is great. Thinking in Systems again.'),
  ['Sofia Hale'],
  'recurring name is a candidate; recurring book title is stoplisted',
);
assert.deepEqual(extractCandidatePeople('Met Sofia Hale once.'), [], 'one-off capitalized pair is not a candidate');

const goals = [
  { id: 'g1', title: 'Lead a research team', description: 'mentor junior researchers', status: 'active' },
  { id: 'g2', title: 'Run a marathon', description: 'endurance training plan', status: 'active' },
  { id: 'g3', title: 'Old abandoned research team dream', description: 'mentor researchers', status: 'abandoned' },
];
assert.deepEqual(matchGoals('I mentor junior researchers in our research team weekly', goals), ['g1'], 'goal links on overlap; abandoned excluded');
assert.deepEqual(matchGoals('Bought new running shoes', goals), [], 'weak overlap does not link');

const skills = [{ id: 's1', name: 'Design' }, { id: 's2', name: 'Budgeting' }];
assert.deepEqual(matchSkills('A design review of the portfolio', skills), ['s1'], 'existing skill evidenced');
assert.deepEqual(lexiconSkillHits('The research study reviewed evidence from the experiment'), ['Research'], 'lexicon needs 2+ signals');
assert.deepEqual(lexiconSkillHits('One research mention'), [], 'single signal does not seed a skill');

// --- ingest integration ---
store.clearAll();
store.createEntry({ title: 'Mentor note', type: 'relationship', body: 'Coffee with Priya Nair.', people: ['Priya Nair'] });
const goal = store.createGoal({ title: 'Lead a research team', description: 'mentor junior researchers' });
const doc = [
  '# Field notes',
  '',
  'Priya Nair reviewed the research evidence with me. The study design and experiment protocol held up.',
  '',
  'Later, Sofia Hale joined. Sofia Hale brought the school forms and Sofia Hale stayed for tea.',
  '',
  'I mentor junior researchers on the research team every Friday.',
].join('\n');
const result = ingestDoc('field-notes.md', doc);
assert.ok(result.created >= 1, 'doc ingested');
const entries = store.listEntriesByLabel('field-notes.md');
assert.ok(entries.length >= 1);
const withPriya = entries.find((e) => e.people.includes('Priya Nair'));
assert.ok(withPriya, 'known person auto-linked from text');
assert.ok(withPriya.goal_ids.includes(goal.id), 'goal auto-linked on overlap');
assert.ok(withPriya.skill_ids.length >= 1, 'skill evidence attached');
assert.ok(store.listSkills().some((s) => s.name === 'Research'), 'lexicon skill seeded as a Skill record');
const sofia = entries.find((e) => e.people.includes('Sofia Hale'));
assert.ok(sofia, 'recurring candidate person auto-linked');

const plain = ingestDoc('plain.md', 'A short note about grocery shopping and weather.');
const plainEntries = store.listEntriesByLabel('plain.md');
assert.deepEqual(plainEntries[0].people, [], 'unrelated doc gains no people');
assert.deepEqual(plainEntries[0].goal_ids, [], 'unrelated doc gains no goals');

console.log('extract OK: known/candidate people, goal + skill linking, ingest integration');
