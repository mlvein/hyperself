// Audio transcription: recordings become searchable text entries.
// Runs fully on-device with Transformers.js Whisper (one-time model
// download, then offline). Browser-only APIs live inside functions so
// this module also loads under the Node test harness.
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'webm', 'flac', 'opus'];

export function isAudioFilename(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return AUDIO_EXTENSIONS.includes(ext);
}

export function isAudioMime(type: string): boolean {
  return type.startsWith('audio/');
}

interface AsrPipeline {
  (audio: Float32Array, opts?: Record<string, unknown>): Promise<{ text?: string } | Array<{ text?: string }>>;
}

let pipelinePromise: Promise<AsrPipeline> | null = null;

async function loadPipeline(onProgress?: (text: string) => void): Promise<AsrPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      onProgress?.('Loading transcription model on-device (one-time download)…');
      const mod = (await import('@huggingface/transformers')) as unknown as {
        pipeline: (task: string, model: string) => Promise<AsrPipeline>;
      };
      return mod.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    })();
  }
  return pipelinePromise;
}

/** Decode any browser-playable audio blob to 16 kHz mono samples. */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('Audio decoding is not supported in this browser.');
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(buffer.duration * 16000));
    const offline = new OfflineAudioContext(1, frames, 16000);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

export async function transcribeAudioBlob(
  blob: Blob,
  onProgress?: (text: string) => void,
): Promise<string> {
  onProgress?.('Decoding audio on-device…');
  const samples = await decodeTo16kMono(blob);
  if (samples.length < 1600) throw new Error('Recording is too short to transcribe.');
  const asr = await loadPipeline(onProgress);
  onProgress?.('Transcribing on-device…');
  const out = await asr(samples, { sampling_rate: 16000 });
  const text = (Array.isArray(out) ? out[0]?.text : out.text)?.trim() ?? '';
  if (!text) throw new Error('No speech was detected in that recording.');
  return text;
}
