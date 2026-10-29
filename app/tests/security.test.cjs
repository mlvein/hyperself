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

// --- image flags: compromising / inappropriate image imports notify in Security ---
const img = {
  ...base,
  source: 'upload',
  source_label: 'passport-scan.jpg',
  body: '[Image transcript: passport-scan.jpg]\n\nPASSPORT United States of America. Passport No: X7421980.',
};
assert.ok(
  scanEntry(img).some((f) => f.level === 'high' && /ID document/.test(f.message)),
  'image of an ID document flags high',
);
const flagged = {
  ...base,
  source: 'upload',
  source_label: 'party.png',
  body: '[Image transcript: party.png]\n\nNSFW explicit intimate photo backup',
};
assert.ok(
  scanEntry(flagged).some((f) => f.level === 'high' && /inappropriate/.test(f.message)),
  'inappropriate image flags high',
);
const chatShot = {
  ...base,
  source: 'upload',
  source_label: 'chat.png',
  body: '[Image transcript: chat.png]\n\nWhatsApp screenshot: chat history with Ana',
};
assert.ok(
  scanEntry(chatShot).some((f) => f.level === 'warn' && /private conversation/.test(f.message)),
  'conversation screenshot warns',
);
const cleanPhoto = {
  ...base,
  source: 'upload',
  source_label: 'beach.jpg',
  body: '[Image transcript: beach.jpg]\n\nBeach day, no text found.',
};
assert.ok(
  !scanEntry(cleanPhoto).some((f) => f.level === 'high'),
  'clean photo gets no high flag',
);
const notImage = { ...base, body: 'Notes about my passport renewal appointment.' };
assert.ok(
  !scanEntry(notImage).some((f) => /ID document/.test(f.message)),
  'image-only checks do not fire on plain text entries',
);

console.log('security scan OK: silent clean, high secrets, warn contacts, stale + shared info');
