// Paths: local insights over the knowledgebase. Rule-based analyzers turn
// parsed entries into titled findings with actions. No cloud calls — the
// "local LLM" role is local analysis today, WebLLM expounding tomorrow.
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
      body: `${messages}. Next step: ${steps} Open the entry in the Library to amend it, or mark it reviewed if you accept it.`,
      entryIds: [e.id],
      kinds: ['goto-library', 'goto-import', 'acknowledge', 'expound'],
    });
  }

  const shareable = entries.filter((e) => e.tag === 'shareable');
  if (shareable.length > 0) {
    insights.push({
      id: 'exposure',
      severity: 'info',
      title: `You share ${shareable.length} ${shareable.length === 1 ? 'entry' : 'entries'}`,
      body: 'Review them in the Library before each Legacy export. Anything shared can travel.',
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
}

export function loadPathsState(): PathsState {
  try {
    const raw = localStorage.getItem(PATHS_KEY);
    if (!raw) return { pinned: [], acked: {} };
    const parsed = JSON.parse(raw) as Partial<PathsState>;
    return { pinned: parsed.pinned ?? [], acked: parsed.acked ?? {} };
  } catch {
    return { pinned: [], acked: {} };
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
