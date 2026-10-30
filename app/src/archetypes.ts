// Archetypes: playful labels for synthesized behaviour patterns.
// Rule-based over entry text + shape (never sent anywhere). Conflicting
// pairs (e.g. Bookworm vs Book Hoarder) resolve to the stronger signal,
// so a collector who never finishes books is never called a Bookworm.
import type { Entry } from './types';

export type ArchetypeTrend = 'rising' | 'steady' | 'fading' | 'emerging';

export interface Archetype {
  id: string;
  label: string;
  evidence: string;
  score: number;
  /** 0-100 normalized signal strength. */
  strength: number;
  /** 0-100 confidence based on evidence volume and data coverage. */
  confidence: number;
  trend: ArchetypeTrend;
  meaning: string;
  watchFor: string;
  /** User-supplied replacement label, when renamed. */
  customLabel?: string;
  confirmed?: boolean;
}

export interface TraitDimension {
  id: string;
  label: string;
  inspiredBy: string;
  score: number;
  confidence: number;
  evidence: string;
  evidenceCount: number;
}

export interface ArchetypeEra {
  label: string;
  startYear: number;
  endYear: number;
  archetypes: Archetype[];
}

export type ArchetypePreferenceStatus = 'confirmed' | 'dismissed';

export interface ArchetypePreference {
  status: ArchetypePreferenceStatus;
  customLabel?: string;
  updated_at: string;
}

export const ARCHETYPE_MEANINGS: Record<string, { meaning: string; watchFor: string }> = {
  bookworm: {
    meaning: 'You process life through books: you read steadily, finish what you start, and let what you read change how you work and relate. Reading is not escape for you; it is how you metabolise experience.',
    watchFor: 'Watch for reading becoming avoidance when a decision is due; your notes usually already hold the answer.',
  },
  'book-hoarder': {
    meaning: 'You collect beginnings: shelves of bought, beloved, mostly unread books. The collection maps your curiosity and ambitions, even when finishing lags behind acquiring.',
    watchFor: 'Watch the gap between buying and finishing; picking one spine a month turns the museum back into a library.',
  },
  'network-weaver': {
    meaning: 'People are your infrastructure: you keep a wide web of family, close friends, and casual ties warm, and connections compound because you maintain them.',
    watchFor: 'Watch for over-weaving; a web this wide needs a few threads you are allowed to let go quiet.',
  },
  'caretaker-anchor': {
    meaning: 'You are the steady point others organise around: care work, health logistics, and relationship maintenance run through you, largely invisibly.',
    watchFor: 'Anchors erode quietly; scheduled rest is part of the job, not a reward after it.',
  },
  'deep-researcher': {
    meaning: 'You go below the surface before forming a view: research and findings dominate because you would rather be accurate than fast.',
    watchFor: 'Watch for research as procrastination; at some point the evidence is sufficient and the decision is the work.',
  },
  'method-maker': {
    meaning: 'You turn private know-how into shared methods others can reuse. Your knowledge compounds publicly, which is why people seek you out.',
    watchFor: 'Keep methods versioned; what worked two pivots ago may mislead someone today.',
  },
  'serial-pivoter': {
    meaning: 'Your life is a series of deliberate turns, not a straight line: you quit, retrain, and restart when the current shape stops fitting, and each pivot reuses the last one.',
    watchFor: 'Name what carries over each time; your continuity is skills and people, not titles.',
  },
  'night-owl': {
    meaning: 'Your thinking sharpens after dark: late-night entries show reflection and making happening when the world is quiet.',
    watchFor: 'Protect sleep like infrastructure; tomorrow-you pays for tonight-you.',
  },
  'early-riser': {
    meaning: 'You front-load the day: early mornings hold your planning, movement, and clearest thinking before demands arrive.',
    watchFor: 'Guard the early hours from other people scheduling over them.',
  },
  wanderer: {
    meaning: 'Movement is a thinking tool: new places reset your perspective and your knowledgebase is stamped with relocations and journeys.',
    watchFor: 'Keep one anchor ritual per place so wandering stays restorative, not rootless.',
  },
  'keeper-of-records': {
    meaning: 'You keep the receipts, literally: documents and finances are ordered so future-you and family can find anything fast.',
    watchFor: 'Records serve decisions; archive what no longer informs one.',
  },
  'skill-collector': {
    meaning: 'You acquire skills the way others acquire hobbies: broadly and joyfully, building an unusual combination over time.',
    watchFor: 'Periodically pick one skill to take deep; breadth plus one depth is your unfair advantage.',
  },
};

