// Local engine. Two implementations behind one interface:
// - GlimmerEngine: Muse Glimmer (Meta, open weights) served on this device
//   by a local OpenAI-compatible server (Ollama / llama.cpp / vLLM).
//   Inference never leaves this device — the endpoint is localhost.
// - StubEngine: templated answers from retrieved entries (fallback).
// initLocalEngine() probes the local Glimmer endpoint; unreachable servers
// degrade drafts to the stub so core flows never break. Nothing here touches
// a remote network: the only fetch is to the user-configured local endpoint.
import type { Entry } from './types';

export interface LocalEngine {
  name: string;
  draft(query: string, context: Entry[]): Promise<string>;
}

// --- Muse Glimmer local-server config ---

export interface GlimmerConfig {
  /** OpenAI-compatible base URL of the local model server. */
  endpoint: string;
  /** Served model name on that server. */
  model: string;
}

export const DEFAULT_GLIMMER_CONFIG: GlimmerConfig = {
  endpoint: 'http://localhost:11434/v1',
  model: 'muse-glimmer',
};

const GLIMMER_KEY = 'hyperself.glimmer.v1';

export function loadGlimmerConfig(): GlimmerConfig {
  try {
    const raw = localStorage.getItem(GLIMMER_KEY);
    if (!raw) return { ...DEFAULT_GLIMMER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<GlimmerConfig>;
    return {
      endpoint: typeof parsed.endpoint === 'string' && parsed.endpoint.trim() ? parsed.endpoint.trim().replace(/\/+$/, '') : DEFAULT_GLIMMER_CONFIG.endpoint,
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model.trim() : DEFAULT_GLIMMER_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_GLIMMER_CONFIG };
  }
}

export function saveGlimmerConfig(cfg: GlimmerConfig): GlimmerConfig {
  const clean: GlimmerConfig = {
    endpoint: cfg.endpoint.trim().replace(/\/+$/, '') || DEFAULT_GLIMMER_CONFIG.endpoint,
    model: cfg.model.trim() || DEFAULT_GLIMMER_CONFIG.model,
  };
  try {
    localStorage.setItem(GLIMMER_KEY, JSON.stringify(clean));
  } catch {
    // Storage unavailable: config applies to this session only.
  }
  return clean;
}

/** Prompt fragments that must never be presented as a synthesis result. */
const PROMPT_LEAK =
  /you are hyperself|private on-device assistant|answer only from the provided entries|write an overview blurb|based on all my uploaded|use second person|local draft for/i;

export function isPromptLeak(text: string): boolean {
  return PROMPT_LEAK.test(text);
}

/** Strip prompt/system echoes the local engines sometimes regurgitate. */
export function cleanDraftText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !PROMPT_LEAK.test(line))
    .join('\n')
    .trim();
}

export class StubEngine implements LocalEngine {
  readonly name = 'stub (templated local draft)';

  async draft(_query: string, context: Entry[]): Promise<string> {
    if (context.length === 0) {
      return 'Add entries first — no matching entries yet. Nothing left your browser.';
    }
    const lines = context.map((e) => `- ${e.title} [${e.tag}]: ${e.body.slice(0, 160)}`);
    return (
      `From ${context.length} ${context.length === 1 ? 'entry' : 'entries'} on this device:\n\n` +
      `${lines.join('\n')}\n\nNothing left your browser.`
    );
  }
}

// --- Muse Glimmer over a local OpenAI-compatible server ---

export const GLIMMER_MAX_TOKENS = 2000;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

function buildMessages(query: string, context: Entry[]): ChatMessage[] {
  const contextText = context
    .slice(0, 6)
    .map((e) => `### ${e.title} (${e.type}, ${e.tag})\n${e.body.slice(0, 1200)}`)
    .join('\n\n');
  return [
    {
      role: 'system',
      content:
        'You are Hyperself, a private on-device assistant. Answer only from the provided entries. ' +
        'Cite entry titles. If the entries do not answer the question, say so. Be concise.',
    },
    { role: 'user', content: `Question: ${query}\n\nEntries:\n${contextText}` },
  ];
}

/** Accumulate an OpenAI-style streamed (SSE) chat response into plain text. */
export async function readChatStream(res: Response): Promise<string> {
  const contentType = res.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('text/event-stream') || !res.body) {
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  const drain = (chunk: string): void => {
    buffer += chunk;
    let at = buffer.indexOf('\n');
    while (at >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      at = buffer.indexOf('\n');
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
        };
        const choice = parsed.choices?.[0];
        text += choice?.delta?.content ?? choice?.message?.content ?? '';
      } catch {
        // Partial frame: keep buffering semantics simple, skip malformed lines.
      }
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    drain(decoder.decode(value, { stream: true }));
  }
  drain(decoder.decode());
  return text;
}

