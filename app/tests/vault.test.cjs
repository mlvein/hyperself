// Focused test: vault crypto — PIN wrap/unwrap, wrong PIN fails, sealed JSON.
const assert = require('node:assert/strict');

const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const {
  setupVault,
  unlockWithPin,
  hasVault,
  encryptJson,
  decryptJson,
} = require('../.test-compiled/vault.js');

(async () => {
  assert.equal(hasVault(), false, 'no vault before setup');
  const key = await setupVault('demo-pin');
  assert.equal(hasVault(), true, 'vault exists after setup');

  const unlocked = await unlockWithPin('demo-pin');
  const sealed = await encryptJson(key, { secret: 'bank statement' });
  assert.ok(!sealed.includes('bank'), 'ciphertext hides plaintext');
  assert.deepEqual(await decryptJson(unlocked, sealed), { secret: 'bank statement' }, 'PIN unlock decrypts');

  await assert.rejects(() => unlockWithPin('wrong-pin'), /Incorrect PIN/, 'wrong PIN fails closed');
  await assert.rejects(() => setupVault('abc'), /at least 4/, 'short PIN rejected at setup helper');

  console.log('vault OK: PIN wrap, encrypted JSON, wrong PIN fails');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
