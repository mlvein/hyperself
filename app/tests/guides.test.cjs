// Export guides: every linked service has a download-your-own-data guide,
// and every format those exports produce is a format the platform reads.
const assert = require('node:assert/strict');

const { EXPORT_GUIDES, guideForProvider, servicesWithUploadGuides } = require('../.test-compiled/guides.js');
const { PROVIDERS } = require('../.test-compiled/connections.js');
const { isDocumentFilename } = require('../.test-compiled/formats.js');
const fs = require('node:fs');
const path = require('node:path');

assert.equal(EXPORT_GUIDES.length, PROVIDERS.length, 'one guide per listed service');
for (const p of PROVIDERS) {
  const g = guideForProvider(p.id);
  assert.ok(g, `guide exists for ${p.id}`);
  assert.ok(g.steps.length >= 3, `${p.id} guide has concrete steps`);
  assert.ok(g.where && g.arrivesAs, `${p.id} guide says where + what arrives`);
  for (const f of g.formats) {
    assert.ok(isDocumentFilename(`export.${f}`), `${p.id} export format .${f} is readable by the platform`);
  }
}
assert.deepEqual(servicesWithUploadGuides().length, PROVIDERS.length, 'service list covers all providers');
assert.ok(guideForProvider('gmail').formats.includes('mbox'), 'gmail guide covers Takeout MBOX');
assert.ok(guideForProvider('health').formats.includes('xml'), 'health guide covers XML export');
assert.ok(guideForProvider('x').formats.includes('js'), 'X guide covers archive JS');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
assert.ok(html.includes('id="exportGuideList"'), 'guides render in Import & Connect');
assert.ok(html.includes('.zip') && html.includes('.mbox'), 'upload input accepts export archives');
assert.ok(main.includes('data-guide-upload'), 'each guide has an upload action');
assert.ok(main.includes('unzipTextEntries'), 'ZIP uploads are unpacked locally');

console.log('guides OK: every service has an export guide; all export formats readable');