const READ_RE = /\b(read|reading|finished|re-read|reread|book club|novel|chapter)\b/i;
const COLLECT_RE = /\b(bought|buy|tbr|to-read pile|shelf|shelves|collection|collecting|unread|hoard)\b/i;
const NIGHT_RE = /\b(midnight|2am|3am|late night|night owl|insomnia|after midnight)\b/i;
const EARLY_RE = /\b(5am|6am|dawn|sunrise|early morning|morning run)\b/i;
const TRAVEL_RE = /\b(flight|moved to|relocated|travel|trip|abroad|new city|visa)\b/i;

function count(entries: Entry[], re: RegExp): number {
  return entries.filter((e) => re.test(`${e.title} ${e.body}`)).length;
}

function countType(entries: Entry[], types: string[]): number {
  return entries.filter((e) => types.includes(e.type)).length;
}

function peopleCount(entries: Entry[]): number {
  return new Set(entries.flatMap((e) => e.people ?? [])).size;
}

interface Rule {
  id: string;
  label: string;
  conflictsWith?: string;
  score: (live: Entry[]) => { score: number; evidence: string };
}

const RULES: Rule[] = [
  {
    id: 'bookworm',
    label: 'Bookworm',
    conflictsWith: 'book-hoarder',
    score: (live) => {
      const read = count(live, READ_RE);
      const collect = count(live, COLLECT_RE);
      const score = read * 2 - collect;
      return { score, evidence: `${read} reading entries vs ${collect} collecting entries` };
    },
  },
  {
    id: 'book-hoarder',
    label: 'Book Hoarder',
    conflictsWith: 'bookworm',
    score: (live) => {
      const read = count(live, READ_RE);
      const collect = count(live, COLLECT_RE);
      const score = collect * 2 - read;
      return { score, evidence: `${collect} collecting/TBR entries vs ${read} finished-reading entries` };
    },
  },
  {
    id: 'network-weaver',
    label: 'Network Weaver',
    score: (live) => {
      const n = peopleCount(live);
      return { score: n >= 12 ? n : 0, evidence: `${n} people woven through the knowledgebase` };
    },
  },
  {
    id: 'caretaker-anchor',
    label: 'Caretaker Anchor',
    score: (live) => {
      const n = countType(live, ['relationship', 'health']);
      return { score: n >= 8 ? n : 0, evidence: `${n} care/relationship entries` };
    },
  },
  {
    id: 'deep-researcher',
    label: 'Deep Researcher',
    score: (live) => {
      const n = countType(live, ['research', 'finding']);
      return { score: n >= 10 ? n : 0, evidence: `${n} research/finding entries` };
    },
  },
  {
    id: 'method-maker',
    label: 'Method Maker',
    score: (live) => {
      const n = live.filter((e) => e.type === 'method' && e.tag === 'shareable').length;
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} shared methods` };
    },
  },
  {
    id: 'serial-pivoter',
    label: 'Serial Pivoter',
    score: (live) => {
      const n = live.filter((e) => /pivot|quit|resign|career|new role|switched|starting over/i.test(`${e.title} ${e.body}`)).length;
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} pivot/turning-point entries` };
    },
  },
  {
    id: 'night-owl',
    label: 'Night Owl',
    score: (live) => {
      const n = count(live, NIGHT_RE);
      return { score: n >= 2 ? n * 3 : 0, evidence: `${n} late-night entries` };
    },
  },
  {
    id: 'early-riser',
    label: 'Early Riser',
    score: (live) => {
      const n = count(live, EARLY_RE);
      return { score: n >= 2 ? n * 3 : 0, evidence: `${n} early-morning entries` };
    },
  },
  {
    id: 'wanderer',
    label: 'Wanderer',
    score: (live) => {
      const n = count(live, TRAVEL_RE);
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} move/travel entries` };
    },
  },
  {
    id: 'keeper-of-records',
    label: 'Keeper of Records',
    score: (live) => {
      const n = countType(live, ['document', 'finance']);
      return { score: n >= 8 ? n : 0, evidence: `${n} document/finance entries kept in order` };
    },
  },
  {
    id: 'skill-collector',
    label: 'Skill Collector',
    score: (live) => {
      const n = countType(live, ['skill']);
      return { score: n >= 5 ? n : 0, evidence: `${n} skills picked up along the way` };
    },
  },
];

function liveEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => e.deleted_at === null && e.ownership !== 'reference');
}

function evidenceCount(evidence: string): number {
  const match = evidence.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function scoreRules(entries: Entry[]): Array<{ rule: Rule; score: number; evidence: string }> {
  return RULES.map((rule) => ({ rule, ...rule.score(entries) })).filter((x) => x.score > 0);
}

function trendFor(rule: Rule, live: Entry[]): ArchetypeTrend {
  if (live.length < 6) return 'emerging';
  const sorted = [...live].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const midpoint = sorted[Math.floor(sorted.length / 2)]?.created_at;
  if (!midpoint) return 'steady';
  const earlier = sorted.filter((e) => e.created_at < midpoint);
  const recent = sorted.filter((e) => e.created_at >= midpoint);
  if (earlier.length === 0 || recent.length === 0) return 'emerging';
  const before = rule.score(earlier).score / earlier.length;
  const now = rule.score(recent).score / recent.length;
  if (before === 0 && now > 0) return 'emerging';
  if (now > before * 1.35) return 'rising';
  if (now < before * 0.65) return 'fading';
  return 'steady';
}

export function computeArchetypes(entries: Entry[], limit = 4): Archetype[] {
  const live = liveEntries(entries);
  if (live.length === 0) return [];
  const scored = scoreRules(live).map(({ rule, score, evidence }) => {
    const count = evidenceCount(evidence);
    const strength = Math.max(1, Math.min(100, Math.round((score / (score + 8)) * 100)));
    const confidence = Math.max(
      5,
      Math.min(98, Math.round(25 + Math.min(45, count * 4) + Math.min(28, live.length))),
    );
    return {
      id: rule.id,
      label: rule.label,
      evidence,
      score,
      strength,
      confidence,
      trend: trendFor(rule, live),
      conflictsWith: rule.conflictsWith,
      ...(ARCHETYPE_MEANINGS[rule.id] ?? { meaning: '', watchFor: '' }),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const picked: Archetype[] = [];
  const blocked = new Set<string>();
  for (const a of scored) {
    if (blocked.has(a.id)) continue;
    const { conflictsWith: _conflictsWith, ...archetype } = a;
    picked.push(archetype);
    if (a.conflictsWith) blocked.add(a.conflictsWith);
    if (picked.length >= limit) break;
  }
  return picked;
}

/** Apply the user's final say: confirmed, renamed, or dismissed ("not me"). */
export function applyArchetypePreferences(
  archetypes: Archetype[],
  preferences: Record<string, ArchetypePreference>,
): Archetype[] {
  return archetypes
    .filter((a) => preferences[a.id]?.status !== 'dismissed')
    .map((a) => {
      const pref = preferences[a.id];
      if (!pref) return a;
      return {
        ...a,
        label: pref.customLabel?.trim() ? pref.customLabel.trim() : a.label,
        customLabel: pref.customLabel?.trim() || undefined,
        confirmed: pref.status === 'confirmed',
      };
    });
}

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

function trait(
  live: Entry[],
  id: string,
  label: string,
  inspiredBy: string,
  countValue: number,
  scale: number,
  evidence: string,
): TraitDimension {
  const score = clampScore((countValue / Math.max(1, live.length)) * scale * 100);
  const confidence = clampScore(20 + Math.min(45, countValue * 4) + Math.min(35, live.length * 1.5));
  return { id, label, inspiredBy, score, confidence, evidence, evidenceCount: countValue };
}

/**
 * Continuous behavioral dimensions inspired by the Big Five/IPIP literature.
 * These are inferred patterns from the user's own entries — not a personality
 * test result, diagnosis, or clinical assessment.
 */
export function computeTraitDimensions(entries: Entry[]): TraitDimension[] {
  const live = liveEntries(entries);
  if (live.length === 0) return [];
  const research = countType(live, ['research', 'finding', 'skill']);
  const curiositySignals = research + count(live, READ_RE) + count(live, TRAVEL_RE);
  const followSignals =
    countType(live, ['method', 'document', 'finance']) + count(live, /\b(finished|completed|done)\b/i);
  const people = peopleCount(live);
  const connectionSignals = people + countType(live, ['relationship']);
  const careSignals = countType(live, ['relationship', 'health']);
  const adaptationSignals =
    live.filter((e) => /pivot|quit|resign|career|new role|switched|starting over|moved to|relocated/i.test(`${e.title} ${e.body}`)).length +
    countType(live, ['skill']);
  return [
    trait(live, 'curiosity', 'Curiosity & openness', 'Big Five Openness (inferred)', curiositySignals, 1.8, `${curiositySignals} curiosity, research, reading, or exploration signals`),
    trait(live, 'follow-through', 'Follow-through & order', 'Big Five Conscientiousness (inferred)', followSignals, 1.8, `${followSignals} method, record, finance, or completion signals`),
    trait(live, 'connection', 'Social connection', 'Big Five Extraversion (inferred)', connectionSignals, 1.5, `${people} people and ${countType(live, ['relationship'])} relationship entries`),
    trait(live, 'care', 'Care & steadiness', 'Big Five Agreeableness (inferred)', careSignals, 1.9, `${careSignals} relationship or health entries`),
    trait(live, 'adaptability', 'Adaptability through change', 'Behavioral change signals', adaptationSignals, 2.0, `${adaptationSignals} pivot, move, or new-skill signals`),
  ].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/** Show how prominent archetypes changed across the user's recorded years. */
export function computeArchetypeTimeline(entries: Entry[]): ArchetypeEra[] {
  const live = liveEntries(entries);
  if (live.length === 0) return [];
  const years = live
    .map((e) => new Date(e.created_at).getFullYear())
    .filter((y) => Number.isFinite(y));
  if (years.length === 0) return [];
  const min = Math.min(...years);
  const max = Math.max(...years);
  if (max - min < 7) {
    return [{ label: `${min}–${max}`, startYear: min, endYear: max, archetypes: computeArchetypes(live, 3) }];
  }
  const eras: ArchetypeEra[] = [];
  const span = max - min + 1;
  const chunk = Math.ceil(span / 3);
  for (let start = min; start <= max; start += chunk) {
    const end = Math.min(max, start + chunk - 1);
    const subset = live.filter((e) => {
      const year = new Date(e.created_at).getFullYear();
      return year >= start && year <= end;
    });
    if (subset.length === 0) continue;
    eras.push({
      label: start === end ? `${start}` : `${start}–${end}`,
      startYear: start,
      endYear: end,
      archetypes: computeArchetypes(subset, 3),
    });
  }
  return eras.filter((era) => era.archetypes.length > 0);
}
