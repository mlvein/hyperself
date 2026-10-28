// Archetypes: playful labels for synthesized behaviour patterns.
// Rule-based over entry text + shape (never sent anywhere). Conflicting
// pairs (e.g. Bookworm vs Book Hoarder) resolve to the stronger signal,
// so a collector who never finishes books is never called a Bookworm.
import type { Entry } from './types';

export interface Archetype {
  id: string;
  label: string;
  evidence: string;
  score: number;
}

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

export function computeArchetypes(entries: Entry[], limit = 4): Archetype[] {
  const live = entries.filter((e) => e.deleted_at === null);
  if (live.length === 0) return [];
  const scored = RULES.map((rule) => {
    const { score, evidence } = rule.score(live);
    return { id: rule.id, label: rule.label, evidence, score, conflictsWith: rule.conflictsWith };
  }).filter((a) => a.score > 0);
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const picked: Archetype[] = [];
  const blocked = new Set<string>();
  for (const a of scored) {
    if (blocked.has(a.id)) continue;
    picked.push({ id: a.id, label: a.label, evidence: a.evidence, score: a.score });
    if (a.conflictsWith) blocked.add(a.conflictsWith);
    if (picked.length >= limit) break;
  }
  return picked;
}
