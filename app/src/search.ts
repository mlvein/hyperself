// Local knowledgebase search. Parses plain-language queries and answers from
// entries already on this device — no network, no cloud. Two headline shapes:
//   "people I've met on <date>" → who + entries for that day/range
//   "people I know who might know about <topic>" → who + evidence for a topic
// Anything else falls back to keyword search over title/body/people/type.
import { cosineSimilarity } from './embeddings';
import type { Entry } from './types';

export interface SemanticContext {
  vectors: Record<string, number[]>;
  queryVector: number[];
}

export type SearchKind = 'people-by-date' | 'people-by-topic' | 'general';

export interface ParsedDate {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  label: string;
}

export interface ParsedQuery {
  kind: SearchKind;
  date?: ParsedDate;
  topic?: string;
  tokens: string[];
}

export interface PersonHit {
  name: string;
  entryIds: string[];
  why: string;
}

export interface SearchResult {
  parsed: ParsedQuery;
  people: PersonHit[];
  entries: Entry[];
  summary: string;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const STOP = new Set([
  'a', 'an', 'the', 'i', 'ive', "i've", 'me', 'my', 'we', 'who', 'what',
  'about', 'on', 'in', 'at', 'for', 'to', 'of', 'and', 'or', 'do', 'does',
  'know', 'knows', 'might', 'may', 'people', 'person', 'met', 'meet',
  'with', 'help', 'can', 'could', 'that', 'this',
]);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shiftDay(base: Date, delta: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + delta);
  return d;
}

function monthRange(year: number, month: number): ParsedDate {
  const start = `${year}-${pad(month)}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(last)}`;
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return { start, end, label };
}

/** Best-effort date extraction. Returns null when the query names no date. */
export function extractDate(raw: string, today = new Date()): ParsedDate | null {
  const q = raw.toLowerCase();

  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const label = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    return { start: iso[0], end: iso[0], label };
  }

  const slash = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const m = Number(slash[1]);
    const d = Number(slash[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let y = today.getFullYear();
      if (slash[3] !== undefined) {
        y = Number(slash[3]);
        if (y < 100) y += 2000;
      }
      const start = `${y}-${pad(m)}-${pad(d)}`;
      const label = new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      return { start, end: start, label };
    }
  }

  const named = q.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/,
  );
  if (named) {
    const m = MONTHS[named[1]];
    const d = Number(named[2]);
    const y = named[3] !== undefined ? Number(named[3]) : today.getFullYear();
    if (d >= 1 && d <= 31) {
      const start = `${y}-${pad(m)}-${pad(d)}`;
      const label = new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      return { start, end: start, label };
    }
  }

  if (/\byesterday\b/.test(q)) {
    const s = dayStr(shiftDay(today, -1));
    return { start: s, end: s, label: 'yesterday' };
  }
  if (/\btoday\b/.test(q)) {
    const s = dayStr(today);
    return { start: s, end: s, label: 'today' };
  }
  if (/\blast week\b/.test(q)) {
    return {
      start: dayStr(shiftDay(today, -13)),
      end: dayStr(shiftDay(today, -7)),
      label: 'last week',
    };
  }
  if (/\bthis week\b/.test(q) || /\bpast week\b/.test(q)) {
    return { start: dayStr(shiftDay(today, -6)), end: dayStr(today), label: 'this week' };
  }
  if (/\blast month\b/.test(q)) {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { ...monthRange(d.getFullYear(), d.getMonth() + 1), label: 'last month' };
  }

  const monthOnly = q.match(
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/,
  );
  if (monthOnly && /\b(in|during|for)\b/.test(q)) {
    return monthRange(today.getFullYear(), MONTHS[monthOnly[1]]);
  }
  return null;
}

const TOPIC_PATTERNS: RegExp[] = [
  /who\s+(?:might\s+|may\s+|could\s+)?know\s+(?:about\s+)?(.+?)\??$/,
  /who\s+knows\s+(?:about\s+)?(.+?)\??$/,
  /who\s+can\s+help\s+(?:with|on)\s+(.+?)\??$/,
  /experts?\s+(?:in|on)\s+(.+?)\??$/,
  /familiar\s+with\s+(.+?)\??$/,
  /know\s+someone\s+who\s+knows\s+(?:about\s+)?(.+?)\??$/,
];

export function extractTopic(raw: string): string | null {
  const q = raw.trim().replace(/\s+/g, ' ');
  for (const pattern of TOPIC_PATTERNS) {
    const m = q.toLowerCase().match(pattern);
    if (m?.[1]) {
      const topic = m[1].trim().replace(/[?.!]+$/, '').trim();
      if (topic) return topic;
    }
  }
  return null;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function isAudioEntry(entry: Entry): boolean {
  const label = (entry.source_label ?? '').toLowerCase();
  return (
    /\.(mp3|wav|m4a|aac|ogg|oga|webm|flac|opus)$/.test(label) ||
    entry.body.includes('[Audio transcript]')
  );
}

export function hasAudioIntent(raw: string): boolean {
  return /\b(audio|recording|recordings|transcript|transcripts|voice|spoken|said|say)\b/i.test(raw);
}

export function parseSearchQuery(raw: string, today = new Date()): ParsedQuery {
  const q = raw.trim();
  if (!q) return { kind: 'general', tokens: [] };
  const lower = q.toLowerCase();

  const date = extractDate(q, today);
  const mentionsPeople = /\bpeople\b|\bpersons?\b|\bwho\b|\bmet\b|\bmeet\b|\bknow\b/.test(lower);
  if (date && (/\bmet\b|\bmeet\b/.test(lower) || /\bpeople\b/.test(lower))) {
    return { kind: 'people-by-date', date, tokens: tokenize(q) };
  }
  if (mentionsPeople && /\bmet\b|\bmeet\b/.test(lower)) {
    // "people I've met" without a parseable date: treat as all-time rollup.
    return { kind: 'people-by-date', tokens: tokenize(q) };
  }

  const topic = extractTopic(q);
  if (topic && mentionsPeople) {
    return { kind: 'people-by-topic', topic, tokens: tokenize(topic) };
  }
  return { kind: 'general', tokens: tokenize(q) };
}

function entryDay(entry: Entry): string {
  return (entry.created_at || '').slice(0, 10);
}

function scoreEntry(entry: Entry, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = entry.title.toLowerCase();
  const body = entry.body.toLowerCase();
  const people = (entry.people ?? []).join(' ').toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (title.includes(t)) score += 3;
    if (people.includes(t)) score += 2;
    if (body.includes(t)) score += 1;
    if (entry.type.toLowerCase() === t) score += 2;
  }
  return score;
}

