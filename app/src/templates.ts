// Path templates: data recipes, not forms. Each template names the data it
// needs, the ask that creates it, and how Hyperself should scaffold it.
// Hyperself also suggests templates when the right data already exists.
import { computeArchetypes } from './archetypes';
import type { Entry } from './types';

export interface PathTemplate {
  id: string;
  name: string;
  description: string;
  neededData: string[];
  suggestedQuery: string;
  scaffold: string[];
  /** Archetype that can seed/suggest this Path. */
  archetypeId?: string;
  archetypeLabel?: string;
}

export const PATH_TEMPLATES: PathTemplate[] = [
  {
    id: 'budgeting',
    name: 'Finance',
    description: 'A clearer view of your finances from your own bank statements.',
    neededData: ['Bank statement (CSV) — Import & Connect → Upload documents'],
    suggestedQuery: 'where does my money go?',
    scaffold: [
      'Received, spent and net grouped your way (month, weekday, category, merchant)',
      'Spending evolution by category over time',
      'Cumulative net across months',
      'Largest recurring costs',
      'Descriptive insights (no prescriptive advice)',
    ],
  },
  {
    id: 'relationship-rhythms',
    name: 'Relationship Rhythms',
    description: 'See which relationships are warm, which have gone quiet, and who may be due a hello — descriptively, never as a score of people.',
    neededData: ['Entries that mention people, contacts (.vcf), calendars (.ics), or relationship notes'],
    suggestedQuery: 'which relationships have gone quiet?',
    archetypeId: 'keeper-of-threads',
    archetypeLabel: 'Keeper of Threads',
    scaffold: ['People by recency', 'Relationships gone quiet', 'Long-running connections', 'Your own notes beside each person'],
  },
  {
    id: 'health',
    name: 'Health',
    description: 'A descriptive view of your health records — activity, sleep, and check-ups over time. Never medical advice.',
    neededData: ['Apple Health export (.zip/.xml), health results, or activity/sleep notes — Import & Connect'],
    suggestedQuery: 'how is my health trending?',
    scaffold: ['Records by kind', 'Most recent activity', 'Sleep & activity signals', 'Descriptive trends only (never medical advice)'],
  },
  {
    id: 'reading-life',
    name: 'Reading Life',
    description: 'An honest view of what you finish, what you collect, and what your shelves say about your curiosity.',
    neededData: ['Reading notes, book lists, journals, research notes, or document uploads that mention books'],
    suggestedQuery: 'what does my reading life look like?',
    archetypeId: 'margin-annotator',
    archetypeLabel: 'Margin Annotator / Shelf Cartographer',
    scaffold: ['Finished vs collected', 'Reading vs TBR signals', 'Reading across your years', 'Descriptive patterns (no reading prescriptions)'],
  },
];

export function templateById(id: string | undefined): PathTemplate | undefined {
  return PATH_TEMPLATES.find((t) => t.id === id);
}

export function templateForArchetype(archetypeId: string): PathTemplate | undefined {
  if (archetypeId === 'shelf-cartographer') return templateById('reading-life');
  return PATH_TEMPLATES.find((t) => t.archetypeId === archetypeId);
}

export interface TemplateSuggestion {
  template: PathTemplate;
  reason: string;
  archetypeId?: string;
}

/** Suggest a template when its data foundation already exists. */
export function suggestTemplates(entries: Entry[]): TemplateSuggestion[] {
  const live = entries.filter((e) => e.deleted_at === null);
  const financeCount = live.filter((e) => e.type === 'finance').length;
  const suggestions: TemplateSuggestion[] = [];
  if (financeCount >= 3) {
    suggestions.push({
      template: PATH_TEMPLATES[0],
      reason: `You have ${financeCount} finance entries — enough to start a Finance Path.`,
    });
  }
  const healthCount = live.filter((e) => e.type === 'health').length;
  if (healthCount >= 2) {
    suggestions.push({
      template: templateById('health')!,
      reason: `You have ${healthCount} health entries — enough to start a Health Path.`,
    });
  }
  const archetypes = computeArchetypes(live, 6);
  const weaver = archetypes.find((a) => a.id === 'keeper-of-threads');
  if (weaver) {
    suggestions.push({
      template: templateById('relationship-rhythms')!,
      reason: `For your ${weaver.label} side: ${weaver.evidence}.`,
      archetypeId: weaver.id,
    });
  }
  const reader = archetypes.find((a) => a.id === 'margin-annotator' || a.id === 'shelf-cartographer');
  if (reader) {
    suggestions.push({
      template: templateById('reading-life')!,
      reason: `For your ${reader.label} side: ${reader.evidence}.`,
      archetypeId: reader.id,
    });
  }
  return suggestions;
}

