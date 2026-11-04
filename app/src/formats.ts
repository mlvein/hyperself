// Additional upload formats: PDF, DOCX, RTF, JSON exports, ICS calendars,
// VCF contacts. Pure parsers here are unit-testable; PDF/DOCX use lazily
// imported browser libraries so the app shell stays small. All local.
export const DOCUMENT_EXTENSIONS = [
  'md', 'markdown', 'txt', 'csv', 'html', 'htm', 'pdf', 'docx', 'rtf', 'json', 'ics', 'vcf',
  'zip', 'mbox', 'xml', 'eml', 'js',
];

/** Text formats that can appear inside an export ZIP and be read as-is. */
export const ARCHIVE_TEXT_EXTENSIONS = [
  'md', 'markdown', 'txt', 'csv', 'html', 'htm', 'rtf', 'json', 'ics', 'vcf', 'xml', 'mbox', 'eml', 'js',
];

export function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function isDocumentFilename(name: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(extensionOf(name));
}

/** RTF -> plain text: control words stripped, \'xx hex and \uN decoded. */
export function rtfToText(rtf: string): string {
  let out = rtf
    .replace(/\\u(-?\d+)\??/g, (_, n: string) => {
      let code = Number(n);
      if (code < 0) code += 65536;
      return String.fromCharCode(code);
    })
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
  out = out.replace(/\{\\\*?[^{}]*\}/g, (group) => (group.startsWith('{\\fonttbl') || group.startsWith('{\\colortbl') || group.startsWith('{\\stylesheet') ? '' : group));
  out = out
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\\\/g, '\\');
  return out.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** JSON exports (notes/Takeout-style): readable string values, flattened. */
export function jsonToText(text: string, fallbackTitle: string): string {
  try {
    const data: unknown = JSON.parse(stripJsAssignment(text));
    const lines: string[] = [];
    const walk = (value: unknown, depth: number): void => {
      if (lines.length > 400) return;
      if (typeof value === 'string') {
        const clean = value.trim();
        if (clean.length >= 2) lines.push(clean);
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item, depth + 1);
      } else if (value && typeof value === 'object' && depth < 6) {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          if (typeof val === 'string' && val.trim().length >= 2 && !/^(id|url|type|kind|status)$/i.test(key)) {
            lines.push(`${key}: ${val.trim()}`);
          } else if (typeof val !== 'string') walk(val, depth + 1);
        }
      }
    };
    walk(data, 0);
    const unique = [...new Set(lines)];
    return unique.length ? `# ${fallbackTitle}\n\n${unique.join('\n\n')}` : '';
  } catch {
    return '';
  }
}

export interface IcsEvent {
  title: string;
  date: string; // ISO
  location?: string;
  description?: string;
}

function icsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '12'}:${m[5] ?? '00'}:00`;
}

function unfoldIcs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfoldIcs(text)) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current) {
        const date = icsDate(current.DTSTART ?? '');
        const title = (current.SUMMARY ?? '').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
        if (date && title) {
          events.push({
            title,
            date,
            location: current.LOCATION?.replace(/\\,/g, ',').trim() || undefined,
            description: current.DESCRIPTION?.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim() || undefined,
          });
        }
      }
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).split(';')[0];
        current[key] = line.slice(idx + 1);
      }
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface VcfContact {
  name: string;
  org?: string;
  email?: string;
  phone?: string;
}

export function parseVcf(text: string): VcfContact[] {
  const contacts: VcfContact[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfoldIcs(text)) {
    if (line === 'BEGIN:VCARD') current = {};
    else if (line === 'END:VCARD') {
      if (current?.FN?.trim()) {
        contacts.push({
          name: current.FN.trim(),
          org: current.ORG?.split(';')[0]?.trim() || undefined,
          email: current.EMAIL?.trim() || undefined,
          phone: current.TEL?.trim() || undefined,
        });
      }
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx > 0) current[line.slice(0, idx).split(';')[0]] = line.slice(idx + 1);
    }
  }
  return contacts;
}

/** X/Twitter archive .js files are JSON behind a `window.YTD.x = ` assignment. */
export function stripJsAssignment(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const at = Math.min(
    ...['{', '['].map((c) => {
      const i = trimmed.indexOf(c);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }),
  );
  return at === Number.MAX_SAFE_INTEGER ? trimmed : trimmed.slice(at);
}

/** MBOX mailbox (Gmail Takeout) -> readable per-message text. */
export function mboxToText(text: string): string {
  const messages = text.split(/^From .+$/m).map((m) => m.trim()).filter(Boolean);
  const out: string[] = [];
  for (const raw of messages.slice(0, 300)) {
    const splitAt = raw.indexOf('\n\n');
    const head = splitAt === -1 ? raw : raw.slice(0, splitAt);
    let body = splitAt === -1 ? '' : raw.slice(splitAt + 2);
    const header = (name: string): string =>
      head.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? '';
    body = body
      .split('\n')
      .filter((line) => !/^(Content-Type|Content-Transfer-Encoding|MIME-Version|--)/i.test(line.trim()))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 4000);
    const subject = header('Subject') || '(no subject)';
    const meta = [header('From'), header('Date')].filter(Boolean).join(' · ');
    out.push(`## ${subject}${meta ? `\n${meta}` : ''}${body ? `\n\n${body}` : ''}`);
  }
  return out.length ? `# Mailbox export\n\n${out.join('\n\n')}` : '';
}

