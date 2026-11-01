// Archetypes: playful labels for synthesized behaviour patterns.
// Rule-based over entry text + shape (never sent anywhere). Conflicting
// pairs (e.g. Margin Annotator vs Shelf Cartographer) resolve to the
// stronger signal, so a collector who never finishes is no annotator.
// Labels are novel-but-familiar coinages; ids before the rename resolve
// through LEGACY_ARCHETYPE_IDS so stored preferences survive.
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
  'margin-annotator': {
    meaning: 'You think in the margins: books become conversations, finished pages turn into decisions, and your annotations are where experience gets metabolised. Reading is not escape for you; it is drafting your next move.',
    watchFor: 'Watch for annotating instead of acting; when the margins are full, the answer is usually already written there.',
  },
  'shelf-cartographer': {
    meaning: 'Your shelves are a map of who you meant to become: bought and beloved beginnings that chart curiosity faster than finishing can follow. The collection is not clutter; it is an atlas of possible selves.',
    watchFor: 'Watch the gap between mapping and travelling; pick one territory a month and actually go there.',
  },
  'keeper-of-threads': {
    meaning: 'You hold the threads between people: introductions remembered, birthdays kept, quiet threads gently re-tied. Your network compounds because you maintain the weave nobody else sees.',
    watchFor: 'Watch for holding every thread yourself; some threads are allowed to rest.',
  },
  'harbor-keeper': {
    meaning: 'You are the harbor others return to: care logistics, health admin, and steady presence run through you, largely invisibly. People organise their storms around your calm.',
    watchFor: 'Harbors need dredging too; scheduled rest is maintenance, not reward.',
  },
  'rabbit-hole-diver': {
    meaning: 'You follow questions past the point of politeness: one link becomes twelve tabs becomes a formed view. You would rather resurface late with treasure than skim the surface on time.',
    watchFor: 'Watch for diving as delay; set a resurface time before the descent.',
  },
  'pattern-smith': {
    meaning: 'You forge private know-how into tools others can hold: checklists, methods, and playbooks that outlive the moment you learned them. Your knowledge compounds in public.',
    watchFor: 'Keep the forge hot but versioned; a method from two pivots ago may mislead today.',
  },
  'compass-resetter': {
    meaning: 'When the map stops matching the territory, you reset the compass: quit, retrain, restart, and carry the bearings that matter into the next heading. Your continuity is skills and people, not titles.',
    watchFor: 'Name what carries over at each reset; that is the thread through every heading.',
  },
  'midnight-maker': {
    meaning: 'Your workshop lights up after dark: late-night entries show making and reflecting when the world is quiet and the bench is yours alone.',
    watchFor: 'Protect sleep like a load-bearing wall; tomorrow-you builds on tonight-you.',
  },
  'first-light': {
    meaning: 'You claim the day before it claims you: early hours hold your planning, movement, and clearest thinking, done before demands arrive.',
    watchFor: 'Guard first light from other people scheduling over it.',
  },
  'restless-atlas': {
    meaning: 'New places are how you re-index your life: relocations and journeys stamp your knowledgebase, and each return trip re-sorts what home means.',
    watchFor: 'Keep one anchor ritual per place so the atlas stays restorative, not rootless.',
  },
  'archive-gardener': {
    meaning: 'You tend records like beds in a garden: documents and finances pruned, labelled, and findable in any season. Future-you harvests what present-you files.',
    watchFor: 'Gardens serve meals, not museums; archive what no longer feeds a decision.',
  },
  'curiosity-cabinet': {
    meaning: 'You collect skills like specimens in a cabinet of curiosities: broadly, joyfully, in combinations nobody else has on their shelf.',
    watchFor: 'Periodically take one specimen off the shelf and master it; breadth plus one depth is the exhibit.',
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

/** Occurrence count (read-vs-collect needs density, not just entry hits). */
function countOccurrences(entries: Entry[], re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  return entries.reduce((sum, e) => sum + (`${e.title} ${e.body}`.match(global)?.length ?? 0), 0);
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
    id: 'margin-annotator',
    label: 'Margin Annotator',
    conflictsWith: 'shelf-cartographer',
    score: (live) => {
      const read = countOccurrences(live, READ_RE);
      const collect = countOccurrences(live, COLLECT_RE);
      const score = read * 2 - collect;
      return { score, evidence: `${read} reading signals vs ${collect} collecting signals` };
    },
  },
  {
    id: 'shelf-cartographer',
    label: 'Shelf Cartographer',
    conflictsWith: 'margin-annotator',
    score: (live) => {
      const read = countOccurrences(live, READ_RE);
      const collect = countOccurrences(live, COLLECT_RE);
      const score = collect * 2 - read;
      return { score, evidence: `${collect} collecting signals vs ${read} finished-reading signals` };
    },
  },
  {
    id: 'keeper-of-threads',
    label: 'Keeper of Threads',
    score: (live) => {
      const n = peopleCount(live);
      return { score: n >= 12 ? n : 0, evidence: `${n} people woven through the knowledgebase` };
    },
  },
  {
    id: 'harbor-keeper',
    label: 'Harbor Keeper',
    score: (live) => {
      const n = countType(live, ['relationship', 'health']);
      return { score: n >= 8 ? n : 0, evidence: `${n} care/relationship entries` };
    },
  },
  {
    id: 'rabbit-hole-diver',
    label: 'Rabbit-Hole Diver',
    score: (live) => {
      const n = countType(live, ['research', 'finding']);
      return { score: n >= 10 ? n : 0, evidence: `${n} research/finding entries` };
    },
  },
  {
    id: 'pattern-smith',
    label: 'Pattern Smith',
    score: (live) => {
      const n = live.filter((e) => e.type === 'method' && e.tag === 'shareable').length;
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} shared methods` };
    },
  },
  {
    id: 'compass-resetter',
    label: 'Compass Resetter',
    score: (live) => {
      const n = live.filter((e) => /pivot|quit|resign|career|new role|switched|starting over/i.test(`${e.title} ${e.body}`)).length;
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} pivot/turning-point entries` };
    },
  },
  {
    id: 'midnight-maker',
    label: 'Midnight Maker',
    score: (live) => {
      const n = count(live, NIGHT_RE);
      return { score: n >= 2 ? n * 3 : 0, evidence: `${n} late-night entries` };
    },
  },
  {
    id: 'first-light',
    label: 'First Light',
    score: (live) => {
      const n = count(live, EARLY_RE);
      return { score: n >= 2 ? n * 3 : 0, evidence: `${n} early-morning entries` };
    },
  },
  {
    id: 'restless-atlas',
    label: 'Restless Atlas',
    score: (live) => {
      const n = count(live, TRAVEL_RE);
      return { score: n >= 3 ? n * 2 : 0, evidence: `${n} move/travel entries` };
    },
  },
  {
    id: 'archive-gardener',
    label: 'Archive Gardener',
    score: (live) => {
      const n = countType(live, ['document', 'finance']);
      return { score: n >= 8 ? n : 0, evidence: `${n} document/finance entries kept in order` };
    },
  },
  {
    id: 'curiosity-cabinet',
    label: 'Curiosity Cabinet',
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

/** Pre-rename archetype ids → current ids (stored preferences survive). */
export const LEGACY_ARCHETYPE_IDS: Record<string, string> = {
  'margin-annotator': 'bookworm',
  'shelf-cartographer': 'book-hoarder',
  'keeper-of-threads': 'network-weaver',
  'harbor-keeper': 'caretaker-anchor',
  'rabbit-hole-diver': 'deep-researcher',
  'pattern-smith': 'method-maker',
  'compass-resetter': 'serial-pivoter',
  'midnight-maker': 'night-owl',
  'first-light': 'early-riser',
  'restless-atlas': 'wanderer',
  'archive-gardener': 'keeper-of-records',
  'curiosity-cabinet': 'skill-collector',
};

/** Platform label for an archetype id (never a user-renamed custom label). */
export function platformArchetypeLabel(id: string): string | undefined {
  return RULES.find((r) => r.id === id)?.label;
}

/** Apply the user's final say: confirmed, renamed, or dismissed ("not me"). */
export function applyArchetypePreferences(
  archetypes: Archetype[],
  preferences: Record<string, ArchetypePreference>,
): Archetype[] {
  const prefFor = (id: string): ArchetypePreference | undefined =>
    preferences[id] ?? preferences[LEGACY_ARCHETYPE_IDS[id] ?? ''];
  return archetypes
    .filter((a) => prefFor(a.id)?.status !== 'dismissed')
    .map((a) => {
      const pref = prefFor(a.id);
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
