// Focused test: persistent saved Paths + Budgeting template suggestion.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const store = require('../.test-compiled/store.js');
const { suggestTemplates, isBudgetingQuery, templateById } = require('../.test-compiled/templates.js');
const { transactionsFromEntries, summarizeTransactions } = require('../.test-compiled/budget.js');

store.clearAll();
const path = store.createSavedPath({ name: 'My Budget', query: 'where does my money go?', templateId: 'budgeting' });
assert.equal(path.pinned, false, 'no saved path is pinned by default');
assert.equal(store.listSavedPaths().length, 1);
store.setSavedPathPinned(path.id, true);
assert.equal(store.listSavedPaths()[0].pinned, true, 'pin toggles persist');
store.setSavedPathPinned(path.id, false);
assert.throws(() => store.createSavedPath({ name: '', query: 'x' }), /name is required/i);

for (let i = 0; i < 3; i += 1) {
  store.createEntry({
    title: `Spend ${i}`,
    type: 'finance',
    body: `Amount: -${(i + 1) * 10}.00 · Category: Dining · Date: 2024-01-0${i + 1}`,
    at: `2024-01-0${i + 1}T12:00:00`,
  });
}
const entries = store.listEntries();
assert.equal(suggestTemplates(entries).length, 1, 'budgeting suggested once finance data exists');
assert.ok(isBudgetingQuery('where does my money go?'), 'money ask maps to budgeting');
assert.ok(!isBudgetingQuery('who might know about Figma'), 'other asks do not');
assert.equal(templateById('budgeting').name, 'Finance');

const tx = transactionsFromEntries(entries);
assert.equal(tx.length, 3, 'transactions rebuilt from finance entries');
assert.equal(summarizeTransactions(tx).spent, 60, 'spend totals rebuilt');

store.deleteSavedPath(path.id);
assert.equal(store.listSavedPaths().length, 0, 'delete removes the path');

console.log('savedpaths OK: persistent paths, pin toggle, template suggestion, budget rebuild');

// --- Day 6: readiness checklist (have vs missing, no manual setup) ---
{
  const { templateReadiness: ready2, PATH_TEMPLATES } = require('../.test-compiled/templates.js');
  const budgeting = PATH_TEMPLATES[0];
  const before = ready2(store.listEntries().filter((e) => e.type !== 'finance'), budgeting);
  assert.equal(before.ready, false);
  assert.ok(before.missing.some((m) => /bank statement/i.test(m)), 'missing names the exact data needed');
  const after = ready2(store.listEntries(), budgeting);
  assert.equal(after.ready, true, 'ready once statement data exists');
  assert.ok(after.have.some((h) => /finance entries/.test(h)), 'have lists what is already there');
  console.log('templates OK: readiness have/missing checklist');
}

// --- Archetype-seeded Paths ---
{
  const { PATH_TEMPLATES: templates2, templateForArchetype, templateReadiness: readiness3, relationshipRhythms, readingLifeSummary } = require('../.test-compiled/templates.js');
  assert.equal(templates2.length, 3, 'budgeting plus two archetype templates');
  assert.equal(templateForArchetype('network-weaver').id, 'relationship-rhythms');
  assert.equal(templateForArchetype('bookworm').id, 'reading-life');
  assert.equal(templateForArchetype('book-hoarder').id, 'reading-life', 'hoarder also seeds Reading Life');

  const peopleEntries = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`, type: 'relationship', title: `Person ${i}`, body: 'met and talked', tag: 'personal', tag_history: [], goal_ids: [], skill_ids: [], people: [`Person ${i}`], source: 'upload', embedding_status: 'pending', created_at: '2025-01-01T09:00:00', updated_at: '2025-01-01T09:00:00', deleted_at: null,
  }));
  const suggestions2 = suggestTemplates(peopleEntries);
  assert.ok(suggestions2.some((x) => x.template.id === 'relationship-rhythms' && x.archetypeId === 'network-weaver'), 'Network Weaver suggests Relationship Rhythms');
  assert.equal(readiness3(peopleEntries, templateForArchetype('network-weaver')).ready, true, 'relationship template ready with enough people');
  assert.ok(relationshipRhythms(peopleEntries).length >= 10, 'relationship rhythms are computed descriptively');

  const readingEntries = Array.from({ length: 6 }, (_, i) => ({
    id: `r${i}`, type: 'research', title: `Book ${i}`, body: 'Finished reading this novel and chapter notes.', tag: 'shareable', tag_history: [], goal_ids: [], skill_ids: [], people: [], source: 'upload', embedding_status: 'pending', created_at: '2025-01-01T09:00:00', updated_at: '2025-01-01T09:00:00', deleted_at: null,
  }));
  assert.ok(suggestTemplates(readingEntries).some((x) => x.template.id === 'reading-life'), 'Bookworm suggests Reading Life');
  assert.equal(readingLifeSummary(readingEntries).read, 6, 'reading summary counts finishing signals');
  console.log('archetype paths OK: templates, suggestions, readiness, descriptive summaries');
}

// --- suggested-only gating + badge count ---
{
  const { visibleSuggestedTemplates, availablePathCount } = require('../.test-compiled/templates.js');
  assert.deepEqual(visibleSuggestedTemplates([], []), [], 'no shared data, no suggested templates shown');
  const fin = Array.from({ length: 3 }, (_, i) => ({
    id: `f${i}`, type: 'finance', title: `S${i}`, body: 'Amount: -10.00', tag: 'personal', tag_history: [], goal_ids: [], skill_ids: [], people: [], source: 'upload', embedding_status: 'pending', created_at: '2025-01-01T09:00:00', updated_at: '2025-01-01T09:00:00', deleted_at: null,
  }));
  const vis = visibleSuggestedTemplates(fin, []);
  assert.ok(vis.some((x) => x.template.id === 'budgeting'), 'budgeting surfaces only after finance data is shared');
  assert.deepEqual(visibleSuggestedTemplates(fin, ['budgeting']), [], 'already-created template is not re-suggested');
  assert.equal(availablePathCount([], []), 0, 'badge is zero with no paths or data');
  assert.equal(availablePathCount(fin, []), 1, 'badge counts a ready suggestion');
  assert.equal(availablePathCount(fin, [{ templateId: 'budgeting' }]), 1, 'badge counts the saved path instead of its suggestion');
  assert.equal(availablePathCount(fin, [{ templateId: 'budgeting' }, {}]), 2, 'badge adds saved paths');
  console.log('paths gating OK: suggestions need shared data; badge counts saved + suggested');
}

// --- Finance Path: renamed, unpinned when created from its template ---
{
  const financePath = store.createSavedPath({ name: 'Finance', query: 'where does my money go?', templateId: 'budgeting', pinned: false });
  assert.equal(financePath.pinned, false, 'Finance Path is unpinned by default');
  assert.equal(templateById('budgeting').name, 'Finance', 'template renamed to Finance');
  store.deleteSavedPath(financePath.id);
  console.log('finance path OK: renamed, unpinned by default');
}
