// Augmented Paths (post-demo, paid, opt-in): frontier online reasoning over
// a Derived Learning Profile — never over entries. Implements
// docs/AUGMENTED_PATHS.md including the binding Security conditions:
// platform labels/lexicon skills only, allowlisted destinations, BYO key
// (session-memory), per-destination consent, fail-closed validation.
import { StoreError, listSkills } from './store';
import { platformArchetypeLabel, type Archetype, type ArchetypePreference } from './archetypes';
import { SKILL_LEXICON } from './extract';
import type { Entry } from './types';

export const AUGMENTED_KIND = 'hyperself-augmented-paths';
export const AUGMENTED_VERSION = 1;
export const ALLOWED_HOSTS = ['api.baseten.co'];
export const MAX_ASK_LENGTH = 120;

const CONSENT_KEY = 'hyperself.augmented.consent.v1';
const LOG_KEY = 'hyperself.augmented.log.v1';
const SESSION_KEY = 'hyperself.augmented.key.session';

export interface DerivedLearningProfile {
  kind: typeof AUGMENTED_KIND;
  version: number;
  archetypes: Array<{ label: string; strength: string }>;
  skills: Array<{ name: string; entries: number }>;
  patterns: {
    finishing_vs_collecting: string;
    reading_signals: number;
    research_signals: number;
    active_months: number;
    entries_by_type: Record<string, number>;
  };
  request: { ask: string; path_name: string };
}

const READ_RE = /\b(read|reading|finished|annotat)/i;
const COLLECT_RE = /\b(bought|tbr|to-read|unread|shelf|shelves|collected)/i;

export function buildDerivedProfile(
  entries: Entry[],
  archetypes: Archetype[],
  preferences: Record<string, ArchetypePreference>,
  ask: string,
  pathName: string,
): DerivedLearningProfile {
  const live = entries.filter((e) => e.deleted_at === null);
  const confirmed = archetypes
    .filter((a) => preferences[a.id]?.status === 'confirmed')
    .map((a) => ({ label: platformArchetypeLabel(a.id) ?? '', strength: a.strength >= 66 ? 'established' : a.strength >= 33 ? 'emerging' : 'faint' }))
    .filter((a) => a.label);
  const lexiconNames = new Set(SKILL_LEXICON.map((s) => s.name.toLowerCase()));
  const skillById = new Map(listSkills().filter((s) => lexiconNames.has(s.name.toLowerCase())).map((s) => [s.id, s.name]));
  const skillCounts = new Map<string, number>();
  for (const e of live) {
    for (const id of e.skill_ids) {
      const name = skillById.get(id);
      if (name) skillCounts.set(name, (skillCounts.get(name) ?? 0) + 1);
    }
  }
  let read = 0;
  let collect = 0;
  const months = new Set<string>();
  const byType: Record<string, number> = {};
  for (const e of live) {
    const text = `${e.title} ${e.body}`;
    if (READ_RE.test(text)) read += 1;
    if (COLLECT_RE.test(text)) collect += 1;
    months.add(e.created_at.slice(0, 7));
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }
  const profile: DerivedLearningProfile = {
    kind: AUGMENTED_KIND,
    version: AUGMENTED_VERSION,
    archetypes: confirmed.slice(0, 5),
    skills: [...skillCounts.entries()].map(([name, count]) => ({ name, entries: count })).sort((a, b) => b.entries - a.entries).slice(0, 8),
    patterns: {
      finishing_vs_collecting: read === collect ? 'even' : read > collect ? 'finishing-leaning' : 'collecting-leaning',
      reading_signals: read,
      research_signals: live.filter((e) => e.type === 'research' || e.type === 'finding').length,
      active_months: months.size,
      entries_by_type: byType,
    },
    request: { ask: ask.trim().slice(0, MAX_ASK_LENGTH), path_name: pathName.slice(0, 60) },
  };
  assertDerivedOnly(profile);
  return profile;
}

const TOP_KEYS = new Set(['kind', 'version', 'archetypes', 'skills', 'patterns', 'request']);
const PATTERN_KEYS = new Set(['finishing_vs_collecting', 'reading_signals', 'research_signals', 'active_months', 'entries_by_type']);

