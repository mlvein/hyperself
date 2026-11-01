// Common-format parsers: RTF, JSON exports, ICS calendars, VCF contacts.
const assert = require('node:assert/strict');
const { rtfToText, jsonToText, parseIcs, parseVcf, isDocumentFilename, mboxToText, healthXmlToText, stripJsAssignment, unzipTextEntries } = require('../.test-compiled/formats.js');

assert.ok(isDocumentFilename('labs.PDF') && isDocumentFilename('calendar.ics'), 'new formats accepted');
assert.ok(isDocumentFilename('takeout.zip') && isDocumentFilename('mail.mbox') && isDocumentFilename('export.xml') && isDocumentFilename('tweets.js'), 'export formats accepted');
assert.ok(!isDocumentFilename('song.mp3'), 'audio still routed separately');

const rtf = String.raw`{\rtf1\ansi\deff0 {\fonttbl {\f0 Arial;}}\f0\fs24 Hello \'e9t\'e9 \u8212 done.\par Second line.}`;
const rtfText = rtfToText(rtf);
assert.ok(rtfText.includes('Hello') && rtfText.includes('Second line.'), 'rtf text extracted');
assert.ok(!/fonttbl|rtf1/.test(rtfText), 'rtf control data stripped');

const jsonText = jsonToText(
  JSON.stringify({ notes: [{ title: 'Trip', body: 'Packed light, walked everywhere.' }], meta: { id: 'x1' } }),
  'Export',
);
assert.ok(jsonText.includes('Trip') && jsonText.includes('Packed light'), 'json export flattened');
assert.equal(jsonToText('{not json', 'Export'), '', 'invalid json refuses cleanly');

const ics = [
  'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20240315T090000', 'SUMMARY:Dentist\\, checkup',
  'LOCATION:Clinic', 'END:VEVENT', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20240320',
  'SUMMARY:Flight home', 'END:VEVENT', 'END:VCALENDAR',
].join('\r\n');
const events = parseIcs(ics);
assert.equal(events.length, 2, 'ics events parsed');
assert.equal(events[0].title, 'Dentist, checkup');
assert.equal(events[0].date, '2024-03-15T09:00:00');
assert.equal(events[1].date, '2024-03-20T12:00:00');

const vcf = [
  'BEGIN:VCARD', 'FN:Priya Nair', 'ORG:Design Co', 'EMAIL:priya@example.com', 'TEL:+1 555 0100', 'END:VCARD',
  'BEGIN:VCARD', 'FN:Ana Reyes', 'END:VCARD',
].join('\n');
const contacts = parseVcf(vcf);
assert.equal(contacts.length, 2);
assert.equal(contacts[0].name, 'Priya Nair');
assert.equal(contacts[0].org, 'Design Co');

console.log('formats OK: rtf, json exports, ics events, vcf contacts');

// --- export formats: mbox, health XML, X-archive JS, ZIP unpacking ---
{
  const mbox = [
    'From alice@example.com Mon Jan 1 09:00:00 2024',
    'Subject: Hello there', 'From: alice@example.com', 'Date: Mon, 1 Jan 2024 09:00:00 +0000', '',
    'First body line.', '',
    'From bob@example.com Tue Jan 2 09:00:00 2024',
    'Subject: Second note', 'From: bob@example.com', 'Date: Tue, 2 Jan 2024 09:00:00 +0000', '',
    'Second body.',
  ].join('\n');
  const mail = mboxToText(mbox);
  assert.ok(mail.includes('Hello there') && mail.includes('First body line.'), 'mbox subjects + bodies extracted');
  assert.ok(mail.includes('Second note'), 'mbox second message extracted');
  assert.equal(mboxToText(''), '', 'empty mbox refuses cleanly');

  const xml = '<?xml version="1.0"?><HealthData>'
    + '<Record type="HKQuantityTypeIdentifierStepCount" unit="count" value="100" startDate="2024-01-01 08:00:00 +0000"/>'
    + '<Record type="HKQuantityTypeIdentifierStepCount" unit="count" value="250" startDate="2024-01-02 08:00:00 +0000"/>'
    + '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleep" startDate="2024-01-02 23:00:00 +0000"/>'
    + '</HealthData>';
  const health = healthXmlToText(xml);
  assert.ok(health.includes('StepCount: 2 records') && health.includes('total 350 count'), 'health XML summarized by type');
  assert.ok(healthXmlToText('<note><text>plain</text></note>').includes('plain'), 'generic XML falls back to text');

  const js = 'window.YTD.tweets.part0 = [{"tweet":{"full_text":"hello from archive"}}]';
  assert.ok(stripJsAssignment(js).startsWith('['), 'js assignment stripped');
  assert.ok(jsonToText(js, 'tweets.js').includes('hello from archive'), 'X archive js flattened');
}

(async () => {
  const { zipSync, strToU8 } = require('fflate');
  const zip = zipSync({
    'Takeout/Mail/inbox.mbox': strToU8('From a@b.c Mon Jan 1 09:00:00 2024\nSubject: Zipped mail\nFrom: a@b.c\nDate: Mon, 1 Jan 2024\n\nBody in zip.'),
    'notes/hello.md': strToU8('# Zipped note\n\nReadable markdown.'),
    'data/tweets.js': strToU8('window.YTD.tweets.part0 = [{"tweet":{"full_text":"zipped tweet"}}]'),
    'photo.png': new Uint8Array([137, 80, 78, 71]),
  });
  const entries = await unzipTextEntries(new Blob([zip]));
  const names = entries.map((e) => e.name);
  assert.ok(names.some((n) => n.endsWith('inbox.mbox')) && names.some((n) => n.endsWith('hello.md')), 'zip text members unpacked');
  assert.ok(!names.some((n) => n.endsWith('.png')), 'binary members skipped');
  assert.ok(entries.find((e) => e.name.endsWith('tweets.js')).text.includes('zipped tweet'), 'zip member text preserved');
  console.log('export formats OK: mbox, health XML, X js, ZIP unpacking');
})().catch((err) => { console.error(err); process.exit(1); });
