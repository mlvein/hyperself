// Knowledgebase analysis: behavior signals, coverage gaps, and growth
// recommendations over entries already on this device. Rule-based facts are
// ground truth; the on-device LLM (Paths/Expound, Ask-this-pack, and the
// Overview "Generate AI analysis" action) only narrates them. Local-only.
import { PROVIDERS } from './connections';
import type { Entry, EntryType } from './types';

export const ALL_ENTRY_TYPES: EntryType[] = [
  'journal',
  'goal-note',
  'skill',
  'health',
  'finance',
  'relationship',
  'finding',
  'method',
  'research',
  'document',
];

/** Which knowledge each provider can actually contribute, in entry types. */
export interface ProviderFit {
  adds: EntryType[];
  /** Data that needs summarization before it can become an entry. */
  summarizeFirst: string[];
  note: string;
}

export const PROVIDER_FITS: Record<string, ProviderFit> = {
  notion: {
    adds: ['research', 'finding', 'method'],
    summarizeFirst: [],
    note: 'Pages and notes map cleanly to research, findings, and methods.',
  },
  drive: {
    adds: ['document', 'research', 'finding'],
    summarizeFirst: ['deck media', 'comment threads'],
    note: 'Docs become documents/research; comments summarize into findings.',
  },
  gmail: {
    adds: ['relationship', 'document', 'finding'],
    summarizeFirst: ['full thread history'],
    note: 'Introductions and receipts integrate; long threads summarize first.',
  },
  slack: {
    adds: ['journal', 'finding'],
    summarizeFirst: ['channel firehose'],
    note: 'Threads integrate as journal/findings; raw channels summarize first.',
  },
  github: {
    adds: ['research', 'method', 'document'],
    summarizeFirst: [],
    note: 'Repos, PRs, and gists map to research, methods, and documents.',
  },
  linkedin: {
    adds: ['relationship', 'finding'],
    summarizeFirst: [],
    note: 'Connections and conversations map to relationships and findings.',
  },
  x: {
    adds: ['research', 'finding'],
    summarizeFirst: ['media posts'],
    note: 'Posts and bookmarks integrate; media-heavy posts summarize first.',
  },
  health: {
    adds: ['health'],
    summarizeFirst: ['minute-level steps/sleep series'],
    note: 'Only summaries integrate (weekly activity, sleep notes), never raw series.',
  },
  calendar: {
    adds: ['journal', 'goal-note'],
    summarizeFirst: [],
    note: 'Events integrate as journal/goal-note entries with attendees as people.',
  },
  family: {
    adds: ['relationship', 'document', 'health', 'journal'],
    summarizeFirst: [],
    note: 'School, care, and estate records integrate; all stay personal by type.',
  },
  contacts: {
    adds: ['relationship'],
    summarizeFirst: [],
    note: 'Contacts integrate as relationship entries with people tags.',
  },
};

export interface TypeCount {
  type: EntryType;
  count: number;
}

export interface Recommendation {
  providerId: string;
  name: string;
  category: string;
  adds: EntryType[];
  reason: string;
}

export interface KbAnalysis {
  total: number;
  personalCount: number;
  shareableCount: number;
  peopleCount: number;
  topPeople: Array<{ name: string; count: number }>;
  fresh7: number;
  staleCount: number;
  indexedCount: number;
  byType: TypeCount[];
  gaps: EntryType[];
  behavior: string[];
  /** Entries created per week, oldest first: [3w ago, 2w ago, 1w ago, this week]. */
  weeklyActivity: number[];
  /** One-tap questions the current knowledgebase can actually answer. */
  questions: string[];
  recommendations: Recommendation[];
}

/** Category tags for synthesis cards. A card may carry several. */
export const TAGS_BY_TYPE: Record<EntryType, string[]> = {
  research: ['work'],
  finding: ['work'],
  method: ['work'],
  skill: ['work'],
  'goal-note': ['work', 'personal'],
  relationship: ['people'],
  finance: ['finance', 'personal'],
  health: ['health', 'personal'],
  journal: ['personal'],
  document: ['personal'],
};

export interface SynthesisCard {
  title: string;
  body: string;
  tags: string[];
}

function tagsForTypes(types: EntryType[]): string[] {
  return [...new Set(types.flatMap((t) => TAGS_BY_TYPE[t]))];
}

