// Timeline analysis over the knowledgebase: continuous periods with
// counts by type, dominant type, and people first met — plus analysis
// tags for spikes, lulls, type mix, and gaps. The gap threshold starts
// at a year and tightens (6, then 3 months) as the archive grows, so
// prompts to fill gaps get more granular the more data there is.
import type { Entry } from './types';

export type TimelineGranularity = 'day' | 'month' | 'quarter' | 'year';

/** Zoom levels from coarsest to finest. */
export const GRANULARITY_LEVELS: TimelineGranularity[] = ['year', 'quarter', 'month', 'day'];

export interface TimelinePeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  total: number;
  byType: Record<string, number>;
  dominantType: string | null;
  peopleMet: string[];
}

export interface TimelineGap {
  from: string;
  to: string;
  months: number;
  label: string;
}

export interface TimelineTag {
  kind: 'spike' | 'lull' | 'gap' | 'mix' | 'people';
  label: string;
  detail: string;
  from: string;
  to: string;
}

export interface Timeline {
  granularity: TimelineGranularity;
  gapThresholdMonths: number;
  periods: TimelinePeriod[];
  gaps: TimelineGap[];
  tags: TimelineTag[];
}

export function gapThresholdFor(entryCount: number): number {
  if (entryCount >= 200) return 3;
  if (entryCount >= 80) return 6;
  return 12;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BUCKET_MONTHS: Record<TimelineGranularity, number> = { day: 1 / 30.44, month: 1, quarter: 3, year: 12 };
const MAX_PERIODS = 1200;

function bucketOf(date: Date, granularity: TimelineGranularity): { key: string; start: Date; label: string } {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (granularity === 'day') {
    const d = date.getUTCDate();
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { key, start: new Date(Date.UTC(y, m, d)), label: `${d} ${MONTHS[m]} ${y}` };
  }
  if (granularity === 'year') return { key: `${y}`, start: new Date(Date.UTC(y, 0, 1)), label: `${y}` };
  if (granularity === 'quarter') {
    const q = Math.floor(m / 3);
    return { key: `${y}-Q${q + 1}`, start: new Date(Date.UTC(y, q * 3, 1)), label: `Q${q + 1} ${y}` };
  }
  return {
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(y, m, 1)),
    label: `${MONTHS[m]} ${y}`,
  };
}

