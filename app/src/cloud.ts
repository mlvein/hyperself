// Cloud calls: plan generation only (plus optional pack summaries later).
// Every call goes through route() -> scrubForCloud().
import { PSYCH_PRINCIPLES } from './psych';
import { route, scrubForCloud } from './router';
import type { Entry, Goal } from './types';

export interface CloudConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export class NoApiKeyError extends Error {}
export class CloudError extends Error {}

const CACHE_KEY = 'hyperself.planCache.v1';

function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).length * 1.3));
}

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h).toString(36)}`;
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export interface PlanResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cached: boolean;
  withheldCount: number;
}

export async function generatePlan(
  goal: Goal,
  linkedEntries: Entry[],
  cfg: CloudConfig,
): Promise<PlanResult> {
  const decision = route('plan');
  if (decision.engine !== 'cloud') throw new CloudError('Router forbids cloud for plan task.');

  const { allowed, withheld } = scrubForCloud(linkedEntries);

  const context = allowed.map((e) => `### ${e.title} (${e.type})\n${e.body}`).join('\n\n');
  const withheldNote =
    withheld.length > 0
      ? `\n\nNote: ${withheld.length} personal entr${withheld.length === 1 ? 'y was' : 'ies were'} withheld for privacy.`
      : '';
  const userPrompt =
    `Goal: ${goal.title}\n${goal.description}\n\nShareable context:\n${context || '(none)'}${withheldNote}\n\n` +
    `Write a short, actionable 4-week plan for this goal. Keep it concrete and brief.`;

  const cacheKey = hash(`${goal.id}:${goal.updated_at}:${hash(userPrompt)}`);
  const cache = readCache();
  const cachedText = cache[cacheKey];
  if (cachedText !== undefined) {
    return {
      text: cachedText,
      inputTokens: 0,
      outputTokens: 0,
      cached: true,
      withheldCount: withheld.length,
    };
  }

  if (!cfg.apiKey) throw new NoApiKeyError('No API key configured. Using local draft instead.');
  if (!cfg.endpoint) throw new CloudError('No cloud endpoint configured.');

  const estIn = estimateTokens(userPrompt) + 120;

  let res: Response;
  try {
    res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: `You are a concise personal-growth coach. Be concrete and brief. ${PSYCH_PRINCIPLES}` },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new CloudError('Cloud request failed (network). Using local draft instead.');
  }
  if (!res.ok) throw new CloudError(`Cloud request failed: HTTP ${res.status}. Using local draft instead.`);

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new CloudError('Cloud returned no content. Using local draft instead.');

  const inputTokens = data.usage?.prompt_tokens ?? estIn;
  const outputTokens = data.usage?.completion_tokens ?? estimateTokens(text);

  cache[cacheKey] = text;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is best-effort; the plan itself succeeded.
  }
  return { text, inputTokens, outputTokens, cached: false, withheldCount: withheld.length };
}
