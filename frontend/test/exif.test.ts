import { describe, expect, it } from "vitest";

import { readExifDate } from "../src/util/exif";

interface ExifSpec {
  little?: boolean;
  dateTime?: string;
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  /** Put another APP segment before the EXIF one. */
  leadingApp0?: boolean;
}

/** Build a tiny JPEG byte stream with an EXIF APP1 segment. */
function jpegWithExif(spec: ExifSpec): ArrayBuffer {
  const little = spec.little ?? true;
  const ifd0: [number, string | number][] = [];
  const exif: [number, string][] = [];
  if (spec.dateTime) ifd0.push([0x0132, spec.dateTime]);
  if (spec.dateTimeOriginal) exif.push([0x9003, spec.dateTimeOriginal]);
  if (spec.offsetTimeOriginal) exif.push([0x9011, spec.offsetTimeOriginal]);
  if (exif.length) ifd0.push([0x8769, -1]); // pointer, patched below

  const ifd0Size = 2 + ifd0.length * 12 + 4;
  const exifOffset = 8 + ifd0Size;
  const exifSize = exif.length ? 2 + exif.length * 12 + 4 : 0;
  let dataOffset = exifOffset + exifSize;
  const strings = [...ifd0, ...exif].filter(([, v]) => typeof v === "string") as [number, string][];
  const dataSize = strings.reduce((sum, [, v]) => sum + v.length + 1, 0);
  const tiff = new DataView(new ArrayBuffer(dataOffset + dataSize));

  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  tiff.setUint16(2, 0x002a, little);
  tiff.setUint32(4, 8, little);

  const writeIfd = (at: number, entries: [number, string | number][]) => {
    tiff.setUint16(at, entries.length, little);
    entries.forEach(([tag, value], i) => {
      const entry = at + 2 + i * 12;
      tiff.setUint16(entry, tag, little);
      if (typeof value === "string") {
        tiff.setUint16(entry + 2, 2, little); // ASCII
        tiff.setUint32(entry + 4, value.length + 1, little);
        tiff.setUint32(entry + 8, dataOffset, little);
        for (let c = 0; c < value.length; c++) tiff.setUint8(dataOffset + c, value.charCodeAt(c));
        tiff.setUint8(dataOffset + value.length, 0);
        dataOffset += value.length + 1;
      } else {
        tiff.setUint16(entry + 2, 4, little); // LONG
        tiff.setUint32(entry + 4, 1, little);
        tiff.setUint32(entry + 8, exifOffset, little);
      }
    });
    tiff.setUint32(at + 2 + entries.length * 12, 0, little);
  };
  writeIfd(8, ifd0);
  if (exif.length) writeIfd(exifOffset, exif);

  const parts: number[] = [0xff, 0xd8];
  if (spec.leadingApp0) parts.push(0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46);
  const app1Length = 2 + 6 + tiff.byteLength;
  parts.push(0xff, 0xe1, app1Length >> 8, app1Length & 0xff);
  parts.push(0x45, 0x78, 0x69, 0x66, 0x00, 0x00); // "Exif\0\0"
  parts.push(...new Uint8Array(tiff.buffer));
  parts.push(0xff, 0xda, 0x00, 0x02, 0xff, 0xd9);
  return new Uint8Array(parts).buffer;
}

describe("readExifDate", () => {
  it("reads DateTimeOriginal (little endian)", () => {
    expect(readExifDate(jpegWithExif({ dateTimeOriginal: "2025:06:01 08:30:00" }))).toBe(
      "2025-06-01T08:30:00",
    );
  });

  it("reads DateTimeOriginal (big endian) after another APP segment", () => {
    const buffer = jpegWithExif({
      little: false,
      leadingApp0: true,
      dateTimeOriginal: "2024:12:24 18:00:05",
    });
    expect(readExifDate(buffer)).toBe("2024-12-24T18:00:05");
  });

  it("adds the time zone offset when the camera stored one", () => {
    const buffer = jpegWithExif({
      dateTimeOriginal: "2025:06:01 08:30:00",
      offsetTimeOriginal: "+02:00",
    });
    expect(readExifDate(buffer)).toBe("2025-06-01T08:30:00+02:00");
  });

  it("falls back to DateTime from IFD0", () => {
    expect(readExifDate(jpegWithExif({ dateTime: "2023:03:15 10:00:00" }))).toBe(
      "2023-03-15T10:00:00",
    );
  });

  it("prefers DateTimeOriginal over DateTime", () => {
    const buffer = jpegWithExif({
      dateTime: "2023:03:15 10:00:00",
      dateTimeOriginal: "2023:03:14 09:00:00",
    });
    expect(readExifDate(buffer)).toBe("2023-03-14T09:00:00");
  });

  it("returns null for images without a usable date", () => {
    expect(readExifDate(jpegWithExif({}))).toBeNull();
    expect(readExifDate(jpegWithExif({ dateTimeOriginal: "0000:00:00" }))).toBeNull();
    expect(readExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull(); // PNG
    expect(readExifDate(new ArrayBuffer(0))).toBeNull();
  });

  it("does not throw on truncated files", () => {
    const full = new Uint8Array(jpegWithExif({ dateTimeOriginal: "2025:06:01 08:30:00" }));
    for (const length of [3, 6, 12, 20, 40]) {
      expect(() => readExifDate(full.slice(0, length).buffer)).not.toThrow();
    }
  });
});
