// Common-format parsers: RTF, JSON exports, ICS calendars, VCF contacts.
const assert = require('node:assert/strict');
const { rtfToText, jsonToText, parseIcs, parseVcf, isDocumentFilename } = require('../.test-compiled/formats.js');

assert.ok(isDocumentFilename('labs.PDF') && isDocumentFilename('calendar.ics'), 'new formats accepted');
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