export interface TemplateReadiness {
  ready: boolean;
  have: string[];
  missing: string[];
}

const READ_RE = /\b(read|reading|finished|re-read|reread|book club|novel|chapter)\b/i;
const COLLECT_RE = /\b(bought|buy|tbr|to-read pile|shelf|shelves|collection|collecting|unread|hoard)\b/i;

export function countReadingSignals(entries: Entry[]): { read: number; collect: number } {
  const live = entries.filter((e) => e.deleted_at === null && e.ownership !== 'reference');
  return {
    read: live.filter((e) => READ_RE.test(`${e.title} ${e.body}`)).length,
    collect: live.filter((e) => COLLECT_RE.test(`${e.title} ${e.body}`)).length,
  };
}

/** What the user already has vs still needs for a template — no manual setup. */
export function templateReadiness(entries: Entry[], template: PathTemplate): TemplateReadiness {
  const live = entries.filter((e) => e.deleted_at === null);
  if (template.id === 'budgeting') {
    const financeCount = live.filter((e) => e.type === 'finance').length;
    return financeCount >= 3
      ? { ready: true, have: [`${financeCount} finance entries imported`], missing: [] }
      : {
          ready: false,
          have: financeCount ? [`${financeCount} finance ${financeCount === 1 ? 'entry' : 'entries'} so far`] : [],
          missing: ['A bank statement (CSV) — use Upload documents in Import & Connect'],
        };
  }
  if (template.id === 'relationship-rhythms') {
    const people = new Set(live.flatMap((e) => e.people ?? [])).size;
    const relationships = live.filter((e) => e.type === 'relationship').length;
    const ready = people >= 5 || relationships >= 3;
    return {
      ready,
      have: [
        ...(people ? [`${people} people appear in your knowledgebase`] : []),
        ...(relationships ? [`${relationships} relationship entries`] : []),
      ],
      missing: ready ? [] : ['More entries mentioning people, a contacts (.vcf) file, or calendar (.ics) import'],
    };
  }
  if (template.id === 'health') {
    const healthCount = live.filter((e) => e.type === 'health').length;
    const ready = healthCount >= 2;
    return {
      ready,
      have: healthCount ? [`${healthCount} health ${healthCount === 1 ? 'entry' : 'entries'} imported`] : [],
      missing: ready ? [] : ['Health records — an Apple Health export (.zip) or health notes via Upload documents in Import & Connect'],
    };
  }
  if (template.id === 'reading-life') {
    const { read, collect } = countReadingSignals(live);
    const ready = read + collect >= 3;
    return {
      ready,
      have: [
        ...(read ? [`${read} reading/finishing signals`] : []),
        ...(collect ? [`${collect} collecting/TBR signals`] : []),
      ],
      missing: ready ? [] : ['Reading notes, book lists, or journal entries that mention books'],
    };
  }
  return { ready: false, have: [], missing: [...template.neededData] };
}

export function isBudgetingQuery(query: string): boolean {
  return /\b(money|budget|spend|spending|finances?|expenses?|costs?)\b/i.test(query);
}

export function isHealthQuery(query: string): boolean {
  return /\b(health|sleep|steps|weight|blood pressure|heart rate|workouts?|activity)\b/i.test(query);
}

export interface HealthSummary {
  total: number;
  latestDate: string | null;
  sleepSignals: number;
  activitySignals: number;
  checkupSignals: number;
  /** Record-kind lines from health-export summaries ("- StepCount: 12 records…"). */
  recordLines: string[];
  pattern: string;
}

