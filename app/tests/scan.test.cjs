// Focused test: account scan + leak pipeline. Providers obey the tag model,
// the scan previews every account with leak hints, linking ingests people +
// backdated stamps, and leaked seeds surface as actionable Paths insights.
// Run: npm test.
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

const store = require('../.test-compiled/store.js');
const conns = require('../.test-compiled/connections.js');
const { scanEntry } = require('../.test-compiled/security.js');
const { buildInsights } = require('../.test-compiled/insights.js');

const NON_SHAREABLE = ['journal', 'health', 'finance', 'relationship', 'document'];

// --- catalog shape ---
assert.ok(conns.PROVIDERS.length >= 10, 'thorough catalog (10+ providers)');
for (const p of conns.PROVIDERS) {
  assert.ok(p.id && p.name && p.category && p.accountHint, `${p.id} has scan metadata`);
  assert.ok(p.dataKinds.length > 0 && p.seeds.length > 0, `${p.id} has kinds + seeds`);
  for (const s of p.seeds) {
    assert.ok(s.title && s.body && s.type, `${p.id} seed has content`);
    assert.ok(
      !(s.tag === 'shareable' && NON_SHAREABLE.includes(s.type)),
      `${p.id} seed "${s.title}" obeys the tag model`,
    );
  }
}

// --- scan previews everything, local-only ---
store.clearAll();
const report = conns.runAccountScan();
assert.equal(report.accounts.length, conns.PROVIDERS.length);
assert.equal(
  report.totalItems,
  conns.PROVIDERS.reduce((sum, p) => sum + p.seeds.length, 0),
  'scan totals every ingestible item',
);
assert.ok(report.totalLeaks > 0, 'scan previews leak hints');
assert.deepEqual(conns.getLastScan().accounts.length, report.accounts.length, 'scan persists');

// --- linking ingests people + backdated stamps ---
const before = store.listEntries().length;
const { created } = conns.connectProvider('calendar');
assert.equal(created, 6);
const linked = store.listEntries();
assert.equal(linked.length, before + 6);
const coffee = linked.find((e) => /Coffee with Priya/.test(e.title));
assert.deepEqual(coffee.people, ['Priya Nair'], 'seed people tagged at import');
assert.ok(
  Date.parse(coffee.created_at) < Date.now() - 3 * 86400000,
  'seed backdated for date search',
);

// --- leaked seeds flag high and reach Paths with next steps ---
store.clearAll();
conns.connectProvider('github');
conns.connectProvider('gmail');
const entries = store.listEntries();
const highs = entries.filter((e) => scanEntry(e).some((f) => f.level === 'high'));
assert.ok(highs.length >= 2, 'token + password seeds flag high');
assert.ok(
  highs.some((e) => scanEntry(e).some((f) => /GitHub token/.test(f.message))),
  'github token seed detected',
);
const insights = buildInsights(entries);
const leak = insights.find((i) => /leaked data/.test(i.title));
assert.ok(leak, 'leaked entry yields a Paths insight');
assert.equal(leak.severity, 'high');
assert.ok(/Next step:/.test(leak.body), 'insight carries an actionable next step');
assert.ok(leak.kinds.includes('goto-library') && leak.kinds.includes('acknowledge'));

// --- breach corpus is advisory, not a verdict ---
const fresh = new Date().toISOString();
const base = {
  id: 'x', type: 'finding', title: 't', body: 'clean note', tag: 'personal',
  tag_history: [], goal_ids: [], skill_ids: [], people: [], source: 'upload',
  embedding_status: 'pending', created_at: fresh, updated_at: fresh, deleted_at: null,
};
assert.equal(scanEntry(base).length, 0, 'clean entry stays silent');
assert.ok(
  scanEntry({ ...base, body: 'wrote to dana@example.com today' }).some(
    (f) => f.level === 'high' && /breach corpus/.test(f.message),
  ),
  'corpus address flags high with breach label',
);

// --- caretaker case: Family + Calendar link with people + dates ---
store.clearAll();
const fam = conns.connectProvider('family');
assert.equal(fam.created, 6, 'family seeds cover school, care, estate');
const caretaker = store.listEntries();
const estate = caretaker.find((e) => /estate plan/.test(e.title));
assert.deepEqual(estate.people.sort(), ['Nora Hale', 'Robert Hale']);
assert.ok(
  buildInsights(caretaker).some((i) => i.id === `stale:${estate.id}`),
  'overdue estate review surfaces as a stale-data Path',
);
const school = caretaker.find((e) => /Lincoln Elementary/.test(e.title));
assert.ok(
  scanEntry(school).some((f) => f.level === 'warn' && /phone/.test(f.message)),
  'school office number draws a contact warning',
);

store.clearAll();
console.log('scan OK: catalog, leak hints, people+dates on link, Paths leak actions, caretaker');
