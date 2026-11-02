// Curated, pinnable knowledge packs: each pack has its own settings
// (name/author/version, expertise-only curation), pinned packs surface
// as Legacy subtabs, and export honors the curation — shareable-only
// first, expertise filter second, personal never.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const store = require('../.test-compiled/store.js');
const { curatedPackEntries, exportPackText, isExpertiseEntry } = require('../.test-compiled/pack.js');

function entry(patch) {
  return {
    id: patch.id, type: patch.type ?? 'finding', title: patch.id, body: `body ${patch.id}`,
    tag: patch.tag ?? 'shareable', tag_history: [], goal_ids: [], skill_ids: patch.skill_ids ?? [],
    people: [], source: 'typed', embedding_status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  };
}

(async () => {
  // Expertise = findings/methods/research/skills, or anything skill-evidenced.
  assert.equal(isExpertiseEntry(entry({ id: 'a', type: 'finding' })), true);
  assert.equal(isExpertiseEntry(entry({ id: 'b', type: 'goal-note', skill_ids: ['s1'] })), true, 'skill-evidenced counts');
  assert.equal(isExpertiseEntry(entry({ id: 'c', type: 'goal-note' })), false, 'plain notes are not expertise');
  assert.equal(isExpertiseEntry(entry({ id: 'd', type: 'document' })), false);

  const entries = [
    entry({ id: 'exp1', type: 'method' }),
    entry({ id: 'exp2', type: 'goal-note', skill_ids: ['s1'] }),
    entry({ id: 'plain', type: 'goal-note' }),
    entry({ id: 'pers', type: 'method', tag: 'personal' }),
    entry({ id: 'gone', type: 'method', }),
  ];
  entries[4].deleted_at = '2026-02-01T00:00:00.000Z';

  assert.deepEqual(curatedPackEntries(entries, {}).map((e) => e.id), ['exp1', 'exp2', 'plain'], 'default: all shareable');
  assert.deepEqual(curatedPackEntries(entries, { expertiseOnly: true }).map((e) => e.id), ['exp1', 'exp2'], 'expertise-only curates');

  const { json } = await exportPackText(entries, 'ada', '1.0.0', { expertiseOnly: true });
  const pack = JSON.parse(json);
  assert.equal(pack.manifest.entry_count, 2, 'export honors curation');
  assert.ok(!json.includes('pers') && !json.includes('plain'), 'personal and non-expertise stay out');
  await assert.rejects(() => exportPackText([entry({ id: 'x', type: 'goal-note' })], 'ada', '1', { expertiseOnly: true }), /expertise/, 'empty curation fails with an expertise message');

  // Store CRUD: packs persist, pin like Paths, record exports for easy updates.
  store.clearAll();
  assert.deepEqual(store.listKnowledgePacks(), [], 'no packs by default — none is created for you');
  const pack1 = store.createKnowledgePack({ name: 'Research methods', author: 'Ada', version: '1.0.0' });
  assert.equal(pack1.expertiseOnly, true, 'new packs default to expertise-only curation');
  assert.equal(pack1.pinned, false);
  const pack2 = store.createKnowledgePack({ name: 'Everything shareable' });
  store.updateKnowledgePack(pack2.id, { expertiseOnly: false, version: '2.0.0' });
  assert.equal(store.listKnowledgePacks().find((p) => p.id === pack2.id).expertiseOnly, false, 'settings persist');
  store.setKnowledgePackPinned(pack1.id, true);
  assert.equal(store.listKnowledgePacks()[0].id, pack1.id, 'pinned packs sort first, like Paths');
  store.recordPackExport(pack1.id, 7);
  const after = store.listKnowledgePacks().find((p) => p.id === pack1.id);
  assert.equal(after.lastEntryCount, 7, 'export is recorded so updating is one click');
  assert.ok(after.lastExportedAt, 'export time recorded');
  assert.throws(() => store.createKnowledgePack({ name: '  ' }), /name/, 'name required');
  store.deleteKnowledgePack(pack2.id);
  assert.equal(store.listKnowledgePacks().length, 1, 'packs can be deleted');

  // UI wiring: per-pack settings in Legacy, pinned packs as subtabs.
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
  const legacy = html.slice(html.indexOf('id="view-legacy"'), html.indexOf('id="view-guide"'));
  assert.ok(legacy.includes('id="packConfigList"'), 'per-pack settings list in Legacy');
  assert.ok(legacy.includes('id="newPackName"'), 'create-a-pack control present');
  assert.ok(html.includes('id="pinnedPackTabs"'), 'pinned packs get Legacy subtabs');
  assert.ok(main.includes('renderPacks'), 'pack settings are rendered');
  assert.ok(main.includes('data-pack-export'), 'each pack exports with its own settings');
  assert.ok(main.includes('expertiseOnly'), 'expertise curation is wired into export');

  console.log('packs OK: expertise curation, per-pack settings, pinning, recorded exports');
})().catch((err) => { console.error(err); process.exit(1); });
