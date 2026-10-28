// Focused test: persona library. Every shipped persona spans years, evolves
// (recurring people, dated history), obeys the tag model, and carries both
// personal depth and shareable material. Reads the built public files.
// Run: npm test (after npm run personas).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'public', 'personas');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
assert.ok(files.length >= 3, 'at least three personas ship');

const NON_SHAREABLE = ['journal', 'health', 'finance', 'relationship', 'document'];

for (const file of files) {
  const kb = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.ok(kb.id && kb.label, `${file} has id + label`);
  assert.ok(kb.entries.length >= 40, `${kb.id} has decades worth of entries`);
  const years = new Set(kb.entries.map((e) => e.at.slice(0, 4)));
  assert.ok(years.size >= 15, `${kb.id} spans 15+ years (${[...years].join(', ')})`);
  const sorted = [...kb.entries].sort((a, b) => (a.at < b.at ? -1 : 1));
  assert.deepEqual(kb.entries.map((e) => e.at), sorted.map((e) => e.at), `${kb.id} is chronological`);
  for (const e of kb.entries) {
    assert.ok(!(e.tag === 'shareable' && NON_SHAREABLE.includes(e.type)), `${kb.id} tag model: ${e.title}`);
  }
  assert.ok(kb.entries.some((e) => e.tag === 'shareable'), `${kb.id} has shareable material`);
  assert.ok(kb.entries.some((e) => (e.people ?? []).length > 0), `${kb.id} has a people network`);
  const peopleCounts = new Map();
  for (const e of kb.entries) {
    for (const p of e.people ?? []) peopleCounts.set(p, (peopleCounts.get(p) ?? 0) + 1);
  }
  assert.ok([...peopleCounts.values()].some((c) => c >= 2), `${kb.id} has recurring people (evolving relationships)`);
  assert.ok(peopleCounts.size >= 18, `${kb.id} has a wide network (${peopleCounts.size} people)`);
}

console.log(`personas OK: ${files.length} personas, multi-year arcs, tag model holds`);
