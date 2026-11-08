/**
 * Minimal EXIF reader: finds the capture time in a JPEG before the browser
 * re-encodes the image (which drops all metadata).
 *
 * Returns an ISO-like string. With OffsetTimeOriginal it carries the offset
 * ("2025-06-01T08:30:00+02:00"); without, it is local camera time
 * ("2025-06-01T08:30:00") and the backend applies the HA time zone.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TYPE_ASCII = 2;

interface Tiff {
  view: DataView;
  start: number;
  little: boolean;
}

function readAscii(tiff: Tiff, entry: number): string | null {
  const { view, start, little } = tiff;
  if (view.getUint16(entry + 2, little) !== TYPE_ASCII) return null;
  const count = view.getUint32(entry + 4, little);
  const offset = count <= 4 ? entry + 8 : start + view.getUint32(entry + 8, little);
  if (offset + count > view.byteLength) return null;
  let text = "";
  for (let i = 0; i < count; i++) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** Map tag -> entry position for one IFD. */
function readIfd(tiff: Tiff, ifdOffset: number): Map<number, number> {
  const { view, start, little } = tiff;
  const entries = new Map<number, number>();
  const base = start + ifdOffset;
  if (base + 2 > view.byteLength) return entries;
  const count = view.getUint16(base, little);
  for (let i = 0; i < count; i++) {
    const entry = base + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    entries.set(view.getUint16(entry, little), entry);
  }
  return entries;
}

function parseExif(view: DataView, start: number): string | null {
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const tiff: Tiff = { view, start, little: order === 0x4949 };
  if (view.getUint16(start + 2, tiff.little) !== 0x002a) return null;

  const ifd0 = readIfd(tiff, view.getUint32(start + 4, tiff.little));
  let raw: string | null = null;
  let offset: string | null = null;
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  if (exifPointer !== undefined) {
    const exif = readIfd(tiff, view.getUint32(exifPointer + 8, tiff.little));
    const original = exif.get(TAG_DATETIME_ORIGINAL);
    if (original !== undefined) raw = readAscii(tiff, original);
    const offsetEntry = exif.get(TAG_OFFSET_TIME_ORIGINAL);
    if (offsetEntry !== undefined) offset = readAscii(tiff, offsetEntry);
  }
  if (!raw) {
    const fallback = ifd0.get(TAG_DATETIME);
    if (fallback !== undefined) raw = readAscii(tiff, fallback);
  }
  const match = raw?.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const zone = offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : "";
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`;
}

export function readExifDate(buffer: ArrayBuffer): string | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let pos = 2;
  try {
    while (pos + 4 <= view.byteLength) {
      const marker = view.getUint16(pos);
      if ((marker & 0xff00) !== 0xff00) return null;
      if (marker === 0xffda || marker === 0xffd9) return null; // image data starts
      const length = view.getUint16(pos + 2);
      if (
        marker === 0xffe1 &&
        pos + 10 <= view.byteLength &&
        view.getUint32(pos + 4) === 0x45786966 && // "Exif"
        view.getUint16(pos + 8) === 0
      ) {
        return parseExif(view, pos + 10);
      }
      pos += 2 + length;
    }
  } catch {
    return null; // truncated or malformed: no date rather than an error
  }
  return null;
}