/** Fail-closed: anything outside the allowlisted schema is rejected. */
export function assertDerivedOnly(payload: unknown): void {
  const fail = (why: string): never => {
    throw new StoreError(`Augmented payload rejected: ${why}. Nothing was sent.`);
  };
  if (!payload || typeof payload !== 'object') fail('not an object');
  const p = payload as Record<string, unknown>;
  for (const key of Object.keys(p)) if (!TOP_KEYS.has(key)) fail(`unexpected field "${key}"`);
  if (p.kind !== AUGMENTED_KIND || p.version !== AUGMENTED_VERSION) fail('kind/version mismatch');
  const checkStrings = (value: unknown, path: string): void => {
    if (typeof value === 'string' && value.length > MAX_ASK_LENGTH) fail(`string too long at ${path}`);
    if (Array.isArray(value)) value.forEach((v, i) => checkStrings(v, `${path}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) checkStrings(v, `${path}.${k}`);
    }
  };
  checkStrings(p.archetypes, 'archetypes');
  checkStrings(p.skills, 'skills');
  const patterns = p.patterns as Record<string, unknown> | undefined;
  if (!patterns) fail('patterns missing');
  const patternKeys = Object.keys(patterns as Record<string, unknown>);
  for (const key of patternKeys) if (!PATTERN_KEYS.has(key)) fail(`unexpected pattern "${key}"`);
  const request = p.request as Record<string, unknown> | undefined;
  if (!request || typeof request.ask !== 'string' || request.ask.length > MAX_ASK_LENGTH) fail('ask missing/too long');
}

// --- destination, consent, key (Security conditions 3, 4, 6) ---

export function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return '';
  }
}

export function isAllowedHost(endpoint: string): boolean {
  return ALLOWED_HOSTS.includes(hostOf(endpoint));
}

interface ConsentStore {
  consents: Record<string, string>;
}

function loadConsents(): ConsentStore {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) return JSON.parse(raw) as ConsentStore;
  } catch {
    // fall through
  }
  return { consents: {} };
}

export function hasConsent(endpoint: string): boolean {
  return Boolean(loadConsents().consents[hostOf(endpoint)]);
}

export function recordConsent(endpoint: string): void {
  const store = loadConsents();
  store.consents[hostOf(endpoint)] = new Date().toISOString();
  localStorage.setItem(CONSENT_KEY, JSON.stringify(store));
}

let memoryKey: string | null = null;

export function setAugmentedKey(key: string, rememberSession: boolean): void {
  memoryKey = key.trim() || null;
  try {
    if (rememberSession && memoryKey) sessionStorage.setItem(SESSION_KEY, memoryKey);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Memory-only still works.
  }
}

export function getAugmentedKey(): string | null {
  if (memoryKey) return memoryKey;
  try {
    memoryKey = sessionStorage.getItem(SESSION_KEY);
  } catch {
    // ignore
  }
  return memoryKey;
}

/** Kill switch: revokes consent and forgets the key entirely. */
export function revokeAugmented(): void {
  memoryKey = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // ignore
  }
}

export interface AugmentedLogEntry {
  host: string;
  model: string;
  bytes: number;
  at: string;
}

export function listAugmentedLog(): AugmentedLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) return JSON.parse(raw) as AugmentedLogEntry[];
  } catch {
    // ignore
  }
  return [];
}

function logSend(entry: AugmentedLogEntry): void {
  const log = [...listAugmentedLog(), entry].slice(-50);
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    // Logging is best-effort; the send already happened with consent.
  }
}

export interface AugmentedConfig {
  endpoint: string;
  model: string;
}

export const DEFAULT_AUGMENTED_CONFIG: AugmentedConfig = {
  endpoint: 'https://api.baseten.co/v1',
  model: 'muse-spark',
};

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Eligible v1 asks: learning/research only (PM condition). */
export function isAugmentableAsk(text: string): boolean {
  return /\b(learn|learning|study|studying|research|course|skill|skills|read|reading|work|working|workflow|habits?)\b/i.test(text);
}

export async function sendAugmented(
  profile: DerivedLearningProfile,
  cfg: AugmentedConfig,
  fetchFn: FetchFn = (input, init) => fetch(input, init),
): Promise<{ text: string; payloadBytes: string }> {
  assertDerivedOnly(profile);
  const apiKey = getAugmentedKey();
  if (!apiKey) throw new StoreError('Add your provider API key first (Augmented Paths, Step 1).');
  if (!isAllowedHost(cfg.endpoint) && !hasConsent(cfg.endpoint)) {
    throw new StoreError(`Destination ${hostOf(cfg.endpoint)} is not allowlisted — confirm it in the consent sheet first.`);
  }
  const payloadBytes = JSON.stringify(profile);
  const res = await fetchFn(`${cfg.endpoint.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: 'system',
          content:
            'You design personalized learning and research paths from pattern profiles. ' +
            'Use only the profile provided; invent no facts about the person. Be concrete, sequence steps, and fit the plan to their finishing/collecting pattern.',
        },
        { role: 'user', content: payloadBytes },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new StoreError(`Provider returned HTTP ${res.status}. Nothing was stored.`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new StoreError('Provider returned an empty reply. Nothing was stored.');
  logSend({ host: hostOf(cfg.endpoint), model: cfg.model, bytes: payloadBytes.length, at: new Date().toISOString() });
  return { text, payloadBytes };
}
