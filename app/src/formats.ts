// Additional upload formats: PDF, DOCX, RTF, JSON exports, ICS calendars,
// VCF contacts. Pure parsers here are unit-testable; PDF/DOCX use lazily
// imported browser libraries so the app shell stays small. All local.
export const DOCUMENT_EXTENSIONS = [
  'md', 'markdown', 'txt', 'csv', 'html', 'htm', 'pdf', 'docx', 'rtf', 'json', 'ics', 'vcf',
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
    const data: unknown = JSON.parse(text);
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

/** PDF text via pdf.js (dynamic import; text-layer PDFs only). */
export async function pdfToText(blob: Blob, onProgress?: (text: string) => void): Promise<string> {
  const pdfjs = (await import('pdfjs-dist')) as unknown as {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDocLike> };
  };
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as unknown as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  onProgress?.('Reading PDF on-device…');
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
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
  }>;
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
