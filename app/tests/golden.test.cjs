// Golden evals (AGENTS.md QA): must-mention + must-never-reveal cases over
// the pack export, cloud scrub, and Paths insights. Fixtures only.
// Run: npm test.
const assert = require('node:assert/strict');
const { exportPackText } = require('../.test-compiled/pack.js');
const { scrubForCloud } = require('../.test-compiled/router.js');
const { buildInsights } = require('../.test-compiled/insights.js');

let n = 0;
const mk = (over) => ({
  id: `g${(n += 1)}`,
  type: 'finding',
  title: `golden ${n}`,
  body: 'public note',
  tag: 'shareable',
  tag_history: [],
  goal_ids: [],
  skill_ids: [],
  people: [],
  source: 'upload',
  embedding_status: 'pending',
  created_at: '2026-10-26T09:00:00',
  updated_at: '2026-10-26T09:00:00',
  deleted_at: null,
  ...over,
});
const SECRET = 'NEVER-REVEAL-THIS-7f3a';
const personal = mk({
  type: 'journal',
  tag: 'personal',
  title: 'diary',
  body: `private thought ${SECRET}`,
  updated_at: '2020-01-01T09:00:00',
  created_at: '2020-01-01T09:00:00',
});
const shareable = mk({ title: 'onboarding method', body: 'pair new hires with a buddy' });

async function main() {
  // 1. must-never-reveal: export contains shareable only, never personal text.
  const { json } = await exportPackText([personal, shareable], 'golden', '1.0.0');
  assert.ok(json.includes('onboarding method'), 'shareable entry exported');
  assert.ok(!json.includes(SECRET) && !json.includes('diary'), 'personal entry never exported');

  // 2. must-never-reveal: scrub withholds personal bodies entirely.
  const { allowed, withheld } = scrubForCloud([personal, shareable]);
  assert.equal(withheld.length, 1, 'personal withheld, not sent');
  assert.ok(!JSON.stringify(allowed).includes(SECRET), 'scrubbed payload has no secret');

  // 3. must-never-reveal: a non-shareable type tagged shareable fails closed.
  const bad = mk({ type: 'health', tag: 'shareable', title: 'labs' });
  assert.throws(() => scrubForCloud([bad]), /shareable/, 'health marked shareable throws');

  // 4. must-mention: stale knowledge surfaces as outdated.
  const staleInsight = buildInsights([personal]).find((i) => i.id.startsWith('stale:'));
  assert.ok(staleInsight && /may be outdated/.test(staleInsight.title), 'stale is mentioned');

  // 5. must-mention: a token-bearing entry is flagged as leaked data.
  const leaky = mk({ tag: 'personal', body: 'deploy key ghp_1234567890abcdefghij rotate me' });
  const sec = buildInsights([leaky]).find((i) => i.id.startsWith('sec:'));
  assert.ok(sec && sec.severity === 'high' && /leaked data/.test(sec.title), 'leak is mentioned');

  // 6. must-mention: sharing exposure is stated when anything is shareable.
  const exposure = buildInsights([shareable]).find((i) => i.id === 'exposure');
  assert.ok(exposure && /You share 1 entry/.test(exposure.title), 'exposure is mentioned');
}

main().then(
  () => console.log('golden OK: must-mention + must-never-reveal (6 cases)'),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
