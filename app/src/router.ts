// Router: local by default, cloud by exception. Mirrors docs/ROUTER_POLICY.md.
import type { BudgetRecord, Entry } from './types';
import { NON_SHAREABLE_TYPES } from './types';

export type Task = 'chat' | 'retrieval' | 'dashboard' | 'gap' | 'plan' | 'pack-summary' | 'eval' | 'embed';
export type Engine = 'local' | 'cloud';
export type DataAllowance = 'all' | 'shareable-only' | 'fixtures-only' | 'none';

const ROUTES: Record<Task, { engine: Engine; data: DataAllowance }> = {
  chat: { engine: 'local', data: 'all' },
  retrieval: { engine: 'local', data: 'all' },
  dashboard: { engine: 'local', data: 'none' },
  gap: { engine: 'local', data: 'all' },
  plan: { engine: 'cloud', data: 'shareable-only' },
  'pack-summary': { engine: 'cloud', data: 'shareable-only' },
  eval: { engine: 'cloud', data: 'fixtures-only' },
  embed: { engine: 'local', data: 'all' },
};

export class ScrubViolationError extends Error {}
export class BudgetExhaustedError extends Error {}

/** Unknown task -> local. Fail closed, never send. */
export function route(task: Task): { engine: Engine; data: DataAllowance } {
  return ROUTES[task] ?? { engine: 'local', data: 'none' };
}

export interface ScrubbedPayload {
  allowed: Array<Pick<Entry, 'id' | 'type' | 'title' | 'body'>>;
  withheld: Array<{ id: string; type: string }>;
}

/**
 * Strips personal entries down to stubs. Throws if a non-shareable type is
 * ever marked shareable (data-integrity violation) — fail closed, send nothing.
 */
export function scrubForCloud(entries: Entry[]): ScrubbedPayload {
  const allowed: ScrubbedPayload['allowed'] = [];
  const withheld: ScrubbedPayload['withheld'] = [];
  for (const e of entries) {
    if ((NON_SHAREABLE_TYPES as readonly string[]).includes(e.type) && e.tag === 'shareable') {
      throw new ScrubViolationError(
        `Entry "${e.title}" (${e.type}) is marked shareable. Refusing to send anything.`,
      );
    }
    if (e.tag === 'personal') {
      withheld.push({ id: e.id, type: e.type });
    } else {
      allowed.push({ id: e.id, type: e.type, title: e.title, body: e.body });
    }
  }
  return { allowed, withheld };
}

// --- Budget meter ---

const CAP_KEY = 'hyperself.budgetCap';
export const DEFAULT_CAP_USD = 25;

/**
 * PLACEHOLDER rates. Update from Meta.dev pricing before spending real budget.
 * Kept in code (not localStorage) so a stale override can't hide true cost.
 */
export const PLACEHOLDER_RATES = {
  inputPerMTok: 0.5,
  outputPerMTok: 0.5,
} as const;

export function getCap(): number {
  const raw = localStorage.getItem(CAP_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CAP_USD;
}

export function setCap(usd: number): number {
  const value = Number.isFinite(usd) && usd > 0 ? usd : DEFAULT_CAP_USD;
  localStorage.setItem(CAP_KEY, String(value));
  return value;
}

export function getSpend(records: BudgetRecord[]): number {
  return records.reduce((sum, r) => sum + r.est_cost, 0);
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PLACEHOLDER_RATES.inputPerMTok +
    (outputTokens / 1_000_000) * PLACEHOLDER_RATES.outputPerMTok
  );
}

export function checkBudget(records: BudgetRecord[], estCost: number): void {
  if (getSpend(records) + estCost > getCap()) {
    throw new BudgetExhaustedError(
      `Cloud call blocked: estimated spend exceeds the $${getCap().toFixed(2)} cap. Using local draft instead.`,
    );
  }
}
