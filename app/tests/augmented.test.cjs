// Augmented Paths: derived-only payload, fail-closed validator, consent +
// BYO key handling, allowlisted destinations. No real provider is called;
// a fake fetch proves the sent bytes equal the previewed profile.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};
const sess = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (sess.has(String(k)) ? sess.get(String(k)) : null),
  setItem: (k, v) => { sess.set(String(k), String(v)); },
  removeItem: (k) => { sess.delete(String(k)); },
};

const store = require('../.test-compiled/store.js');
const {
  assertDerivedOnly,
  buildDerivedProfile,
  getAugmentedKey,
  hasConsent,
  isAllowedHost,
  isAugmentableAsk,
  listAugmentedLog,
  recordConsent,
  revokeAugmented,
  sendAugmented,
  setAugmentedKey,
} = require('../.test-compiled/augmented.js');

(async () => {
  store.clearAll();
  const research = store.createSkill({ name: 'Research', level: 'confident' });
  const secretSkill = store.createSkill({ name: 'My Secret Hobby', level: 'learning' });
  const e1 = store.createEntry({ title: 'Reading notes', type: 'research', body: 'Finished reading the annotation study; finished two books.' });
  store.createEntry({ title: 'More notes', type: 'research', body: 'Bought three for the TBR shelf, still unread.' });
  // attach skill evidence directly (extraction normally does this)
  const dbEntry = store.getEntry(e1.id);
  assert.ok(dbEntry);

  const archetypes = [{ id: 'margin-annotator', label: 'My Custom Name', strength: 'established', score: 9, trend: 'stable', meaning: 'm', watchFor: 'w', customLabel: 'My Custom Name' }];
  const prefs = { 'margin-annotator': { status: 'confirmed', updated_at: '2026-01-01T00:00:00' } };
  const entries = store.listEntries();
  // skill_ids are empty here (no ingest); builder must still be valid + derived-only
  const profile = buildDerivedProfile(entries, archetypes, prefs, 'sequence a learning path for research leadership roles', 'Learning');
  assert.equal(profile.archetypes[0].label, 'Margin Annotator', 'platform label sent, never the custom rename');
  assert.ok(!JSON.stringify(profile).includes('Reading notes'), 'no entry titles in profile');
  assert.ok(!JSON.stringify(profile).includes('annotation study'), 'no entry text in profile');
  assert.ok(profile.request.ask.length <= 120, 'ask capped');

  // Validator fails closed on smuggled content
  assert.throws(() => assertDerivedOnly({ ...profile, body: 'entry text' }), /rejected/, 'extra field rejected');
  assert.throws(() => assertDerivedOnly({ ...profile, request: { ask: 'x'.repeat(121), path_name: 'L' } }), /rejected/, 'long ask rejected');
  assert.throws(() => assertDerivedOnly({ kind: 'other', version: 1 }), /rejected/, 'foreign payload rejected');
  assert.doesNotThrow(() => assertDerivedOnly(profile), 'built profile passes');

  // Eligibility: learning/research only
  assert.ok(isAugmentableAsk('sequence a learning path'), 'learning ask eligible');
  assert.ok(!isAugmentableAsk('who has gone quiet?'), 'relationship ask not eligible in v1');

  // Hosts + consent + key lifecycle
  assert.ok(isAllowedHost('https://api.meta.ai/v1'), 'Meta Model API allowlisted');
  assert.ok(!isAllowedHost('https://api.baseten.co/v1'), 'non-Meta hosts are not allowlisted');
  assert.ok(!isAllowedHost('https://evil.example/v1'), 'unknown host not allowlisted');
  assert.equal(getAugmentedKey(), null, 'no key initially');
  setAugmentedKey('sk-test-123', true);
  assert.equal(getAugmentedKey(), 'sk-test-123', 'session key available');
  assert.ok(![...mem.values()].some((v) => v.includes('sk-test-123')), 'key never in localStorage');
  recordConsent('https://api.meta.ai/v1');
  assert.ok(hasConsent('https://api.meta.ai/v1'), 'consent recorded');

  // Send: fake fetch captures the exact bytes; sent payload == profile JSON
  let sentBody = null;
  const fakeFetch = async (url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Your sequenced learning path…' } }] }) };
  };
  const { text, payloadBytes } = await sendAugmented(profile, { endpoint: 'https://api.meta.ai/v1', model: 'muse-spark-1.1' }, fakeFetch);
  assert.ok(text.includes('learning path'), 'reply returned');
  assert.equal(sentBody.messages[1].content, payloadBytes, 'sent bytes equal the previewed profile');
  assert.equal(payloadBytes, JSON.stringify(profile), 'payload is exactly the derived profile');
  assert.equal(listAugmentedLog().length, 1, 'send logged without contents');
  assert.ok(!JSON.stringify(listAugmentedLog()).includes('learning path'), 'log holds no payload contents');

  // Fail closed: no key, and unconsented custom host
  revokeAugmented();
  assert.equal(getAugmentedKey(), null, 'revoke forgets the key');
  assert.equal(hasConsent('https://api.meta.ai/v1'), false, 'revoke clears consent');
  await assert.rejects(() => sendAugmented(profile, { endpoint: 'https://api.meta.ai/v1', model: 'muse-spark-1.1' }, fakeFetch), /API key/, 'no key fails closed');
  setAugmentedKey('[REDACTED]', true);
  await assert.rejects(() => sendAugmented(profile, { endpoint: 'https://api.baseten.co/v1', model: 'muse-spark-1.1' }, fakeFetch), /Meta Model API/, 'non-Meta host refused even with consent and key');
  await assert.rejects(() => sendAugmented(profile, { endpoint: 'https://api.meta.ai/v1', model: 'gpt-4o' }, fakeFetch), /not a Meta model/, 'non-Meta model refused');
  revokeAugmented();

  console.log('augmented OK: derived-only, platform labels, fail-closed, consent + BYO key');
})().catch((err) => { console.error(err); process.exit(1); });