/** True when the local Glimmer server answers its model list. */
export async function probeGlimmer(
  cfg: GlimmerConfig = loadGlimmerConfig(),
  fetchFn: FetchFn = defaultFetch,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${cfg.endpoint}/models`, { signal: controller.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export class GlimmerEngine implements LocalEngine {
  readonly name: string;
  private readonly fallback = new StubEngine();

  constructor(
    private readonly cfg: GlimmerConfig = loadGlimmerConfig(),
    private readonly fetchFn: FetchFn = defaultFetch,
  ) {
    this.name = `muse-glimmer: ${cfg.model} (on this device)`;
  }

  async reachable(): Promise<boolean> {
    return probeGlimmer(this.cfg, this.fetchFn);
  }

  async draft(query: string, context: Entry[]): Promise<string> {
    if (context.length === 0) return this.fallback.draft(query, context);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120000);
      let text: string;
      try {
        const res = await this.fetchFn(`${this.cfg.endpoint}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.cfg.model,
            messages: buildMessages(query, context),
            temperature: 0.3,
            max_tokens: GLIMMER_MAX_TOKENS,
            stream: true,
          }),
          signal: controller.signal,
        });
        if (!res.ok) return this.fallback.draft(query, context);
        text = (await readChatStream(res)).trim();
      } finally {
        clearTimeout(timer);
      }
      if (!text) return this.fallback.draft(query, context);
      return `${text}\n\nNothing left this device.`;
    } catch {
      return this.fallback.draft(query, context);
    }
  }
}

/** Pure selection rule (unit-tested): reachable Glimmer server → glimmer, else stub. */
export function pickEngineKind(serverReachable: boolean): 'glimmer' | 'stub' {
  return serverReachable ? 'glimmer' : 'stub';
}

export const RECONNECT_COOLDOWN_MS = 15000;

/**
 * Engine that starts as the stub and upgrades in place: while the local
 * Glimmer server is unreachable, each draft (after a short cooldown)
 * re-probes once, so a server started after page load is picked up by the
 * next synthesis/expound with no reload and no user action.
 */
export class ReconnectingEngine implements LocalEngine {
  private current: LocalEngine;
  private lastProbeAt = 0;
  private probing: Promise<void> | null = null;
  private readonly cooldownMs: number;

  constructor(
    private readonly cfg: GlimmerConfig = loadGlimmerConfig(),
    private readonly fetchFn: FetchFn = defaultFetch,
    opts?: { initiallyConnected?: boolean; cooldownMs?: number },
  ) {
    this.current = opts?.initiallyConnected ? new GlimmerEngine(cfg, fetchFn) : new StubEngine();
    this.cooldownMs = opts?.cooldownMs ?? RECONNECT_COOLDOWN_MS;
  }

  get name(): string {
    return this.current.name;
  }

  get connected(): boolean {
    return this.current instanceof GlimmerEngine;
  }

  private async tryUpgrade(): Promise<void> {
    if (this.connected) return;
    if (this.probing) return this.probing;
    const nowMs = Date.now();
    if (nowMs - this.lastProbeAt < this.cooldownMs) return;
    this.lastProbeAt = nowMs;
    this.probing = (async () => {
      if (await probeGlimmer(this.cfg, this.fetchFn)) {
        this.current = new GlimmerEngine(this.cfg, this.fetchFn);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        this.probing = null;
      });
    return this.probing;
  }

  async draft(query: string, context: Entry[]): Promise<string> {
    await this.tryUpgrade();
    return this.current.draft(query, context);
  }
}

export async function initLocalEngine(): Promise<{ engine: LocalEngine; notice: string }> {
  const cfg = loadGlimmerConfig();
  const reachable = await probeGlimmer(cfg);
  if (pickEngineKind(reachable) === 'stub') {
    return {
      engine: new ReconnectingEngine(cfg, defaultFetch, { initiallyConnected: false }),
      notice:
        'Local model server unreachable — using templated local drafts. ' +
        'Start Muse Glimmer locally (e.g. Ollama) and the next synthesis will connect on its own.',
    };
  }
  return {
    engine: new ReconnectingEngine(cfg, defaultFetch, { initiallyConnected: true }),
    notice: 'Muse Glimmer connected on this device (local server).',
  };
}
