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
  const vias = new Set(kb.entries.map((e) => e.via).filter(Boolean));
  assert.ok(vias.size >= 8, `${kb.id} simulates 8+ linked sources (${[...vias].join(', ')})`);
  assert.ok(kb.entries.filter((e) => e.via).length >= 12, `${kb.id} has a substantial linked-source layer`);
  const types = new Set(kb.entries.map((e) => e.type));
  assert.ok(types.size >= 8, `${kb.id} spans 8+ entry types (${[...types].join(', ')})`);
  const peopleCounts = new Map();
  for (const e of kb.entries) {
    for (const p of e.people ?? []) peopleCounts.set(p, (peopleCounts.get(p) ?? 0) + 1);
  }
  assert.ok([...peopleCounts.values()].some((c) => c >= 2), `${kb.id} has recurring people (evolving relationships)`);
  assert.ok(peopleCounts.size >= 18, `${kb.id} has a wide network (${peopleCounts.size} people)`);
}

// Maya carries rich demo finance/health data so the Finance and Health
// Path templates populate their detail views (statement transactions
// with Amount/Category, health-export record lines).
{
  const maya = JSON.parse(fs.readFileSync(path.join(dir, 'maya.json'), 'utf8'));
  const tx = maya.entries.filter((e) => e.type === 'finance' && /Amount:\s*-?[\d.]+/.test(e.body) && /Category:/.test(e.body));
  const months = new Set(tx.map((e) => e.at.slice(0, 7)));
  assert.ok(tx.length >= 80, `Maya finance transactions populate the Finance Path (${tx.length})`);
  assert.ok(months.size >= 10, `Maya finance spans 10+ months of trend (${months.size})`);
  const cats = new Set(tx.map((e) => e.body.match(/Category:\s*([^·\n]+)/)[1].trim()));
  assert.ok(cats.size >= 6, `Maya finance covers 6+ categories (${[...cats].join(', ')})`);
  const health = maya.entries.filter((e) => e.type === 'health');
  const recordLines = health.flatMap((e) => e.body.split('\n')).filter((l) => /^- \w.*: \d+ records/.test(l.trim()));
  assert.ok(health.length >= 15, `Maya health entries populate the Health Path (${health.length})`);
  assert.ok(recordLines.length >= 8, `Maya health export record lines present (${recordLines.length})`);
  // A lifetime's worth: 1998-2026, hundreds of entries across every type.
  assert.ok(maya.entries.length >= 400, `Maya is a lifetime archive (${maya.entries.length} entries)`);
  const mayaYears = new Set(maya.entries.map((e) => e.at.slice(0, 4)));
  assert.ok(mayaYears.size >= 25, `Maya spans 25+ calendar years (${mayaYears.size})`);
  assert.ok(maya.entries[0].at.startsWith('1998'), 'Maya archive starts in 1998 (school years)');
  for (const id of ['daniel', 'rosa']) {
    const kb = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    assert.ok(kb.entries.length >= 400, `${id} is a lifetime archive (${kb.entries.length} entries)`);
    const ys = new Set(kb.entries.map((e) => e.at.slice(0, 4)));
    assert.ok(ys.size >= 25, `${id} spans 25+ calendar years (${ys.size})`);
    assert.ok(kb.entries[0].at.startsWith('1998'), `${id} archive starts in 1998`);
    const ftx = kb.entries.filter((e) => e.type === 'finance' && /Amount:/.test(e.body));
    assert.ok(ftx.length >= 200, `${id} finance transactions populate Finance (${ftx.length})`);
    assert.ok(kb.entries.filter((e) => e.type === 'health').length >= 20, `${id} health entries populate Health`);
  }
}

console.log(`personas OK: ${files.length} personas, multi-year arcs, tag model holds`);
