// Focused test: local vulnerability scan. Clean entries pass silent, leaked
// secrets flag high, contact details warn (escalated when shared), old and
// shared entries draw info findings. Run: npm test.
const assert = require('node:assert/strict');
const { scanEntry, worstLevel } = require('../.test-compiled/security.js');

const fresh = new Date().toISOString();
const base = {
  id: '1',
  type: 'finding',
  title: 't',
  body: 'a clean note about teardowns',
  tag: 'personal',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  source: 'typed',
  embedding_status: 'pending',
  created_at: fresh,
  updated_at: fresh,
  deleted_at: null,
};

assert.equal(scanEntry(base).length, 0, 'clean personal entry is silent');
assert.equal(worstLevel(scanEntry(base)), null);

const leaked = {
  ...base,
  body: 'deploy key AKIAIOSFODNN7EXAMPLE, contact me@example.com, call 415-555-0132',
};
const findings = scanEntry(leaked);
assert.ok(
  findings.some((f) => f.level === 'high' && /AWS/.test(f.message)),
  'AWS-like key flags high',
);
assert.ok(
  findings.some((f) => f.level === 'warn' && /email/.test(f.message)),
  'email warns when personal',
);
assert.ok(
  findings.some((f) => f.level === 'warn' && /phone/.test(f.message)),
  'phone-like number warns when personal',
);
assert.equal(worstLevel(findings), 'high');

const shared = { ...leaked, tag: 'shareable' };
const sharedEmail = scanEntry(shared).find((f) => /email/.test(f.message));
assert.equal(sharedEmail.level, 'high', 'contact details escalate when shared');

const stale = { ...base, updated_at: '2020-01-01T00:00:00' };
assert.ok(
  scanEntry(stale).some((f) => f.level === 'info' && /days ago/.test(f.message)),
  'old entry draws a staleness info',
);

const idDoc = { ...base, body: 'Renewal checklist. Passport No: X7421980. Keep private.' };
assert.ok(
  scanEntry(idDoc).some((f) => f.level === 'high' && /ID number/.test(f.message)),
  'ID number flags high',
);

const cleanShared = { ...base, tag: 'shareable' };
assert.ok(
  scanEntry(cleanShared).some((f) => f.level === 'info' && /Shared externally/.test(f.message)),
  'clean shared entry draws a review reminder',
);

console.log('security scan OK: silent clean, high secrets, warn contacts, stale + shared info');
