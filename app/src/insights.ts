// Paths: local insights over the knowledgebase. Rule-based analyzers turn
// parsed entries into titled findings with actions. No cloud calls — the
// "local LLM" role is local analysis today, Muse Glimmer expounding via Paths.
import { scanEntry } from './security';
import type { Entry } from './types';

export type InsightSeverity = 'info' | 'warn' | 'high';
export type InsightKind = 'goto-library' | 'goto-import' | 'acknowledge' | 'expound';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  entryIds: string[];
  kinds: InsightKind[];
  /** Archetype lens for this insight, when it serves one. */
  archetypeId?: string;
  archetypeLabel?: string;
  /** One concrete next step attached to this specific insight. */
  nextStep?: string;
}

const STALE_DAYS = 90;
const FRESH_DAYS = 7;

function ageDays(entry: Entry): number {
  return (Date.now() - Date.parse(entry.updated_at)) / 86400000;
}

export function buildInsights(entries: Entry[]): Insight[] {
  const insights: Insight[] = [];

  const stale = entries.filter((e) => ageDays(e) > STALE_DAYS).slice(0, 5);
  for (const e of stale) {
    insights.push({
      id: `stale:${e.id}`,
      severity: 'warn',
      title: `\u201C${e.title}\u201D may be outdated`,
      body: `Last updated ${Math.floor(ageDays(e))} days ago. Upload a fresh version, or confirm it still holds.`,
      entryIds: [e.id],
      kinds: ['goto-import', 'acknowledge', 'expound'],
    });
  }

  const risky = entries.filter((e) => scanEntry(e).some((f) => f.level === 'high')).slice(0, 5);
  for (const e of risky) {
    const highs = scanEntry(e).filter((f) => f.level === 'high');
    const messages = highs.map((f) => f.message).join('; ');
    const steps = highs.map((f) => f.suggestion).join(' ');
    const leaked = highs.some((f) => /breach corpus|token|secret|password|key/i.test(f.message));
    insights.push({
      id: `sec:${e.id}`,
      severity: 'high',
      title: leaked ? `\u201C${e.title}\u201D may contain leaked data` : `\u201C${e.title}\u201D needs attention`,
      body: `${messages}. Next step: ${steps} Open the entry in Synthesis to review it, or mark it reviewed if you accept it.`,
      entryIds: [e.id],
      kinds: ['goto-library', 'goto-import', 'acknowledge', 'expound'],
    });
  }


  // Archetype-lensed insights: descriptive only, tied to the lens they serve.
  const rhythms = new Map<string, { count: number; last: string; ids: string[] }>();
  for (const e of entries) {
    for (const name of e.people ?? []) {
      const cur = rhythms.get(name) ?? { count: 0, last: '', ids: [] };
      cur.count += 1;
      cur.ids.push(e.id);
      if (e.created_at > cur.last) cur.last = e.created_at;
      rhythms.set(name, cur);
    }
  }
  const quiet = [...rhythms.entries()]
    .map(([name, v]) => ({ name, ...v, days: Math.floor((Date.now() - Date.parse(v.last)) / 86400000) }))
    .filter((x) => x.count >= 2 && x.days >= 90)
    .sort((a, b) => b.days - a.days)[0];
  if (quiet && rhythms.size >= 12) {
    insights.push({
      id: `archetype:quiet:${quiet.name}`,
      severity: 'info',
      title: `For your Network Weaver side: ${quiet.name} has gone quiet`,
      body: `${quiet.name} appears in ${quiet.count} entries and was last mentioned ${quiet.days} days ago. This is a descriptive recency note — only you know whether it matters.`,
      entryIds: quiet.ids.slice(0, 5),
      kinds: ['goto-library', 'acknowledge', 'expound'],
      archetypeId: 'network-weaver',
      archetypeLabel: 'Network Weaver',
    });
  }

  const readCount = entries.filter((e) => /(read|reading|finished|novel|chapter)/i.test(`${e.title} ${e.body}`)).length;
  const collectCount = entries.filter((e) => /(bought|tbr|to-read pile|shelf|shelves|unread|collection)/i.test(`${e.title} ${e.body}`)).length;
  if (readCount + collectCount >= 3) {
    const hoarding = collectCount > readCount;
    insights.push({
      id: 'archetype:reading-life',
      severity: 'info',
      title: hoarding ? 'For your Book Hoarder side: collecting is outpacing finishing' : 'For your Bookworm side: finishing is your stronger pattern',
      body: `${readCount} reading/finishing signals and ${collectCount} collecting/TBR signals appear in your knowledgebase. The Reading Life Path keeps both visible without prescribing what to read.`,
      entryIds: entries.filter((e) => /(read|reading|finished|novel|chapter|bought|tbr|shelf|unread)/i.test(`${e.title} ${e.body}`)).slice(0, 5).map((e) => e.id),
      kinds: ['goto-library', 'acknowledge', 'expound'],
      archetypeId: hoarding ? 'book-hoarder' : 'bookworm',
      archetypeLabel: hoarding ? 'Book Hoarder' : 'Bookworm',
    });
  }


  const shareable = entries.filter((e) => e.tag === 'shareable');
  if (shareable.length > 0) {
    insights.push({
      id: 'exposure',
      severity: 'info',
      title: `You share ${shareable.length} ${shareable.length === 1 ? 'entry' : 'entries'}`,
      body: 'Review them in Synthesis before each Legacy export. Anything shared can travel.',
      entryIds: shareable.map((e) => e.id),
      kinds: ['goto-library', 'expound'],
    });
  }

  const fresh = entries.filter((e) => ageDays(e) <= FRESH_DAYS);
  if (fresh.length > 0) {
    insights.push({
      id: 'fresh',
      severity: 'info',
      title: `${fresh.length} ${fresh.length === 1 ? 'entry' : 'entries'} fresh this week`,
      body: 'Recently added or updated knowledge. Your Paths are current.',
      entryIds: fresh.slice(0, 5).map((e) => e.id),
      kinds: ['goto-library'],
    });
  }

  return insights;
}

