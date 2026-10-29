// Image import: photos/scans become searchable text entries, dated from
// EXIF when present. OCR runs on-device (Tesseract, one-time language
// download, then offline). EXIF parsing is pure and unit-tested.
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'avif'];

export function isImageFilename(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

export function isImageMime(type: string): boolean {
  return type.startsWith('image/');
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

interface OcrWorker {
  recognize: (image: Blob) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
}

let workerPromise: Promise<OcrWorker> | null = null;

async function loadWorker(onProgress?: (text: string) => void): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      onProgress?.('Loading OCR engine on-device (one-time download)…');
      const mod = (await import('tesseract.js')) as unknown as {
        createWorker: (lang: string) => Promise<OcrWorker>;
      };
      return mod.createWorker('eng');
    })();
  }
  return workerPromise;
}

export async function ocrImageBlob(blob: Blob, onProgress?: (text: string) => void): Promise<string> {
  const worker = await loadWorker(onProgress);
  onProgress?.('Reading text from image on-device…');
  const { data } = await worker.recognize(blob);
  return data.text.trim();
}