function rollupPeople(entries: Entry[], whyFor: (name: string, ids: string[]) => string): PersonHit[] {
  const byName = new Map<string, string[]>();
  for (const e of entries) {
    for (const name of e.people ?? []) {
      const ids = byName.get(name) ?? [];
      ids.push(e.id);
      byName.set(name, ids);
    }
  }
  return [...byName.entries()]
    .map(([name, entryIds]) => ({ name, entryIds, why: whyFor(name, entryIds) }))
    .sort((a, b) => b.entryIds.length - a.entryIds.length || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export function runKnowledgeSearch(
  raw: string,
  entries: Entry[],
  today = new Date(),
  semantic?: SemanticContext,
): SearchResult {
  const parsed = parseSearchQuery(raw, today);
  const live = entries.filter((e) => e.deleted_at === null);

  if (parsed.kind === 'people-by-date') {
    const inRange = parsed.date
      ? live.filter((e) => {
          const day = entryDay(e);
          return day >= parsed.date!.start && day <= parsed.date!.end;
        })
      : live.filter((e) => (e.people ?? []).length > 0);
    const label = parsed.date ? parsed.date.label : 'all time';
    const people = rollupPeople(
      inRange,
      (name, ids) => `${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} on ${label}`,
    );
    const ranked = [...inRange].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8);
    const summary =
      inRange.length === 0
        ? `No entries found on ${label}.`
        : `${people.length} ${people.length === 1 ? 'person' : 'people'} across ${inRange.length} ${inRange.length === 1 ? 'entry' : 'entries'} on ${label}.`;
    return { parsed, people, entries: ranked, summary };
  }

  const boost = (e: Entry, base: number): number => {
    if (!semantic) return base;
    const vector = semantic.vectors[e.id];
    if (!vector) return base;
    return base + 4 * Math.max(0, cosineSimilarity(vector, semantic.queryVector));
  };

  if (parsed.kind === 'people-by-topic' && parsed.topic) {
    const tokens = tokenize(parsed.topic);
    const scored = live
      .map((e) => ({ e, score: boost(e, scoreEntry(e, tokens)) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 12).map((s) => s.e);
    const people = rollupPeople(
      top,
      (name, ids) => {
        const titles = ids
          .map((id) => top.find((e) => e.id === id)?.title)
          .filter((t): t is string => Boolean(t))
          .slice(0, 2)
          .join('; ');
        return `${ids.length} matching ${ids.length === 1 ? 'entry' : 'entries'}${titles ? `: ${titles}` : ''}`;
      },
    );
    const summary =
      scored.length === 0
        ? `Nobody in your knowledgebase matches "${parsed.topic}" yet.`
        : `${people.length} ${people.length === 1 ? 'person' : 'people'} may know about "${parsed.topic}" (${scored.length} matching ${scored.length === 1 ? 'entry' : 'entries'}).`;
    return { parsed, people, entries: top.slice(0, 8), summary };
  }

  if (hasAudioIntent(raw)) {
    const pool = live.filter(isAudioEntry);
    const tokens = parsed.tokens.filter((t) => !/^(audio|recording|recordings|transcript|transcripts|voice|spoken)$/.test(t));
    const scored = pool
      .map((e) => ({ e, score: tokens.length ? scoreEntry(e, tokens) : 1 }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8).map((s) => s.e);
    const people = rollupPeople(top, (name, ids) => `Tagged on ${ids.length} matching ${ids.length === 1 ? 'entry' : 'entries'}`);
    return {
      parsed,
      people,
      entries: top,
      summary:
        scored.length === 0
          ? 'No audio transcripts match yet. Import a recording in Import & Connect first.'
          : `${scored.length} audio ${scored.length === 1 ? 'transcript matches' : 'transcripts match'}${people.length ? `, ${people.length} ${people.length === 1 ? 'person' : 'people'}` : ''}.`,
    };
  }

  if (parsed.tokens.length === 0) {
    return { parsed, people: [], entries: [], summary: 'Type a question or a few keywords.' };
  }
  const scored = live
    .map((e) => ({ e, score: boost(e, scoreEntry(e, parsed.tokens)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 8).map((s) => s.e);
  const people = rollupPeople(top, (name, ids) => `Tagged on ${ids.length} matching ${ids.length === 1 ? 'entry' : 'entries'}`);
  const summary =
    scored.length === 0
      ? 'No matching entries.'
      : `${scored.length} matching ${scored.length === 1 ? 'entry' : 'entries'}${people.length ? `, ${people.length} ${people.length === 1 ? 'person' : 'people'}` : ''}.`;
  return { parsed, people, entries: top, summary };
}
