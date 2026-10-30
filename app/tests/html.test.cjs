// Apple Journal HTML exports: title/date/body extraction + journal ingest.
const assert = require('node:assert/strict');
const { htmlToText, parseJournalHtml, isHtmlFilename } = require('../.test-compiled/html.js');
const { ingestDoc } = require('../.test-compiled/ingest.js');

const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const SAMPLE = `<!DOCTYPE html><html><head><title>Morning pages</title>
<style>.p1{color:red}</style><script>track()</script></head>
<body><div class="journal-entry">
<p class="date">January 12, 2024 at 7:42 AM</p>
<h1>Morning pages</h1>
<p>Woke before the alarm &amp; wrote three pages. The <b>quiet</b> felt earned.</p>
<p>Second thought: call Ana about Sunday.</p>
<ul><li>Stretch</li><li>Read one chapter</li></ul>
</div></body></html>`;

assert.ok(isHtmlFilename('entry.HTML') && !isHtmlFilename('notes.md'), 'html detection');
const text = htmlToText(SAMPLE);
assert.ok(!/track\(\)|color:red/.test(text), 'scripts and styles stripped');
assert.ok(text.includes('Woke before the alarm & wrote'), 'entities decoded, tags gone');
assert.ok(/- Stretch/.test(text), 'list items preserved');

const page = parseJournalHtml(SAMPLE, 'entry-2024.html');
assert.equal(page.title, 'Morning pages', 'title from document');
assert.equal(page.date, '2024-01-12T07:42:00', 'journal date extracted');
assert.ok(page.text.startsWith('# Morning pages'), 'heading seeded for title extraction');

// Ingested as a journal entry dated from the document, not import day.
ingestDoc('entry-2024.html', page.text, { type: 'journal', at: page.date ?? undefined });
const db = JSON.parse(mem.get('hyperself.v1'));
const entry = db.entries.find((e) => e.source_label === 'entry-2024.html');
assert.equal(entry.type, 'journal', 'stored as journal');
assert.ok(entry.created_at.startsWith('2024-01-12'), 'dated from export, not today');

console.log('html OK: Apple Journal title/date/body, journal ingest');
