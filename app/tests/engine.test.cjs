// Focused test: local engine selection. WebGPU → WebLLM, no WebGPU → stub,
// and the stub always answers from retrieved entries without any network.
// The real WebLLM load needs a GPU browser, so only selection + fallback are
// asserted here. Run: npm test.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => {
    mem.set(String(k), String(v));
  },
  removeItem: (k) => {
    mem.delete(String(k));
  },
};

const {
  StubEngine,
  initLocalEngine,
  pickEngineKind,
} = require('../.test-compiled/engine.js');

assert.equal(pickEngineKind(true), 'webllm', 'WebGPU present selects WebLLM');
assert.equal(pickEngineKind(false), 'stub', 'no WebGPU selects stub');

const stub = new StubEngine();
const ctx = [
  {
    id: '1',
    type: 'finding',
    title: 'Teardown checklist',
    body: 'Spacing, contrast, touch targets.',
    tag: 'shareable',
    tag_history: [],
    goal_ids: [],
    skill_ids: [],
    people: [],
    source: 'upload',
    embedding_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  },
];

(async () => {
  const draft = await stub.draft('teardown', ctx);
  assert.ok(draft.includes('Teardown checklist'), 'stub drafts from context');
  assert.ok(/Nothing left your browser/.test(draft), 'stub labels local-only');
  const empty = await stub.draft('zzz', []);
  assert.ok(/no matching entries/.test(empty), 'stub handles empty context');

  // In Node there is no navigator.gpu, so init must degrade to the stub.
  const { engine, notice } = await initLocalEngine();
  assert.equal(engine.name, stub.name, 'headless env gets the stub engine');
  assert.ok(/WebGPU unavailable/.test(notice), 'notice explains the fallback');

  console.log('engine OK: selection rule, stub drafts, graceful fallback');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

// --- draft sanitizer: system-prompt echo never reaches the UI ---
{
  const { cleanDraftText } = require('../.test-compiled/engine.js');
  const echoed = 'You are Hyperself, a private on-device assistant. Answer only from the provided entries.\nYou read constantly and mentor junior researchers.';
  assert.equal(cleanDraftText(echoed), 'You read constantly and mentor junior researchers.');
  assert.equal(cleanDraftText('You are Hyperself, a private on-device assistant.'), '');
  assert.equal(cleanDraftText('A normal synthesis.'), 'A normal synthesis.');
  console.log('engine sanitizer OK: system-prompt echo stripped');
}

// --- stub drafts never echo the caller's prompt ---
{
  const { isPromptLeak } = require('../.test-compiled/engine.js');
  void stub
    .draft(
      'Write an overview blurb describing me as a person in a maximum of two sentences, based on ALL my uploaded and linked data. Use second person.',
      ctx,
    )
    .then((out) => {
      assert.ok(!isPromptLeak(out) && !out.includes('overview blurb'), 'stub output is prompt-free');
      console.log('engine prompt-leak OK: stub never echoes prompts');
    });
}
