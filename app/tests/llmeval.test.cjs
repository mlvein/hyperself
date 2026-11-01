// Golden evals for LLM drafting (QA): must-mention, must-cite, and
// must-never-reveal over fixed fixtures. Always runs against StubEngine
// (deterministic). When a Muse Glimmer server answers at
// HYPERSELF_GLIMMER_ENDPOINT (default http://localhost:11434/v1), the SAME
// cases run against the real model; otherwise that half is reported as
// SKIPPED — never silently passed. Run: npm test.
const assert = require('node:assert/strict');

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(String(k)) ? mem.get(String(k)) : null),
  setItem: (k, v) => { mem.set(String(k), String(v)); },
  removeItem: (k) => { mem.delete(String(k)); },
};

const { EVAL_CASES, evaluateDraft } = require('../.test-compiled/llmeval.js');
const { GlimmerEngine, StubEngine, probeGlimmer } = require('../.test-compiled/engine.js');

assert.ok(EVAL_CASES.length >= 5, 'at least five golden cases');
assert.equal(new Set(EVAL_CASES.map((c) => c.id)).size, EVAL_CASES.length, 'case ids unique');
for (const c of EVAL_CASES) {
  assert.ok(c.context.length > 0, `${c.id} has context`);
  assert.ok(
    (c.mustMentionAll?.length ?? 0) + (c.mustMentionAny?.length ?? 0) > 0 || c.mustNeverContain?.length,
    `${c.id} asserts something`,
  );
}

// Checker itself fails closed: a leaking draft must produce failures.
{
  const leak = evaluateDraft(EVAL_CASES[2], 'Summary: Therapy notes NEVER-REVEAL-THIS-9c41');
  assert.ok(leak.some((f) => f.rule === 'must-never-reveal'), 'checker catches a leak');
  const empty = evaluateDraft(EVAL_CASES[0], 'Nothing relevant here.');
  assert.ok(empty.some((f) => f.rule === 'must-mention'), 'checker catches a miss');
}

(async () => {
  const stub = new StubEngine();
  for (const c of EVAL_CASES) {
    const failures = evaluateDraft(c, await stub.draft(c.query, c.context));
    assert.deepEqual(failures, [], `stub case ${c.id}: ${JSON.stringify(failures)}`);
  }
  console.log(`llmeval stub OK: ${EVAL_CASES.length} cases (must-mention / cite / never-reveal)`);

  const endpoint = process.env.HYPERSELF_GLIMMER_ENDPOINT ?? 'http://localhost:11434/v1';
  const model = process.env.HYPERSELF_GLIMMER_MODEL ?? 'muse-glimmer';
  const cfg = { endpoint, model };
  if (!(await probeGlimmer(cfg, undefined, 2000))) {
    console.log(`llmeval real-model SKIPPED: no Muse Glimmer server at ${endpoint} (start Ollama to run the live gate)`);
    return;
  }
  const engine = new GlimmerEngine(cfg);
  const all = [];
  for (const c of EVAL_CASES) {
    const failures = evaluateDraft(c, await engine.draft(c.query, c.context));
    for (const f of failures) all.push(f);
  }
  assert.deepEqual(all, [], `glimmer cases failed: ${JSON.stringify(all, null, 2)}`);
  console.log(`llmeval glimmer OK: ${EVAL_CASES.length} cases against ${model} at ${endpoint}`);
})().catch((err) => { console.error(err); process.exit(1); });