/** Apple Health XML (or generic XML) -> compact readable summary/text. */
export function healthXmlToText(text: string): string {
  const records = [...text.matchAll(/<Record\s+[^>]*>/g)].map((m) => m[0]);
  if (records.length > 0) {
    const byType = new Map<string, { count: number; sum: number; unit: string; latest: string }>();
    for (const tag of records) {
      const type = tag.match(/type="([^"]+)"/)?.[1]?.replace(/^HK\w+TypeIdentifier/, '') ?? 'Other';
      const value = Number(tag.match(/value="([\d.]+)"/)?.[1] ?? NaN);
      const unit = tag.match(/unit="([^"]+)"/)?.[1] ?? '';
      const start = tag.match(/startDate="([^"]+)"/)?.[1] ?? '';
      const cur = byType.get(type) ?? { count: 0, sum: 0, unit, latest: '' };
      cur.count += 1;
      if (!Number.isNaN(value)) cur.sum += value;
      if (start > cur.latest) cur.latest = start;
      byType.set(type, cur);
    }
    const lines = [...byType.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([type, v]) => {
        const total = v.sum ? ` · total ${Math.round(v.sum * 10) / 10}${v.unit ? ` ${v.unit}` : ''}` : '';
        return `- ${type}: ${v.count} records${total}${v.latest ? ` · latest ${v.latest.slice(0, 10)}` : ''}`;
      });
    return `# Health export summary\n\n${records.length} records summarized on-device:\n\n${lines.join('\n')}`;
  }
  const stripped = text
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped ? `# XML import\n\n${stripped.slice(0, 20000)}` : '';
}

export interface ArchiveTextEntry {
  name: string;
  text: string;
}

/** Unpack an export ZIP locally; returns readable text entries only. */
export async function unzipTextEntries(blob: Blob): Promise<ArchiveTextEntry[]> {
  const fflate = (await import('fflate')) as unknown as {
    unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
    strFromU8: (data: Uint8Array) => string;
  };
  const files = fflate.unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const entries: ArchiveTextEntry[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const base = name.split('/').pop() ?? name;
    if (base.startsWith('.') || name.includes('__MACOSX')) continue;
    if (!ARCHIVE_TEXT_EXTENSIONS.includes(extensionOf(name))) continue;
    try {
      const text = fflate.strFromU8(data);
      if (text.trim()) entries.push({ name, text });
    } catch {
      // Unreadable member: skipped, the rest of the archive still lands.
    }
    if (entries.length >= 150) break;
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** PDF text via pdf.js (dynamic import; text-layer PDFs only). */
export type PdfPasswordKind = 'needs-password' | 'wrong-password';

/** Classify pdf.js password failures so the UI can ask and retry. */
export function pdfPasswordKind(err: unknown): PdfPasswordKind | null {
  const e = err as { name?: string; code?: number; message?: string } | null;
  if (!e) return null;
  if (e.name === 'PasswordException' || /password/i.test(e.message ?? '')) {
    return e.code === 2 ? 'wrong-password' : 'needs-password';
  }
  return null;
}

export async function pdfToText(
  blob: Blob,
  onProgress?: (text: string) => void,
  password?: string,
): Promise<string> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (src: { data: ArrayBuffer; password?: string }) => { promise: Promise<PdfDocLike> };
  };
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as unknown as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  onProgress?.('Reading PDF on-device…');
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer(), password }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((item) => ('str' in item ? String(item.str) : '')).join(' ');
    if (line.trim()) pages.push(line.replace(/\s+/g, ' ').trim());
  }
  return pages.join('\n\n');
}

interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  }>;
}

/** Below this much extracted text, a PDF is treated as scanned/image-only. */
export const OCR_TEXT_THRESHOLD = 20;
export const OCR_MAX_PAGES = 8;

export function needsOcrFallback(text: string): boolean {
  return text.trim().length < OCR_TEXT_THRESHOLD;
}

/**
 * Scanned-PDF fallback: render pages to images and OCR them on-device
 * (Muse Glimmer vision via image.ts). Capped pages keep a huge scan from wedging
 * the tab; the cap is reported through onProgress.
 */
export async function pdfToOcrText(
  blob: Blob,
  password?: string,
  onProgress?: (text: string) => void,
): Promise<string> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (src: { data: ArrayBuffer; password?: string }) => { promise: Promise<PdfDocLike> };
  };
  const workerMod = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as unknown as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer(), password }).promise;
  const { ocrImageBlob } = await import('./image');
  const pages = Math.min(doc.numPages, OCR_MAX_PAGES);
  const texts: string[] = [];
  for (let i = 1; i <= pages; i += 1) {
    onProgress?.(`Reading scanned page ${i} of ${pages} on-device (OCR)…`);
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) continue;
    const text = await ocrImageBlob(png);
    if (text.trim()) texts.push(text.trim());
  }
  if (doc.numPages > OCR_MAX_PAGES) {
    onProgress?.(`Scanned PDF has ${doc.numPages} pages; OCR read the first ${OCR_MAX_PAGES}.`);
  }
  return texts.join('\n\n');
}

/** DOCX text via mammoth (dynamic import). */
export async function docxToText(blob: Blob, onProgress?: (text: string) => void): Promise<string> {
  onProgress?.('Reading document on-device…');
  const mammoth = (await import('mammoth')) as unknown as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
  return result.value.trim();
}
