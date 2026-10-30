// HTML import: Apple Journal exports (and generic web pages) become
// readable entries. Pure string parsing (no DOM), so it is unit-testable
// and identical in browser and Node. Scripts/styles/nav chrome are
// dropped; structure becomes markdown-ish text for the chunker.
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

export function htmlToText(html: string): string {
  let out = html.replace(/\r\n?/g, '\n');
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  out = out.replace(/<(script|style|noscript|svg|head|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  out = out.replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl: string, inner: string) =>
    `\n\n${'#'.repeat(Number(lvl))} ${stripTags(inner)}\n\n`,
  );
  out = out.replace(/<li\b[^>]*>/gi, '\n- ');
  out = out.replace(/<\/(p|div|section|article|li|tr|blockquote)>/gi, '\n\n');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = stripTags(out);
  return decodeEntities(out)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}

export interface JournalPage {
  title: string;
  /** ISO timestamp from the document, when one can be found. */
  date: string | null;
  text: string;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

export function extractHtmlDate(html: string): string | null {
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, ' ');
  const long = text.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})(?:\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i,
  );
  if (long) {
    const month = MONTHS[long[1].toLowerCase()];
    const day = long[2].padStart(2, '0');
    let hour = long[4] ? Number(long[4]) : 12;
    if (long[6]?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (long[6]?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    const minute = long[5] ?? '00';
    return `${long[3]}-${month}-${day}T${String(hour).padStart(2, '0')}:${minute}:00`;
  }
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? '12'}:${iso[5] ?? '00'}:00`;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}T12:00:00`;
  }
  return null;
}

export function parseJournalHtml(html: string, filename: string): JournalPage {
  const titleMatch =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const rawTitle = titleMatch ? decodeEntities(stripTags(titleMatch[1])).replace(/\s+/g, ' ').trim() : '';
  const fallback = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const title = (rawTitle && !/^journal$/i.test(rawTitle) ? rawTitle : fallback).slice(0, 140) || 'Journal import';
  const text = htmlToText(html);
  const body = text.startsWith(title) ? text : `# ${title}\n\n${text}`;
  return { title, date: extractHtmlDate(html), text: body };
}

export function isHtmlFilename(name: string): boolean {
  return /\.html?$/i.test(name);
}
