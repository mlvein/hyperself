// Focused test: local engine selection. Reachable Muse Glimmer server →
// glimmer engine, unreachable → stub, and the stub always answers from
// retrieved entries without any network. The real Glimmer server needs a
// local Ollama/llama.cpp/vLLM process, so only selection, wire format, and
// fallback are asserted here with a fake fetch. Run: npm test.
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
  GlimmerEngine,
  ReconnectingEngine,
  StubEngine,
  fetchModelList,
  initLocalEngine,
  loadGlimmerConfig,
  pickEngineKind,
  pickServedModel,
  isMetaModel,
  probeGlimmer,
  readChatStream,
  saveGlimmerConfig,
  tierForModel,
} = require('../.test-compiled/engine.js');

assert.equal(pickEngineKind(true), 'glimmer', 'reachable server selects Glimmer');
assert.equal(pickEngineKind(false), 'stub', 'unreachable server selects stub');

// --- config: defaults, persistence, normalization ---
{
  const dflt = loadGlimmerConfig();
  assert.equal(dflt.endpoint, 'http://localhost:11434/v1', 'default endpoint is local Ollama');
  assert.equal(dflt.model, 'muse-glimmer', 'default model is muse-glimmer');
  const saved = saveGlimmerConfig({ endpoint: 'http://localhost:8000/v1/', model: ' muse-glimmer ' });
  assert.equal(saved.endpoint, 'http://localhost:8000/v1', 'endpoint trailing slash trimmed');
  assert.equal(saved.model, 'muse-glimmer', 'model trimmed');
  assert.equal(loadGlimmerConfig().endpoint, 'http://localhost:8000/v1', 'config persists');
  saveGlimmerConfig({ endpoint: 'http://localhost:11434/v1', model: 'muse-glimmer' });
}

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

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: true,
    headers: { get: (h) => (h === 'content-type' ? 'text/event-stream' : null) },
    body,
    json: async () => ({}),
  };
}

