// Focused test: image imports — EXIF dating + OCR ingest + people tags.
const assert = require('node:assert/strict');
const { parseExifDate, isImageFilename, ocrImageBlob } = require('../.test-compiled/image.js');
const { ingestDoc } = require('../.test-compiled/ingest.js');

const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

assert.ok(isImageFilename('scan.JPEG') && isImageFilename('photo.heic'), 'image extensions');
assert.ok(!isImageFilename('song.mp3'), 'audio is not image');

/** Build a minimal JPEG with an EXIF DateTimeOriginal of 2015:06:07 08:09:10. */
function exifJpeg() {
  const bytes = [];
  const push16 = (v) => bytes.push((v >> 8) & 255, v & 255);
  const pushAscii = (s) => { for (const c of s) bytes.push(c.charCodeAt(0)); };
  push16(0xffd8); // SOI
  push16(0xffe1); // APP1
  push16(0); // length placeholder, patched below
  pushAscii('Exif\0\0');
  const tiffStart = bytes.length; // TIFF header starts right after "Exif\0\0"
  const rel = (abs) => abs - tiffStart;
  pushAscii('II');
  bytes.push(42, 0);
  const ifd0 = bytes.length; bytes.push(8, 0, 0, 0); // IFD0 at TIFF+8
  const exifIfd = tiffStart + 26; const dateStr = tiffStart + 44;
  // IFD0: 1 entry -> ExifIFD pointer (0x8769, type LONG, count 1, value rel offset)
  bytes.push(1, 0);
  bytes.push(0x69, 0x87, 4, 0, 1, 0, 0, 0, rel(exifIfd) & 255, (rel(exifIfd) >> 8) & 255, 0, 0);
  bytes.push(0, 0, 0, 0);
  assert.equal(bytes.length, exifIfd);
  // ExifIFD: 1 entry -> DateTimeOriginal (0x9003, ASCII, 20 bytes, offset)
  bytes.push(1, 0);
  bytes.push(0x03, 0x90, 2, 0, 20, 0, 0, 0, rel(dateStr) & 255, (rel(dateStr) >> 8) & 255, 0, 0);
  bytes.push(0, 0, 0, 0);
  assert.equal(bytes.length, dateStr);
  pushAscii('2015:06:07 08:09:10\0');
  // Patch APP1 length (segment length includes its own 2 bytes, excludes marker)
  const segLen = bytes.length - 4;
  bytes[4] = (segLen >> 8) & 255; bytes[5] = segLen & 255;
  return new Uint8Array(bytes).buffer;
}

assert.equal(parseExifDate(exifJpeg()), '2015-06-07T08:09:10', 'EXIF original date parsed');
assert.equal(parseExifDate(new ArrayBuffer(8)), null, 'non-JPEG has no EXIF date');

// OCR-style text ingests with EXIF dating + people tagging into the network.
ingestDoc('reunion.jpg', '[Image transcript: reunion.jpg]\n\nReunion lunch with the whole family.', {
  people: ['Priya Nair'],
  at: parseExifDate(exifJpeg()),
});
const db = JSON.parse(mem.get('hyperself.v1'));
const entry = db.entries.find((e) => e.source_label === 'reunion.jpg');
assert.ok(entry, 'image entry stored');
assert.ok(entry.created_at.startsWith('2015-06-07'), 'entry dated from EXIF, not today');
assert.deepEqual(entry.people, ['Priya Nair'], 'person tagged for the network');

// OCR calls Muse Glimmer (Meta) on the local server, never a non-Meta engine.
void (async () => {
  let seen = null;
  const text = await ocrImageBlob(new Blob(['fake-jpeg'], { type: 'image/jpeg' }), undefined, async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'Reunion lunch menu' } }] }) };
  });
  assert.equal(text, 'Reunion lunch menu', 'Glimmer OCR text returned');
  assert.equal(seen.body.model, 'muse-glimmer', 'OCR model is Meta Muse Glimmer');
  assert.ok(JSON.stringify(seen.body.messages).includes('image_url'), 'image sent to the local Meta model');
  assert.ok(seen.url.endsWith('/chat/completions'), 'OCR stays on the local server endpoint');
  const down = await ocrImageBlob(new Blob(['x'], { type: 'image/jpeg' }), undefined, async () => ({ ok: false, status: 503, json: async () => ({}) }));
  assert.equal(down, '', 'no Meta server means no OCR text, import still proceeds');
  console.log('image ocr OK: Muse Glimmer vision OCR, fail-soft');
})();

console.log('image OK: EXIF date, OCR ingest, people tagging');
