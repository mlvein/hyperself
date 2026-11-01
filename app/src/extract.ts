// Structured extraction at ingest (local, deterministic — no model call).
// Uploads arrive as flat text; extraction links them into the structure the
// platform reasons over: people tags, goal links, and skill evidence.
// Precision over recall: known people match exactly, new-name candidates
// must recur across the document, goal links need real token overlap, and
// every tag stays user-removable. Extracted != asserted by the user.
import type { Goal, Skill } from './types';

const STOP_TOKENS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'between',
  'could', 'every', 'first', 'great', 'their', 'there', 'these', 'thing',
  'think', 'those', 'three', 'today', 'under', 'using', 'week', 'weeks',
  'what', 'when', 'where', 'which', 'while', 'with', 'work', 'year', 'years',
  'your', 'from', 'have', 'into', 'just', 'like', 'more', 'most', 'much',
  'next', 'only', 'over', 'same', 'some', 'such', 'take', 'than', 'that',
  'them', 'then', 'this', 'want', 'went', 'will', 'notes', 'note',
]);

export function significantTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 3 && !STOP_TOKENS.has(t)),
    ),
  ];
}

/** Known people (already tagged somewhere) mentioned in this text. */
export function extractKnownPeople(text: string, knownPeople: string[]): string[] {
  const lower = text.toLowerCase();
  return knownPeople.filter((name) => name.trim() && lower.includes(name.toLowerCase()));
}

// Words that start capitalized phrases but are rarely person names here.
const NAME_STOPLIST = new Set([
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'Monday', 'Tuesday',
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Thinking',
  'Systems', 'Notes', 'Note', 'Life', 'Path', 'Paths', 'Weekly', 'Daily',
  'Monthly', 'Annual', 'Chapter', 'Book', 'Design', 'Research', 'Project',
  'Team', 'Work', 'Home', 'School', 'Health', 'Money', 'North', 'South',
  'East', 'West', 'New', 'First', 'Second', 'Third', 'Last', 'Next',
]);

const NAME_RUN = /[A-Z][a-z]{1,30}(?: [A-Z][a-z]{1,30})+/g;

/**
 * New-name candidates for a whole document: Title-Case pairs that recur at
 * least twice. One-off capitalized phrases (book titles, headings) are left
 * alone. Callers intersect with each chunk before tagging it.
 */
export function extractCandidatePeople(documentText: string): string[] {
  const counts = new Map<string, number>();
  for (const match of documentText.matchAll(NAME_RUN)) {
    const words = match[0].split(' ');
    for (let i = 0; i + 1 < words.length; i += 1) {
      const first = words[i];
      const second = words[i + 1];
      if (NAME_STOPLIST.has(first) || NAME_STOPLIST.has(second)) continue;
      const pair = `${first} ${second}`;
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .slice(0, 12);
}

/** Goals whose title/description genuinely overlap this text. */
export function matchGoals(text: string, goals: Goal[]): string[] {
  const textTokens = new Set(significantTokens(text));
  const lower = text.toLowerCase();
  const linked: string[] = [];
  for (const goal of goals) {
    if (goal.status === 'abandoned') continue;
    if (goal.title.trim().length > 3 && lower.includes(goal.title.toLowerCase())) {
      linked.push(goal.id);
      continue;
    }
    const goalTokens = significantTokens(`${goal.title} ${goal.description}`);
    const overlap = goalTokens.filter((t) => textTokens.has(t)).length;
    if (overlap >= 2) linked.push(goal.id);
  }
  return linked;
}

/** Existing skills evidenced by name in this text. */
export function matchSkills(text: string, skills: Skill[]): string[] {
  const lower = text.toLowerCase();
  return skills
    .filter((s) => new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower))
    .map((s) => s.id);
}

export interface SkillLexiconEntry {
  name: string;
  keywords: string[];
}

/** Curated starter lexicon: strong multi-signal hits can seed a Skill. */
export const SKILL_LEXICON: SkillLexiconEntry[] = [
  { name: 'Research', keywords: ['research', 'study', 'studies', 'literature', 'evidence', 'experiment'] },
  { name: 'Design', keywords: ['design', 'figma', 'prototype', 'wireframe', 'typography', 'layout'] },
  { name: 'Writing', keywords: ['writing', 'draft', 'essay', 'manuscript', 'editing', 'blog'] },
  { name: 'Budgeting', keywords: ['budget', 'budgeting', 'expenses', 'savings', 'invoice', 'cashflow'] },
  { name: 'Mentoring', keywords: ['mentor', 'mentoring', 'coaching', 'onboarding', 'feedback session'] },
  { name: 'Programming', keywords: ['code', 'coding', 'typescript', 'python', 'debug', 'repository', 'compiler'] },
  { name: 'Public speaking', keywords: ['presentation', 'talk', 'keynote', 'audience', 'slides', 'workshop'] },
  { name: 'Data analysis', keywords: ['data', 'spreadsheet', 'chart', 'metrics', 'analysis', 'dataset'] },
];

/** Lexicon skills with at least two distinct keyword signals in the text. */
export function lexiconSkillHits(text: string): string[] {
  const lower = text.toLowerCase();
  return SKILL_LEXICON.filter(
    (entry) => entry.keywords.filter((k) => lower.includes(k)).length >= 2,
  ).map((entry) => entry.name);
}
