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
assert.equal(path.pinned, true, 'saved paths pin by default');
assert.equal(store.listSavedPaths().length, 1);
store.setSavedPathPinned(path.id, false);
assert.equal(store.listSavedPaths()[0].pinned, false, 'pin toggles persist');
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
assert.equal(templateById('budgeting').name, 'Budgeting');

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
