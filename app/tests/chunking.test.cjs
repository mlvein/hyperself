// Focused regression: chunked uploads keep heading context.
// Covers the flush bug where a post-split chunk lost its "Context:" prefix.
// Run: npm test (compiles src with the project's tsc, no new framework).
const assert = require('node:assert/strict');
const { chunkText } = require('../.test-compiled/ingest.js');

const text = `# Guide\n\n${'Para one. '.repeat(60)}\n\n## Deep\n\n${'Para two. '.repeat(60)}\n\n${'Para three. '.repeat(60)}`;
const chunks = chunkText('Guide', text);
assert.equal(chunks.length, 2, 'long doc splits into two chunks');
assert.equal(chunks[1].title, 'Guide (part 2 of 2)');
assert.ok(
  chunks[1].body.startsWith('Context: Deep'),
  'post-split chunk carries its heading context',
);

const single = chunkText('Short', '# Short\n\nJust a note.');
assert.equal(single.length, 1, 'short doc stays whole');
assert.equal(single[0].title, 'Short');

console.log('chunking regression OK: split titles + heading-context carryover');
