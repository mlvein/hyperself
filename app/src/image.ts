// Image import: photos/scans become searchable text entries, dated from
// EXIF when present. OCR runs on-device with Muse Glimmer (Meta's
// multimodal open-weight model) served by the local model server — the
// image is sent only to this device. With no Meta server running, OCR
// returns no text and the import still lands, dated from EXIF.
// EXIF parsing is pure and unit-tested.

import { isMetaModel, loadGlimmerConfig } from './engine';
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif'];

export function isImageFilename(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

export function isImageMime(type: string): boolean {
  return type.startsWith('image/');
}

/** Downscale an uploaded picture to a small square data URL for use as
 * the profile photo. One saved copy at 256px — the original file and any
 * external source are never referenced afterwards. */
export async function fileToProfilePhoto(file: Blob, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for profile photo.');
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/** EXIF DateTimeOriginal (or ModifyDate) as ISO date, or null. JPEG only. */
export function parseExifDate(buffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      const length = view.getUint16(offset + 2);
      if (marker === 0xffe1 && readAscii(view, offset + 4, 4) === 'Exif') {
        return parseTiffDate(view, offset + 10);
      }
      if ((marker & 0xfff0) === 0xffe0 || marker === 0xffe1) {
        offset += 2 + length;
      } else {
        break;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseTiffDate(view: DataView, tiffStart: number): string | null {
  const little = readAscii(view, tiffStart, 2) === 'II';
  const u16 = (o: number): number => view.getUint16(o, little);
  const u32 = (o: number): number => view.getUint32(o, little);
  if (u32(tiffStart + 4) === 0) return null;
  const ifd0 = tiffStart + u32(tiffStart + 4);
  const findTag = (ifd: number, tag: number): number => {
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === tag) return entry;
    }
    return -1;
  };
  const readDateAt = (entry: number): string | null => {
    const count = u32(entry + 4);
    const valueOffset = count <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
    const raw = readAscii(view, valueOffset, Math.min(count, 20)).replace(/\0.*$/, '').trim();
    const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  };
  const exifPointer = findTag(ifd0, 0x8769);
  if (exifPointer >= 0) {
    const exifIfd = tiffStart + u32(exifPointer + 8);
    const original = findTag(exifIfd, 0x9003);
    if (original >= 0) {
      const date = readDateAt(original);
      if (date) return date;
    }
  }
  const modify = findTag(ifd0, 0x0132);
  if (modify >= 0) return readDateAt(modify);
  return null;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`;
}

/**
 * OCR via the local Meta model. Any failure (server off, non-Meta model
 * configured, empty reply) resolves to '' so image import never breaks;
 * the caller records "no readable text" and keeps the EXIF date.
 */
export async function ocrImageBlob(
  blob: Blob,
  onProgress?: (text: string) => void,
  fetchFn: FetchFn = defaultFetch,
): Promise<string> {
  const cfg = loadGlimmerConfig();
  if (!isMetaModel(cfg.model)) return '';
  try {
    onProgress?.('Reading text from image on-device with Muse Glimmer…');
    const dataUrl = await blobToDataUrl(blob);
    const res = await fetchFn(`${cfg.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Transcribe all visible text in this image exactly. Return only the transcribed text, or nothing if there is no text.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 1000,
      }),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '';
    const text = typeof content === 'string' ? content : content.map((part) => part.text ?? '').join('');
    return text.trim();
  } catch {
    return '';
  }
}
