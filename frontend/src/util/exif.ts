/**
 * Minimal EXIF reader for JPEGs, used before the browser re-encodes an image
 * (which drops all metadata):
 *
 * - capture time as an ISO-like string. With OffsetTimeOriginal it carries the
 *   offset ("2025-06-01T08:30:00+02:00"); without, it is local camera time
 *   ("2025-06-01T08:30:00") and the backend applies the HA time zone.
 * - GPS position, only to *suggest* a spot on the plan. It is never stored:
 *   the server strips all metadata from the files it keeps.
 */

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const GPS_LAT_REF = 1;
const GPS_LAT = 2;
const GPS_LON_REF = 3;
const GPS_LON = 4;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

export interface GpsPosition {
  latitude: number;
  longitude: number;
}

export interface ExifInfo {
  takenAt: string | null;
  gps: GpsPosition | null;
}

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

/** Degrees from three rationals (degrees, minutes, seconds). */
function readDegrees(tiff: Tiff, entry: number): number | null {
  const { view, start, little } = tiff;
  if (view.getUint16(entry + 2, little) !== TYPE_RATIONAL) return null;
  if (view.getUint32(entry + 4, little) !== 3) return null;
  const offset = start + view.getUint32(entry + 8, little);
  if (offset + 24 > view.byteLength) return null;
  const parts = [0, 1, 2].map((i) => {
    const numerator = view.getUint32(offset + i * 8, little);
    const denominator = view.getUint32(offset + i * 8 + 4, little);
    return denominator ? numerator / denominator : 0;
  });
  const [deg = 0, min = 0, sec = 0] = parts;
  return deg + min / 60 + sec / 3600;
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

function parseDate(tiff: Tiff, ifd0: Map<number, number>): string | null {
  const { view, little } = tiff;
  let raw: string | null = null;
  let offset: string | null = null;
  const exifPointer = ifd0.get(TAG_EXIF_IFD);
  if (exifPointer !== undefined) {
    const exif = readIfd(tiff, view.getUint32(exifPointer + 8, little));
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

function parseGps(tiff: Tiff, ifd0: Map<number, number>): GpsPosition | null {
  const pointer = ifd0.get(TAG_GPS_IFD);
  if (pointer === undefined) return null;
  const gps = readIfd(tiff, tiff.view.getUint32(pointer + 8, tiff.little));
  const entry = (tag: number) => gps.get(tag);
  const latEntry = entry(GPS_LAT);
  const lonEntry = entry(GPS_LON);
  if (latEntry === undefined || lonEntry === undefined) return null;
  const lat = readDegrees(tiff, latEntry);
  const lon = readDegrees(tiff, lonEntry);
  if (lat === null || lon === null || (lat === 0 && lon === 0)) return null;
  const latRefEntry = entry(GPS_LAT_REF);
  const lonRefEntry = entry(GPS_LON_REF);
  const latRef = latRefEntry === undefined ? "N" : readAscii(tiff, latRefEntry);
  const lonRef = lonRefEntry === undefined ? "E" : readAscii(tiff, lonRefEntry);
  return {
    latitude: latRef === "S" ? -lat : lat,
    longitude: lonRef === "W" ? -lon : lon,
  };
}

export function readExif(buffer: ArrayBuffer): ExifInfo {
  const none: ExifInfo = { takenAt: null, gps: null };
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return none;
  let pos = 2;
  try {
    while (pos + 4 <= view.byteLength) {
      const marker = view.getUint16(pos);
      if ((marker & 0xff00) !== 0xff00) return none;
      if (marker === 0xffda || marker === 0xffd9) return none; // image data starts
      const length = view.getUint16(pos + 2);
      if (
        marker === 0xffe1 &&
        pos + 10 <= view.byteLength &&
        view.getUint32(pos + 4) === 0x45786966 && // "Exif"
        view.getUint16(pos + 8) === 0
      ) {
        const start = pos + 10;
        const order = view.getUint16(start);
        if (order !== 0x4949 && order !== 0x4d4d) return none;
        const tiff: Tiff = { view, start, little: order === 0x4949 };
        if (view.getUint16(start + 2, tiff.little) !== 0x002a) return none;
        const ifd0 = readIfd(tiff, view.getUint32(start + 4, tiff.little));
        return { takenAt: parseDate(tiff, ifd0), gps: parseGps(tiff, ifd0) };
      }
      pos += 2 + length;
    }
  } catch {
    return none; // truncated or malformed: no data rather than an error
  }
  return none;
}

export function readExifDate(buffer: ArrayBuffer): string | null {
  return readExif(buffer).takenAt;
}