(async () => {
  const draft = await stub.draft('teardown', ctx);
  assert.ok(draft.includes('Teardown checklist'), 'stub drafts from context');
  assert.ok(/Nothing left your browser/.test(draft), 'stub labels local-only');
  const empty = await stub.draft('zzz', []);
  assert.ok(/no matching entries/.test(empty), 'stub handles empty context');

  // tiers: model choice follows hardware reality, server decides availability
  assert.equal(tierForModel('muse-glimmer'), 'deep');
  assert.equal(tierForModel('llama3.2:3b'), 'light');
  assert.equal(tierForModel('some-custom-thing'), 'non-meta');
  assert.ok(isMetaModel('muse-glimmer') && isMetaModel('llama3.2:3b') && isMetaModel('meta-llama/Llama-4'), 'Meta models pass the allowlist');
  assert.ok(!isMetaModel('qwen3:8b') && !isMetaModel('gpt-4o') && !isMetaModel('some-custom-thing'), 'non-Meta models fail the allowlist');
  assert.equal(pickServedModel('muse-glimmer', ['qwen3:8b']), '', 'a server with no Meta model offers nothing to call');
  assert.equal(pickServedModel('qwen3:8b', ['qwen3:8b', 'llama3.2:3b']), 'llama3.2:3b', 'non-Meta served models are invisible to the picker');
  assert.equal(pickServedModel('muse-glimmer', ['llama3.2:3b']), 'llama3.2:3b', 'falls to the served light model');
  assert.equal(pickServedModel('llama3.2:3b', ['muse-glimmer', 'llama3.2:3b']), 'llama3.2:3b', 'configured model wins when served');
  assert.equal(pickServedModel('x', []), 'x', 'empty list keeps configured');
  assert.deepEqual(
    await fetchModelList({ endpoint: 'http://x/v1', model: 'm' }, async () => ({ ok: true, json: async () => ({ data: [{ id: 'llama3.2:3b' }, { id: 'muse-glimmer' }] }) })),
    ['llama3.2:3b', 'muse-glimmer'],
    'served models parsed',
  );
  console.log('engine tiers OK: light/deep selection from what the server offers');

  // probe: ok → true, HTTP error / network failure → false
  assert.equal(await probeGlimmer({ endpoint: 'http://x/v1', model: 'm' }, async () => ({ ok: true })), true, 'probe true on ok');
  assert.equal(await probeGlimmer({ endpoint: 'http://x/v1', model: 'm' }, async () => ({ ok: false })), false, 'probe false on HTTP error');
  assert.equal(
    await probeGlimmer({ endpoint: 'http://x/v1', model: 'm' }, async () => { throw new Error('down'); }),
    false,
    'probe false on network failure',
  );

  // streamed draft: SSE deltas accumulate, device-local label appended
  const seen = [];
  const glimmer = new GlimmerEngine({ endpoint: 'http://localhost:11434/v1', model: 'muse-glimmer' }, async (url, init) => {
    seen.push({ url, init });
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n',
      'data: {"choices":[{"delta":{"content":"from Glimmer."}}]}\n',
      'data: [DONE]\n',
    ]);
  });
  const out = await glimmer.draft('teardown', ctx);
  assert.ok(out.startsWith('Hello from Glimmer.'), 'streamed deltas accumulate');
  assert.ok(/Nothing left this device/.test(out), 'glimmer labels device-local');
  assert.equal(seen[0].url, 'http://localhost:11434/v1/chat/completions', 'posts to chat completions');
  const sentBody = JSON.parse(seen[0].init.body);
  assert.equal(sentBody.model, 'muse-glimmer', 'sends configured model');
  assert.equal(sentBody.stream, true, 'requests streaming');
  assert.ok(sentBody.max_tokens >= 1000, 'reasoning headroom in max_tokens');
  assert.ok(JSON.stringify(sentBody.messages).includes('Teardown checklist'), 'context entries are in the prompt');

  // non-streamed JSON fallback (servers that ignore stream)
  const jsonEngine = new GlimmerEngine({ endpoint: 'http://x/v1', model: 'llama3.2:3b' }, async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    body: null,
    json: async () => ({ choices: [{ message: { content: 'Plain reply.' } }] }),
  }));
  assert.ok((await jsonEngine.draft('q', ctx)).startsWith('Plain reply.'), 'JSON response parsed');
  assert.equal(await readChatStream({
    headers: { get: () => 'application/json' },
    body: null,
    json: async () => ({ choices: [{ message: { content: 'x' } }] }),
  }), 'x', 'readChatStream handles JSON');

  // server down / HTTP error / empty reply → stub fallback, never throws
  const down = new GlimmerEngine({ endpoint: 'http://x/v1', model: 'llama3.2:3b' }, async () => { throw new Error('down'); });
  assert.ok((await down.draft('teardown', ctx)).includes('Teardown checklist'), 'network failure falls back to stub');
  const httpErr = new GlimmerEngine({ endpoint: 'http://x/v1', model: 'llama3.2:3b' }, async () => ({ ok: false, headers: { get: () => '' }, body: null, json: async () => ({}) }));
  const nonMeta = new GlimmerEngine({ endpoint: 'http://x/v1', model: 'qwen3:8b' }, async () => { throw new Error('must never be called'); });
  assert.ok((await nonMeta.draft('teardown', ctx)).includes('Teardown checklist'), 'non-Meta model is never called; stub answers instead');
  assert.equal(saveGlimmerConfig({ endpoint: 'http://localhost:11434/v1', model: 'qwen3:8b' }).model, 'muse-glimmer', 'saving a non-Meta model coerces to the Meta default');
  assert.ok((await httpErr.draft('teardown', ctx)).includes('Teardown checklist'), 'HTTP error falls back to stub');
  assert.ok((await glimmer.draft('q', [])).includes('no matching entries'), 'empty context short-circuits to stub');

  // Lazy reconnect: server appears after load -> next draft upgrades in place.
  {
    let serverUp = false;
    let probes = 0;
    const flipFetch = async (url) => {
      if (String(url).endsWith('/models')) {
        probes += 1;
        return { ok: serverUp };
      }
      return sseResponse(['data: {"choices":[{"delta":{"content":"Upgraded reply."}}]}\n', 'data: [DONE]\n']);
    };
    const lazy = new ReconnectingEngine({ endpoint: 'http://localhost:11434/v1', model: 'muse-glimmer' }, flipFetch, { cooldownMs: 0 });
    assert.equal(lazy.name, stub.name, 'starts as stub while server is down');
    const first = await lazy.draft('teardown', ctx);
    assert.ok(first.includes('Teardown checklist'), 'down server drafts via stub');
    serverUp = true;
    const second = await lazy.draft('teardown', ctx);
    assert.ok(second.startsWith('Upgraded reply.'), 'next draft upgrades to Glimmer without reload');
    assert.ok(/muse-glimmer/.test(lazy.name), 'engine name reflects the upgrade');
    const probesAfterUpgrade = probes;
    await lazy.draft('teardown', ctx);
    assert.equal(probes, probesAfterUpgrade, 'no re-probing once connected');
    console.log('engine lazy-reconnect OK: stub upgrades in place when server appears');
  }

  // In Node nothing listens on the default endpoint, so init degrades to stub.
  const { engine, notice } = await initLocalEngine();
  assert.equal(engine.name, stub.name, 'no local server gets the stub engine');
  assert.ok(/Local model server unreachable/.test(notice), 'notice explains the fallback');
  assert.ok(engine instanceof ReconnectingEngine, 'init returns the reconnecting engine');

  console.log('engine OK: glimmer selection, config, streaming draft, graceful fallback');
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

// --- setup UX contract: commands behind a disclosure, copy + re-check wired ---
{
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.ts'), 'utf8');
  assert.ok(html.includes('<details') && html.includes('id="glimmerSetup"'), 'setup steps live behind a disclosure');
  assert.ok(html.includes('Set up deep synthesis'), 'disclosure is labeled for users, not devs');
  assert.ok(html.includes('id="glimmerCopyBtn"'), 'copy-command button present');
  assert.ok(html.includes('id="glimmerCheckBtn"'), 'one-click re-check button present');
  assert.ok(!html.includes('OLLAMA_ORIGINS=*'), 'setup never tells users to open CORS to every origin');
  assert.ok(main.includes("getElementById('glimmerCopyBtn')") && main.includes("getElementById('glimmerCheckBtn')"), 'copy + re-check wired in main');
  assert.ok(html.includes('id="synthesisProgress"') && html.includes('id="synthesisProgressFill"') && html.includes('id="synthesisProgressText"'), 'synthesis progress bar present');
  assert.ok(main.includes('Reading your') && main.includes('Finding patterns') && main.includes('Putting your summary'), 'synthesis stages describe the process');
  assert.ok(main.includes('hideSynthProgress'), 'progress hides when synthesis completes');
  console.log('engine setup UX OK: disclosure, copy button, re-check wired');
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
