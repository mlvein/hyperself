// Router: local by default, cloud by exception. Mirrors docs/ROUTER_POLICY.md.
import type { Entry } from './types';
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
