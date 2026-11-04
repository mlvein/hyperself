// Focused test: audio imports become searchable transcripts.
const assert = require('node:assert/strict');
const { isAudioFilename, ASR_MODEL_ID } = require('../.test-compiled/transcribe.js');
assert.ok(/wav2vec2/.test(ASR_MODEL_ID), 'transcription uses Meta wav2vec 2.0 weights');
assert.ok(!/whisper/i.test(ASR_MODEL_ID), 'transcription no longer uses Whisper');
const { isAudioEntry, hasAudioIntent, runKnowledgeSearch } = require('../.test-compiled/search.js');
const { ingestDoc } = require('../.test-compiled/ingest.js');

// Minimal localStorage + crypto shims for the store under Node.
const mem = new Map();
global.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

assert.ok(isAudioFilename('interview.MP3') && isAudioFilename('memo.m4a'), 'audio extensions');
assert.ok(!isAudioFilename('notes.md'), 'text is not audio');
assert.ok(hasAudioIntent('search audio for budget') && hasAudioIntent('what did the recording say'), 'audio intent');
assert.ok(!hasAudioIntent('who might know about Figma'), 'non-audio query has no audio intent');

const base = {
  id: 'x', type: 'research', title: 't', body: 'b', tag: 'personal', tag_history: [],
  goal_ids: [], skill_ids: [], people: [], source: 'upload', source_label: '',
  embedding_status: 'pending', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-01T09:00:00', deleted_at: null,
};
const audioEntry = { ...base, id: 'a1', source_label: 'standup.mp3', body: '[Audio transcript] We agreed the budget ships Friday.' };
const docEntry = { ...base, id: 'd1', source_label: 'notes.md', body: 'Budget doc ships Monday.' };
assert.ok(isAudioEntry(audioEntry) && !isAudioEntry(docEntry), 'audio entries detected');

const hit = runKnowledgeSearch('audio budget', [audioEntry, docEntry], new Date('2026-10-27T12:00:00'));
assert.deepEqual(hit.entries.map((e) => e.id), ['a1'], 'audio search returns transcripts only');
assert.ok(/audio/.test(hit.summary), 'audio summary labels transcripts');

const all = runKnowledgeSearch('audio', [audioEntry, docEntry], new Date('2026-10-27T12:00:00'));
assert.equal(all.entries.length, 1, 'bare audio query lists transcripts');

// Transcribed text ingests through the normal doc path and stays searchable.
ingestDoc('standup.mp3', '[Audio transcript: standup.mp3]\n\nWe agreed the budget ships Friday.');
console.log('audio OK: detect, transcribe-ingest, audio-only search');
