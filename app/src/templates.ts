// Path templates: data recipes, not forms. Each template names the data it
// needs, the ask that creates it, and how Hyperself should scaffold it.
// Hyperself also suggests templates when the right data already exists.
import type { Entry } from './types';

export interface PathTemplate {
  id: string;
  name: string;
  description: string;
  neededData: string[];
  suggestedQuery: string;
  scaffold: string[];
}

export const PATH_TEMPLATES: PathTemplate[] = [
  {
    id: 'budgeting',
    name: 'Budgeting',
    description: 'A clearer view of your finances from your own bank statements.',
    neededData: ['Bank statement (CSV) — Import & Connect → Upload documents'],
    suggestedQuery: 'where does my money go?',
    scaffold: [
      'Spending by category',
      'Money in vs money out',
      'Largest recurring costs',
      'Descriptive insights (no prescriptive advice)',
    ],
  },
];

export function templateById(id: string | undefined): PathTemplate | undefined {
  return PATH_TEMPLATES.find((t) => t.id === id);
}

export interface TemplateSuggestion {
  template: PathTemplate;
  reason: string;
}

/** Suggest a template when its data foundation already exists. */
export function suggestTemplates(entries: Entry[]): TemplateSuggestion[] {
  const live = entries.filter((e) => e.deleted_at === null);
  const financeCount = live.filter((e) => e.type === 'finance').length;
  const suggestions: TemplateSuggestion[] = [];
  if (financeCount >= 3) {
    suggestions.push({
      template: PATH_TEMPLATES[0],
      reason: `You have ${financeCount} finance entries — enough to start a Budgeting Path.`,
    });
  }
  return suggestions;
}

export interface TemplateReadiness {
  ready: boolean;
  have: string[];
  missing: string[];
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
  return { ready: false, have: [], missing: [...template.neededData] };
}

export function isBudgetingQuery(query: string): boolean {
  return /\b(money|budget|spend|spending|finances?|expenses?|costs?)\b/i.test(query);
}