// --- Pin + acknowledge state ---

const PATHS_KEY = 'hyperself.paths.v1';

export interface PathsState {
  pinned: string[];
  acked: Record<string, string>;
  dismissed: Record<string, string>;
}

export function loadPathsState(): PathsState {
  try {
    const raw = localStorage.getItem(PATHS_KEY);
    if (!raw) return { pinned: [], acked: {}, dismissed: {} };
    const parsed = JSON.parse(raw) as Partial<PathsState>;
    return { pinned: parsed.pinned ?? [], acked: parsed.acked ?? {}, dismissed: parsed.dismissed ?? {} };
  } catch {
    return { pinned: [], acked: {}, dismissed: {} };
  }
}

function savePathsState(state: PathsState): void {
  localStorage.setItem(PATHS_KEY, JSON.stringify(state));
}

export function togglePin(id: string): boolean {
  const state = loadPathsState();
  const at = state.pinned.indexOf(id);
  if (at >= 0) {
    state.pinned.splice(at, 1);
  } else {
    state.pinned.push(id);
  }
  savePathsState(state);
  return at < 0;
}

export function acknowledge(id: string): void {
  const state = loadPathsState();
  state.acked[id] = new Date().toISOString();
  savePathsState(state);
}

export function unacknowledge(id: string): void {
  const state = loadPathsState();
  delete state.acked[id];
  savePathsState(state);
}

export function dismissInsight(id: string): void {
  const state = loadPathsState();
  state.dismissed[id] = new Date().toISOString();
  savePathsState(state);
}

export function undismissInsight(id: string): void {
  const state = loadPathsState();
  delete state.dismissed[id];
  savePathsState(state);
}