function addBucket(date: Date, granularity: TimelineGranularity): Date {
  if (granularity === 'day') return new Date(date.getTime() + 86_400_000);
  const months = granularity === 'year' ? 12 : granularity === 'quarter' ? 3 : 1;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildTimeline(entries: Entry[], preferred?: TimelineGranularity): Timeline {
  const live = entries
    .filter((e) => e.deleted_at === null)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const gapThresholdMonths = gapThresholdFor(live.length);
  if (!live.length) return { granularity: preferred ?? 'month', gapThresholdMonths, periods: [], gaps: [], tags: [] };

  const first = new Date(live[0].created_at);
  const last = new Date(live[live.length - 1].created_at);
  const spanMonths = (last.getUTCFullYear() - first.getUTCFullYear()) * 12 + (last.getUTCMonth() - first.getUTCMonth()) + 1;
  let granularity: TimelineGranularity = preferred ?? (spanMonths <= 36 ? 'month' : spanMonths <= 144 ? 'quarter' : 'year');
  // Zooming in is capped: never build an unreadable wall of periods.
  while (spanMonths / BUCKET_MONTHS[granularity] > MAX_PERIODS && granularity !== 'year') {
    granularity = GRANULARITY_LEVELS[Math.max(0, GRANULARITY_LEVELS.indexOf(granularity) - 1)];
  }
  const bucketMonths = BUCKET_MONTHS[granularity];

  // First mention of each person, across the whole archive.
  const firstSeen = new Map<string, string>();
  for (const e of live) {
    for (const person of e.people ?? []) {
      if (!firstSeen.has(person)) firstSeen.set(person, e.created_at);
    }
  }

  const periods: TimelinePeriod[] = [];
  const byKey = new Map<string, TimelinePeriod>();
  let cursor = bucketOf(first, granularity).start;
  const lastStart = bucketOf(last, granularity).start;
  while (cursor <= lastStart) {
    const b = bucketOf(cursor, granularity);
    const period: TimelinePeriod = {
      key: b.key,
      label: b.label,
      start: b.start.toISOString(),
      end: addBucket(b.start, granularity).toISOString(),
      total: 0,
      byType: {},
      dominantType: null,
      peopleMet: [],
    };
    periods.push(period);
    byKey.set(period.key, period);
    cursor = addBucket(cursor, granularity);
  }
  for (const e of live) {
    const period = byKey.get(bucketOf(new Date(e.created_at), granularity).key);
    if (!period) continue;
    period.total += 1;
    period.byType[e.type] = (period.byType[e.type] ?? 0) + 1;
  }
  for (const [person, at] of firstSeen) {
    const period = byKey.get(bucketOf(new Date(at), granularity).key);
    if (period) period.peopleMet.push(person);
  }
  for (const period of periods) {
    period.peopleMet.sort();
    const top = Object.entries(period.byType).sort((a, b) => b[1] - a[1])[0];
    period.dominantType = top ? top[0] : null;
  }

  const tags: TimelineTag[] = [];
  const med = median(periods.map((p) => p.total));
  for (const period of periods) {
    if (period.total >= 5 && period.total >= Math.max(5, med * 2)) {
      tags.push({
        kind: 'spike',
        label: `Spike in ${period.label}`,
        detail: `${period.total} entries arrived in this period — well above your usual pace.`,
        from: period.start,
        to: period.end,
      });
    }
    if (period.dominantType && period.total >= 4 && (period.byType[period.dominantType] ?? 0) / period.total >= 0.6) {
      tags.push({
        kind: 'mix',
        label: `Mostly ${period.dominantType} in ${period.label}`,
        detail: `${period.byType[period.dominantType]} of ${period.total} entries this period were ${period.dominantType}.`,
        from: period.start,
        to: period.end,
      });
    }
    if (period.peopleMet.length) {
      tags.push({
        kind: 'people',
        label: `You met ${period.peopleMet.join(', ')}`,
        detail: `First mentioned in ${period.label}.`,
        from: period.start,
        to: period.end,
      });
    }
  }

  // Gaps are fully silent runs; lulls are long runs of barely-anything
  // (exactly one entry per period). The two never overlap.
  const gaps: TimelineGap[] = [];
  let run: TimelinePeriod[] = [];
  const flushGap = (): void => {
    if (!run.length) return;
    const months = run.length * bucketMonths;
    const from = run[0].start;
    const to = run[run.length - 1].end;
    const label = run.length === 1 ? run[0].label : `${run[0].label} – ${run[run.length - 1].label}`;
    if (months >= gapThresholdMonths) {
      gaps.push({ from, to, months, label });
      tags.push({
        kind: 'gap',
        label: `Gap: ${label}`,
        detail: `No entries for about ${months} months. Anything worth remembering from then?`,
        from,
        to,
      });
    }
    run = [];
  };
  for (const period of periods) {
    if (period.total === 0) run.push(period);
    else flushGap();
  }
  flushGap();

  let lull: TimelinePeriod[] = [];
  const flushLull = (): void => {
    if (!lull.length) return;
    const months = lull.length * bucketMonths;
    if (months >= gapThresholdMonths) {
      const label = lull.length === 1 ? lull[0].label : `${lull[0].label} – ${lull[lull.length - 1].label}`;
      tags.push({
        kind: 'lull',
        label: `Lull: ${label}`,
        detail: `Very little was recorded over about ${months} months — one entry per period at most.`,
        from: lull[0].start,
        to: lull[lull.length - 1].end,
      });
    }
    lull = [];
  };
  for (const period of periods) {
    if (period.total === 1) lull.push(period);
    else flushLull();
  }
  flushLull();

  tags.sort((a, b) => a.from.localeCompare(b.from));
  return { granularity, gapThresholdMonths, periods, gaps, tags };
}