/** Skimmable synthesis: one card per insight, each tagged by category. */
export function buildSynthesisCards(entries: Entry[], a: KbAnalysis): SynthesisCard[] {
  const live = entries.filter((e) => e.deleted_at === null);
  if (live.length === 0) return [];
  const cards: SynthesisCard[] = [];
  const countOf = (types: EntryType[]): number =>
    live.filter((e) => types.includes(e.type)).length;

  const topTypes = a.byType.filter((t) => t.count > 0).slice(0, 2).map((t) => t.type);
  cards.push({
    title: `Focus: ${a.byType[0].type}`,
    body: `Your knowledgebase leans ${a.byType[0].type} (${a.byType[0].count} of ${a.total} entries). ${a.fresh7} updated this week.`,
    tags: tagsForTypes(topTypes),
  });

  if (a.topPeople.length > 0) {
    cards.push({
      title: 'People at the center',
      body: `Your network centers on ${a.topPeople.map((p) => `${p.name} (${p.count})`).join(', ')}. ${a.peopleCount} people tracked in total.`,
      tags: tagsForTypes(['relationship']),
    });
  }

  const careCount = countOf(['relationship', 'health']);
  if (careCount > 0) {
    cards.push({
      title: 'Care & wellbeing load',
      body: `${careCount} entries cover relationships and health — the caretaking side of your knowledgebase. ${a.staleCount} ${a.staleCount === 1 ? 'entry needs' : 'entries need'} review (90+ days old).`,
      tags: ['people', 'health', 'personal'],
    });
  }

  const financeCount = countOf(['finance', 'document']);
  if (financeCount > 0) {
    cards.push({
      title: 'Money & paperwork',
      body: `${financeCount} finance/document entries on file. Documents stay personal by design and never enter shareable packs.`,
      tags: ['finance', 'personal'],
    });
  }

  cards.push({
    title: 'Sharing readiness',
    body:
      a.shareableCount === 0
        ? 'Nothing is shareable yet — Paths and Legacy have nothing to work with. Promote findings or methods when ready.'
        : `${a.shareableCount} shareable ${a.shareableCount === 1 ? 'entry powers' : 'entries power'} Paths and Legacy; ${a.personalCount} stay personal.`,
    tags: ['work', 'personal'],
  });

  if (a.gaps.length > 0) {
    cards.push({
      title: 'Blind spots to grow',
      body: `No ${a.gaps.join(', ')} knowledge yet. Linking more accounts fills these in — see Import & Connect.`,
      tags: tagsForTypes(a.gaps),
    });
  }

  return cards;
}

export interface SynthesisSections {
  nextSteps: string[];
  facts: string[];
}

export interface WhatMatters {
  interests: string[];
  people: string[];
  headline: string;
}

/** What matters most, from shared knowledge only: interests + key people. */
export function buildWhatMatters(entries: Entry[]): WhatMatters {
  const shared = entries.filter((e) => e.deleted_at === null && e.tag === 'shareable');
  const byType = new Map<string, number>();
  const people = new Map<string, number>();
  for (const e of shared) {
    byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    for (const name of e.people ?? []) people.set(name, (people.get(name) ?? 0) + 1);
  }
  const interests = [...byType.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 3)
    .map(([type]) => type);
  const topPeople = [...people.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 3)
    .map(([name]) => name);
  const headline =
    shared.length === 0
      ? 'Nothing shared yet — mark findings or methods shareable and your priorities will surface here.'
      : interests.length > 0
        ? `Your shared knowledge centers on ${interests.join(', ')}${topPeople.length ? `, with ${topPeople.join(', ')}` : ''}.`
        : 'Your shared knowledge is ready in Paths and Legacy.';
  return { interests, people: topPeople, headline };
}

