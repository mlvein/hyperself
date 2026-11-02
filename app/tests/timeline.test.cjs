// Timeline analysis: periods over the knowledgebase with spikes, lulls,
// gaps, type mix, and people-first-met tags. Gap threshold starts at a
// year and tightens as the user provides more data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildTimeline, gapThresholdFor } = require('../.test-compiled/timeline.js');

function entry(id, at, type = 'document', people = []) {
  return {
    id, type, title: id, body: `body ${id}`, tag: 'personal', tag_history: [], goal_ids: [], skill_ids: [],
    people, source: 'upload', embedding_status: 'pending', created_at: at, updated_at: at, deleted_at: null,
  };
}

// Empty and single-entry knowledgebases are honest, not crashy.
assert.equal(buildTimeline([]).periods.length, 0);
assert.equal(buildTimeline([entry('a', '2026-01-10T00:00:00.000Z')]).periods.length, 1);

// Gap threshold: a year at first, finer as more data arrives.
assert.equal(gapThresholdFor(10), 12);
assert.equal(gapThresholdFor(79), 12);
assert.equal(gapThresholdFor(80), 6);
assert.equal(gapThresholdFor(250), 3);

// A 14-month silence between two clusters is a gap at the default limit.
{
  const entries = [
    entry('a', '2024-01-05T00:00:00.000Z'),
    entry('b', '2024-01-20T00:00:00.000Z'),
    entry('c', '2025-03-10T00:00:00.000Z'),
  ];
  const tl = buildTimeline(entries);
  assert.equal(tl.gapThresholdMonths, 12);
  assert.equal(tl.gaps.length, 1, 'one long gap detected');
  assert.ok(tl.gaps[0].months >= 12, 'gap spans the silent months');
  assert.ok(tl.tags.some((t) => t.kind === 'gap'), 'gap becomes an analysis tag');
}

// A burst month is a spike; people are "met" in their first-mention period.
{
  const entries = [entry('base', '2024-01-05T00:00:00.000Z')];
  for (let i = 0; i < 8; i += 1) entries.push(entry(`s${i}`, `2024-06-${10 + i}T00:00:00.000Z`, 'research', i === 0 ? ['Priya Nair'] : []));
  entries.push(entry('later', '2024-12-05T00:00:00.000Z', 'document', ['Priya Nair']));
  const tl = buildTimeline(entries);
  assert.ok(tl.tags.some((t) => t.kind === 'spike'), 'burst month tagged as spike');
  const june = tl.periods.find((p) => p.key === '2024-06');
  assert.equal(june.total, 8);
  assert.equal(june.dominantType, 'research', 'period knows its dominant type');
  assert.deepEqual(june.peopleMet, ['Priya Nair'], 'first mention in June');
  assert.ok(tl.tags.some((t) => t.kind === 'people' && t.label.includes('Priya Nair')), 'people-met tag emitted');
  assert.ok(tl.tags.some((t) => t.kind === 'mix'), 'type-mix tag emitted for the research-heavy month');
}

// Granularity coarsens over long spans.
{
  const entries = [entry('a', '2010-01-05T00:00:00.000Z'), entry('b', '2026-01-05T00:00:00.000Z')];
  assert.equal(buildTimeline(entries).granularity, 'year', 'decades view by year');
  const mid = [entry('a', '2020-01-05T00:00:00.000Z'), entry('b', '2026-01-05T00:00:00.000Z')];
  assert.equal(buildTimeline(mid).granularity, 'quarter', 'multi-year views by quarter');
}

// UI contract: Timeline subtab, summarized/uploaded toggle, gap prompts, mic.
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
assert.ok(html.includes('data-sub="timeline"'), 'Timeline in the Knowledgebase submenu');
assert.ok(html.includes('id="sub-timeline"'), 'timeline pane present');
assert.ok(html.includes('data-timeline-mode="summary"') && html.includes('data-timeline-mode="uploaded"'), 'summarized/uploaded toggle');
assert.ok(html.includes('id="timelineTags"'), 'analysis tags surface');
assert.ok(html.includes('id="timelineGaps"'), 'gap prompts surface');
assert.ok(html.includes('data-mic-for='), 'microphone buttons attached to inputs');
assert.ok(main.includes('buildTimeline'), 'timeline analysis wired');
assert.ok(main.includes('transcribeAudioBlob'), 'mic uses on-device transcription');
assert.ok(main.includes('getUserMedia'), 'mic capture wired');
assert.ok(main.includes("type: 'journal'"), 'gap memories are journal entries');

console.log('timeline OK: spikes, lulls, gaps, type mix, people met, adaptive granularity');
