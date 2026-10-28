// WebLLM worker host. Model inference runs here so the UI stays responsive.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
const scope = globalThis as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
};
scope.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