/** Short card sections for the Library: actions, facts, and recent entries. */
export function buildSynthesisSections(entries: Entry[], a: KbAnalysis): SynthesisSections {
  const live = entries.filter((e) => e.deleted_at === null);
  const nextSteps: string[] = [];
  if (a.shareableCount === 0) {
    nextSteps.push(
      'Promote a finding or method to shareable so Paths and Legacy have something to work with.',
    );
  }
  if (a.gaps.length > 0) {
    nextSteps.push(
      `Fill blind spots (${a.gaps.slice(0, 3).join(', ')}) — see Import & Connect for linked accounts.`,
    );
  }
  if (a.staleCount > 0) {
    nextSteps.push(
      `Review ${a.staleCount} stale ${a.staleCount === 1 ? 'entry' : 'entries'} (90+ days old) in Paths.`,
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push('Open Paths to work your latest insights.');
  }
  const facts: string[] = [
    `${a.total} entries on this device (${a.personalCount} personal, ${a.shareableCount} shareable).`,
    `${a.fresh7} updated this week · ${a.staleCount} stale (90+ days).`,
    `${a.peopleCount} people tracked · ${a.indexedCount} of ${a.total} indexed for semantic search.`,
  ];
  void live;
  return { nextSteps, facts };
}

const DAY = 86400000;

function ageDays(entry: Entry, now: number): number {
  return (now - Date.parse(entry.updated_at)) / DAY;
}

export function analyzeKnowledgebase(
  entries: Entry[],
  connectedIds: string[],
  now = Date.now(),
): KbAnalysis {
  const live = entries.filter((e) => e.deleted_at === null);
  const byType = ALL_ENTRY_TYPES.map((type) => ({
    type,
    count: live.filter((e) => e.type === type).length,
  })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const gaps = byType.filter((t) => t.count === 0).map((t) => t.type);

  const people = new Map<string, number>();
  for (const e of live) {
    for (const name of e.people ?? []) people.set(name, (people.get(name) ?? 0) + 1);
  }
  const topPeople = [...people.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);

  const fresh7 = live.filter((e) => ageDays(e, now) <= 7).length;
  const staleCount = live.filter((e) => ageDays(e, now) > 90).length;
  const personalCount = live.filter((e) => e.tag === 'personal').length;

  const behavior: string[] = [];
  if (live.length === 0) {
    behavior.push('No knowledge yet — link an account or load the sample persona to begin.');
  } else {
    const top = byType[0];
    behavior.push(
      `Your knowledgebase leans ${top.type} (${top.count} of ${live.length} entries).`,
    );
    behavior.push(
      fresh7 > 0
        ? `${fresh7} ${fresh7 === 1 ? 'entry' : 'entries'} updated this week — your picture is current.`
        : 'Nothing updated this week — your picture may be drifting.',
    );
    if (staleCount > 0) {
      behavior.push(
        `${staleCount} ${staleCount === 1 ? 'entry has' : 'entries have'} gone 90+ days without review.`,
      );
    }
    if (topPeople.length > 0) {
      behavior.push(
        `Your network centers on ${topPeople.map((p) => p.name).join(', ')} (${topPeople.reduce((s, p) => s + p.count, 0)} tagged entries).`,
      );
    }
    const shareable = live.length - personalCount;
    behavior.push(
      shareable === 0
        ? 'Nothing is shareable yet — Paths and Legacy have nothing to work with.'
        : `${shareable} shareable ${shareable === 1 ? 'entry powers' : 'entries power'} Paths and Legacy.`,
    );
    if (gaps.length > 0) {
      behavior.push(`Blind spots: no ${gaps.join(', ')} knowledge yet.`);
    }
  }

  const weeklyActivity = [0, 0, 0, 0];
  for (const e of live) {
    const age = (now - Date.parse(e.created_at)) / DAY;
    const weeksAgo = age < 0 ? 0 : Math.floor(age / 7);
    if (weeksAgo <= 3) weeklyActivity[3 - weeksAgo] += 1;
  }

  const questions: string[] = [];
  if (live.length > 0) {
    questions.push("people I've met this week");
    const topType = byType.find((t) => t.count > 0);
    if (topType) questions.push(`who might know about ${topType.type}`);
    if (topPeople.length > 0) questions.push(topPeople[0].name);
  }

  const recommendations: Recommendation[] = PROVIDERS.filter(
    (p) => !connectedIds.includes(p.id),
  )
    .map((p) => {
      const fit = PROVIDER_FITS[p.id];
      const adds = fit ? fit.adds.filter((t) => gaps.includes(t)) : [];
      const covered = fit ? fit.adds.filter((t) => !gaps.includes(t)) : [];
      return {
        providerId: p.id,
        name: p.name,
        category: p.category,
        adds: fit ? fit.adds : [],
        score: adds.length * 2 + covered.length,
        reason: fit
          ? adds.length > 0
            ? `Fills your ${adds.join(', ')} gap${adds.length === 1 ? '' : 's'}. ${fit.note}`
            : `Deepens ${covered.join(', ')}. ${fit.note}`
          : p.blurb,
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map(({ providerId, name, category, adds, reason }) => ({
      providerId,
      name,
      category,
      adds,
      reason,
    }));

  return {
    total: live.length,
    personalCount,
    shareableCount: live.length - personalCount,
    peopleCount: people.size,
    topPeople,
    fresh7,
    staleCount,
    indexedCount: live.filter((e) => e.embedding_status === 'indexed').length,
    byType,
    gaps,
    behavior,
    weeklyActivity,
    questions,
    recommendations,
  };
}
