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
assert.ok(html.includes('data-view="timeline"'), 'Timeline in the main sidebar');
assert.ok(html.includes('id="view-timeline"'), 'timeline view present');
assert.ok(html.includes('data-timeline-mode="summary"') && html.includes('data-timeline-mode="uploaded"'), 'summarized/uploaded toggle');
assert.ok(html.includes('id="timelineTags"'), 'analysis tags surface');
assert.ok(main.includes('currentGaps'), 'gap prompts surface via tags');
assert.ok(main.includes('data-mic-for='), 'microphone buttons attached to inputs');
assert.ok(main.includes('buildTimeline'), 'timeline analysis wired');
assert.ok(main.includes('transcribeAudioBlob'), 'mic uses on-device transcription');
assert.ok(main.includes('getUserMedia'), 'mic capture wired');
assert.ok(main.includes("type: 'journal'"), 'gap memories are journal entries');

// Redesign contract: D3 axis chart, horizontal scroll, filters.
assert.ok(html.includes('id="timelineChart"'), 'D3 chart host present');
assert.ok(html.includes('timeline-scroll'), 'chart scrolls horizontally');
assert.ok(!html.includes('id="timelineDetail"'), 'period details moved into the modal');
assert.ok(html.includes('id="timelineTypeFilters"'), 'entry-type filter toggles present');
assert.ok(main.includes('data-tag-filter='), 'analysis-tag filter toggles present');
assert.ok(main.includes('axisBottom'), 'chart uses the D3 axis component');
assert.ok(main.includes('scaleBand') && main.includes('scaleLinear'), 'chart uses D3 scales');
assert.ok(main.includes('selectedPeriodKey'), 'period selection is interactive');
assert.ok(main.includes('timelineTypeFilter'), 'type filtering is wired');
assert.ok(main.includes('timelineTagFilter'), 'tag filtering is wired');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
assert.ok(css.includes('overflow-x: auto'), 'scroll container styles present');
assert.ok(css.includes('.tl-bar'), 'interactive bar styles present');

// Zoom levels: an explicit granularity override goes down to days.
{
  const entries = [];
  for (let d = 1; d <= 10; d += 1) entries.push(entry(`d${d}`, `2024-06-${String(d).padStart(2, '0')}T00:00:00.000Z`));
  const daily = buildTimeline(entries, 'day');
  assert.equal(daily.granularity, 'day', 'day override honored');
  assert.equal(daily.periods.length, 10, 'one period per day');
  const yearly = buildTimeline(entries, 'year');
  assert.equal(yearly.periods.length, 1, 'year override buckets together');
  const capped = buildTimeline([entry('a', '2010-01-05T00:00:00.000Z'), entry('b', '2026-01-05T00:00:00.000Z')], 'day');
  assert.notEqual(capped.granularity, 'day', 'day view is capped on very long spans');
}

// Expanded interactive view contract.
assert.ok(html.includes('timeline-card'), 'timeline card can break out full-width');
assert.ok(html.includes('timeline-stage'), 'chart stage for overlay controls');
assert.ok(html.includes('timeline-overlay'), 'filters overlay the graph');
assert.ok(html.includes('id="tlZoomIn"') && html.includes('id="tlZoomOut"'), 'zoom controls present');
assert.ok(html.includes('id="timelineModal"'), 'tag side modal present');
assert.ok(main.includes('data-tag-open'), 'clicking a tag opens the modal');
assert.ok(main.includes('openTimelineTagModal'), 'tag modal implemented');
assert.ok(main.includes('timelineZoom'), 'zoom state wired');
assert.ok(css.includes('.timeline-card'), 'full-bleed timeline styles present');
assert.ok(css.includes('#timelineModal'), 'timeline drawer styles present');

// Timeline is a main sidebar view; bottom cards and people pills are
// gone — period and people details appear only in the click modal.
{
  const nav = html.slice(html.indexOf('sidebar-nav'), html.indexOf('</nav>'));
  assert.ok(nav.indexOf('data-view="knowledge"') < nav.indexOf('data-view="timeline"'), 'Timeline below Knowledgebase in the sidebar');
  assert.ok(nav.indexOf('data-view="timeline"') < nav.indexOf('data-view="paths"'), 'Timeline above Paths in the sidebar');
}
assert.ok(html.includes('id="view-timeline"'), 'Timeline is its own main view');
assert.ok(!html.includes('data-sub="timeline"'), 'Timeline no longer a Knowledgebase subtab');
assert.ok(!html.includes('id="timelineGaps"'), 'gap cards below the graph removed');
assert.ok(!html.includes('id="tlAddBtn"'), 'bottom Add-a-memory card removed');
assert.ok(!html.includes('id="timelineDetail"'), 'inline period detail card removed');
assert.ok(main.includes('openPeriodModal'), 'clicking a period opens the modal');
assert.ok(main.includes('modalGapBody'), 'gap memories are added from the modal');
assert.ok(main.includes("kind !== 'people'"), 'people pills no longer render as chips');

console.log('timeline OK: spikes, lulls, gaps, type mix, people met, adaptive granularity');
