// Profile picture: one downsized copy stored in the existing database
// (so OPFS, vault encryption, and encrypted backups cover it). It is
// never a live reference to the source file, and oversized or non-image
// data is refused.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const store = require('../.test-compiled/store.js');
const fs = require('node:fs');
const path = require('node:path');

store.clearAll();
assert.equal(store.getProfilePhoto(), null, 'no photo by default');

const tiny = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-bytes').toString('base64');
store.setProfilePhoto(tiny);
assert.equal(store.getProfilePhoto(), tiny, 'photo round-trips through the store');

// It lives in the database export, not in a side file or the profile name record.
const db = store.exportDatabase();
assert.equal(db.profilePhoto, tiny, 'photo is part of the database (backup/vault/OPFS ride along)');
assert.ok(!JSON.stringify(store.getProfile() ?? {}).includes('base64'), 'photo is not stuffed into the profile name record');

// Validation fails closed.
assert.throws(() => store.setProfilePhoto('data:text/html;base64,PGI+'), /image/, 'non-image data refused');
assert.throws(() => store.setProfilePhoto('https://example.com/me.jpg'), /image/, 'remote URLs refused — no external references');
assert.throws(() => store.setProfilePhoto('data:image/png;base64,' + 'A'.repeat(300_001)), /too large/, 'oversized data refused');
assert.equal(store.getProfilePhoto(), tiny, 'failed sets change nothing');

// Clearing removes it; import restores it.
store.setProfilePhoto(null);
assert.equal(store.getProfilePhoto(), null, 'photo can be removed');
store.importDatabase({ ...db, entries: [], goals: [], checkins: [], skills: [], personNotes: {}, savedPaths: [], folderFiles: {}, archetypePrefs: {} });
assert.equal(store.getProfilePhoto(), tiny, 'photo survives a database restore');

// UI wiring: upload on the overview, shown on overview + network center.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
assert.ok(html.includes('id="profilePhotoInput"'), 'profile photo upload input present');
assert.ok(html.includes('id="profilePhotoBtn"'), 'upload control on the overview card');
assert.ok(main.includes('fileToProfilePhoto'), 'uploads are downsized before storing');
assert.ok(main.includes('getProfilePhoto'), 'UI reads the stored photo');
assert.ok(main.includes('center ? getProfilePhoto()'), 'network center node uses the photo');

console.log('profilephoto OK: one downsized copy in the existing DB, validated, restorable');