const SLEEP_RE = /\b(sleep|slept|insomnia|nap)\b/i;
const ACTIVITY_RE = /\b(steps|walk|walking|run|running|workout|exercise|activity|swim|cycling)\b/i;
const CHECKUP_RE = /\b(appointment|check-?up|doctor|clinic|blood pressure|lab|test results?|vaccin)\b/i;

/** Descriptive health overview — counts and recency only, never advice. */
export function healthSummary(entries: Entry[]): HealthSummary {
  const health = entries
    .filter((e) => e.deleted_at === null && e.type === 'health')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const recordLines: string[] = [];
  for (const e of health) {
    for (const line of e.body.split('\n')) {
      const clean = line.trim();
      if (/^- \w.*: \d+ records/.test(clean) && !recordLines.includes(clean)) recordLines.push(clean);
      if (recordLines.length >= 8) break;
    }
    if (recordLines.length >= 8) break;
  }
  const count = (re: RegExp): number => health.filter((e) => re.test(`${e.title} ${e.body}`)).length;
  const sleepSignals = count(SLEEP_RE);
  const activitySignals = count(ACTIVITY_RE);
  const checkupSignals = count(CHECKUP_RE);
  const pattern =
    health.length === 0
      ? 'No health records yet.'
      : sleepSignals > 0 && activitySignals > 0
        ? 'Your records cover both rest and movement — the two halves of recovery.'
        : activitySignals > 0
          ? 'Movement is the best-documented side of your health so far.'
          : sleepSignals > 0
            ? 'Rest is the best-documented side of your health so far.'
            : 'Your health records are mostly check-ups and results so far.';
  return {
    total: health.length,
    latestDate: health[0]?.updated_at?.slice(0, 10) ?? null,
    sleepSignals,
    activitySignals,
    checkupSignals,
    recordLines,
    pattern,
  };
}

export interface RelationshipRhythm {
  name: string;
  mentions: number;
  lastSeen: string;
  daysQuiet: number;
}

/** Descriptive relationship recency — never a score of a person's worth. */
export function relationshipRhythms(entries: Entry[], now = Date.now()): RelationshipRhythm[] {
  const byPerson = new Map<string, { mentions: number; lastSeen: string }>();
  for (const e of entries.filter((x) => x.deleted_at === null)) {
    for (const name of e.people ?? []) {
      const current = byPerson.get(name);
      if (!current || e.created_at > current.lastSeen) {
        byPerson.set(name, { mentions: (current?.mentions ?? 0) + 1, lastSeen: e.created_at });
      } else {
        current.mentions += 1;
      }
    }
  }
  return [...byPerson.entries()]
    .map(([name, v]) => ({
      name,
      mentions: v.mentions,
      lastSeen: v.lastSeen,
      daysQuiet: Math.max(0, Math.floor((now - Date.parse(v.lastSeen)) / 86400000)),
    }))
    .sort((a, b) => b.daysQuiet - a.daysQuiet || b.mentions - a.mentions || a.name.localeCompare(b.name));
}

export interface ReadingLifeSummary {
  read: number;
  collect: number;
  pattern: string;
}

export function readingLifeSummary(entries: Entry[]): ReadingLifeSummary {
  const { read, collect } = countReadingSignals(entries);
  const pattern =
    read === 0 && collect === 0
      ? 'No clear reading or collecting pattern yet.'
      : collect > read * 1.5
        ? 'Collecting is currently outpacing finishing — the shelves tell a curiosity story.'
        : read > collect * 1.5
          ? 'Finishing is the stronger pattern — reading appears to be a way you process experience.'
          : 'Reading and collecting are in relative balance.';
  return { read, collect, pattern };
}

/** Templates are only surfaced when related data already exists (a suggestion). */
export function visibleSuggestedTemplates(
  entries: Entry[],
  savedTemplateIds: Array<string | undefined>,
): TemplateSuggestion[] {
  const saved = new Set(savedTemplateIds.filter(Boolean));
  return suggestTemplates(entries).filter((x) => !saved.has(x.template.id));
}

/** Badge number: Paths the user has + suggested Paths ready to start. */
export function availablePathCount(
  entries: Entry[],
  savedPaths: Array<{ templateId?: string }>,
): number {
  return savedPaths.length + visibleSuggestedTemplates(entries, savedPaths.map((p) => p.templateId)).length;
}
