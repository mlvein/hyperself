// Personal backup: encrypted whole-database export/restore. The file must
// contain no plaintext, a wrong passphrase must fail closed and change
// nothing, and a correct restore must replace the database wholesale.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const store = require('../.test-compiled/store.js');
const { createBackup, parseBackupFile, restoreBackup } = require('../.test-compiled/backup.js');

(async () => {
  store.clearAll();
  store.setProfile('Maya');
  store.createEntry({ title: 'Secret journal', type: 'journal', body: 'BACKUP-SECRET-123 must never appear in the file' });
  store.createSavedPath({ name: 'Finance', query: 'where does my money go?', templateId: 'budgeting' });

  await assert.rejects(() => createBackup('short'), /at least 8/, 'short passphrase refused');

  const { filename, text } = await createBackup('correct horse battery');
  assert.ok(/^hyperself-backup-\d{8}\.json$/.test(filename), 'dated backup filename');
  assert.ok(!text.includes('BACKUP-SECRET-123') && !text.includes('Secret journal'), 'backup file holds no plaintext');
  const parsed = parseBackupFile(text);
  assert.equal(parsed.kind, 'hyperself-backup');
  assert.throws(() => parseBackupFile('{"kind":"other"}'), /not a Hyperself backup/, 'foreign file refused');
  assert.throws(() => parseBackupFile('nope'), /not a Hyperself backup/, 'invalid JSON refused');

  // Wrong passphrase: fails closed, database untouched.
  const before = store.listEntries().length;
  await assert.rejects(() => restoreBackup(text, 'wrong passphrase'), /Wrong passphrase/, 'wrong passphrase fails closed');
  assert.equal(store.listEntries().length, before, 'failed restore changed nothing');

  // Correct restore into a wiped workspace replaces everything.
  store.clearAll();
  assert.equal(store.listEntries().length, 0, 'workspace wiped');
  const { entries } = await restoreBackup(text, 'correct horse battery');
  assert.equal(entries, 1, 'restore reports entry count');
  const restored = store.listEntries();
  assert.equal(restored[0].title, 'Secret journal', 'entry restored');
  assert.equal(restored[0].embedding_status, 'pending', 'restored entries re-index');
  assert.equal(store.listSavedPaths().length, 1, 'saved paths restored');
  assert.equal(store.getProfile().name, 'Maya', 'profile restored');

  console.log('backup OK: encrypted export, no plaintext, wrong-pass fails closed, restore replaces');
})().catch((err) => { console.error(err); process.exit(1); });
