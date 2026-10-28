// Local engine. Two implementations behind one interface:
// - WebLLMEngine: real on-device LLM (WebLLM, WebGPU) in a web worker.
// - StubEngine: templated answers from retrieved entries (fallback).
// initLocalEngine() picks WebLLM when WebGPU exists, else the stub; a failed
// model load degrades drafts to the stub so core flows never break.
// Nothing here touches the network except the one-time model download.
import type { Entry } from './types';

export interface LocalEngine {
  name: string;
  draft(query: string, context: Entry[]): Promise<string>;
}

export const WEBLLM_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
export const WEBLLM_MODEL_FALLBACK = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

export class StubEngine implements LocalEngine {
  readonly name = 'stub (templated local draft)';

  async draft(query: string, context: Entry[]): Promise<string> {
    if (context.length === 0) {
      return (
        `Local draft — no matching entries for "${query}".\n\n` +
        'Add entries first, then ask again. Nothing left your browser.'
      );
    }
    const lines = context.map((e) => `- ${e.title} [${e.tag}]: ${e.body.slice(0, 160)}`);
    return (
      `Local draft for "${query}" (from ${context.length} entr${context.length === 1 ? 'y' : 'ies'}):\n\n` +
      `${lines.join('\n')}\n\nNothing left your browser.`
    );
  }
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatClient {
  chat: {
    completions: {
      create(req: { messages: ChatMessage[]; temperature?: number; max_tokens?: number }): Promise<{
        choices: Array<{ message: { content: string } }>;
      }>;
    };
  };
}

/** Minimal structural type for the dynamically imported WebLLM module. */
interface WebLLMModule {
  CreateWebWorkerMLCEngine(
    worker: Worker,
    modelId: string,
    opts?: { initProgressCallback?: (report: { text: string; progress: number }) => void },
  ): Promise<ChatClient>;
}

export class WebLLMEngine implements LocalEngine {
  readonly name = `webllm: ${WEBLLM_MODEL_ID} (on-device)`;
  private clientPromise: Promise<ChatClient> | null = null;
  private readonly fallback = new StubEngine();

  constructor(private readonly onProgress?: (text: string) => void) {}

  private load(): Promise<ChatClient> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const webllm = (await import('@mlc-ai/web-llm')) as unknown as WebLLMModule;
        // Vite bundles the worker via the ?worker import; this browser-only
        // path never executes under the CommonJS test harness.
        const { default: WorkerCtor } = await import('./webllm-worker.ts?worker');
        const worker = new WorkerCtor();
        const create = async (modelId: string): Promise<ChatClient> =>
          webllm.CreateWebWorkerMLCEngine(worker, modelId, {
            initProgressCallback: (report) => {
              this.onProgress?.(
                `loading local model… ${Math.round(report.progress * 100)}%`,
              );
            },
          });
        try {
          return await create(WEBLLM_MODEL_ID);
        } catch {
          return create(WEBLLM_MODEL_FALLBACK);
        }
      })();
    }
    return this.clientPromise;
  }

  async draft(query: string, context: Entry[]): Promise<string> {
    if (context.length === 0) return this.fallback.draft(query, context);
    let client: ChatClient;
    try {
      client = await this.load();
    } catch {
      return this.fallback.draft(query, context);
    }
    const contextText = context
      .slice(0, 6)
      .map((e) => `### ${e.title} (${e.type}, ${e.tag})\n${e.body.slice(0, 1200)}`)
      .join('\n\n');
    try {
      const reply = await client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You are Hyperself, a private on-device assistant. Answer only from the provided entries. ' +
              'Cite entry titles. If the entries do not answer the question, say so. Be concise.',
          },
          { role: 'user', content: `Question: ${query}\n\nEntries:\n${contextText}` },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });
      const text = reply.choices[0]?.message.content.trim() ?? '';
      if (!text) return this.fallback.draft(query, context);
      return `${text}\n\nNothing left your browser.`;
    } catch {
      return this.fallback.draft(query, context);
    }
  }
}

/** Pure selection rule (unit-tested): WebGPU present → WebLLM, else stub. */
export function pickEngineKind(hasWebGPU: boolean): 'webllm' | 'stub' {
  return hasWebGPU ? 'webllm' : 'stub';
}

function detectWebGPU(): boolean {
  try {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
  } catch {
    return false;
  }
}

export async function initLocalEngine(
  onProgress?: (text: string) => void,
): Promise<{ engine: LocalEngine; notice: string }> {
  if (pickEngineKind(detectWebGPU()) === 'stub') {
    return {
      engine: new StubEngine(),
      notice: 'WebGPU unavailable — using templated local drafts.',
    };
  }
  const engine = new WebLLMEngine(onProgress);
  // Warm the model in the background; drafts await readiness and fall back.
  void engine.draft('', []).catch(() => undefined);
  return { engine, notice: 'Local LLM loading on-device (WebGPU).' };
}

export async function loadWebLLMEngine(): Promise<LocalEngine> {
  return new WebLLMEngine();
}
