"use strict";
// What a photograph says about itself (P4): pixel dimensions, and the month it
// was taken when the file carries one.
//
// The site's photos.json needs `w` and `h` for every frame — the builder lays
// images out by aspect ratio — and the writer shouldn't have to retype what the
// camera already recorded. So the desk reads the file header directly instead
// of asking the writer: no image library, no decoding, just the bytes that
// every format puts near the front.
//
// Formats: JPEG, PNG, GIF, WebP. HEIC/AVIF are recognised by name and refused —
// a wrong guess at dimensions would silently break the site's layout, and
// "this format needs converting first" is a true answer.

const SIGNATURE_JPEG = Buffer.from([0xff, 0xd8]);
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {boolean} little
 */
function readUInt16(buffer, offset, little) {
  return little ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {boolean} little
 */
function readUInt32(buffer, offset, little) {
  return little ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

/**
 * PNG: the IHDR chunk is always first, at a fixed offset.
 * @param {Buffer} buffer
 */
function pngSize(buffer) {
  if (buffer.length < 24) return null;
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

/**
 * GIF: the logical screen descriptor sits right after the six-byte signature.
 * @param {Buffer} buffer
 */
function gifSize(buffer) {
  if (buffer.length < 10) return null;
  return { w: buffer.readUInt16LE(6), h: buffer.readUInt16LE(8) };
}

/**
 * JPEG: walk the marker segments until a start-of-frame, which carries the
 * dimensions. APPn segments (EXIF, ICC, thumbnails) are skipped by their
 * declared length.
 * @param {Buffer} buffer
 */
function jpegSize(buffer) {
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan: no frame header seen
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    // SOF0–SOF15 except DHT (0xc4), JPG (0xc8) and DAC (0xcc).
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      if (offset + 9 > buffer.length) return null;
      return { h: buffer.readUInt16BE(offset + 5), w: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * WebP: three variants, three ways of storing the size.
 * @param {Buffer} buffer
 */
function webpSize(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    const w = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
    const h = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
    return { w, h };
  }
  if (chunk === "VP8 ") {
    // Lossy: the 10-byte frame header then a 3-byte start code, then 14-bit sizes.
    const start = buffer.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (start < 0 || start + 7 > buffer.length) return null;
    return { w: buffer.readUInt16LE(start + 3) & 0x3fff, h: buffer.readUInt16LE(start + 5) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: 14-bit width-1 then 14-bit height-1, packed after the signature byte.
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

/**
 * HEIC/AVIF share the ISO-BMFF `ftyp` box; the brand names the format.
 * @param {Buffer} buffer
 */
function isoBrand(buffer) {
  if (buffer.length < 12) return "";
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return "";
  return buffer.toString("ascii", 8, 12).trim();
}

/**
 * Identify a photograph's format and pixel size from its bytes.
 * @param {Buffer} buffer
 * @returns {{ ok: true, format: string, w: number, h: number } | { ok: false, format: string, reason: string }}
 */
function imageInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { ok: false, format: "", reason: "empty_file" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(SIGNATURE_PNG)) {
    const size = pngSize(buffer);
    return size && size.w > 0 && size.h > 0 ? { ok: true, format: "png", ...size } : { ok: false, format: "png", reason: "header_unreadable" };
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(SIGNATURE_JPEG)) {
    const size = jpegSize(buffer);
    return size && size.w > 0 && size.h > 0 ? { ok: true, format: "jpeg", ...size } : { ok: false, format: "jpeg", reason: "header_unreadable" };
  }
  if (buffer.toString("ascii", 0, 3) === "GIF") {
    const size = gifSize(buffer);
    return size && size.w > 0 && size.h > 0 ? { ok: true, format: "gif", ...size } : { ok: false, format: "gif", reason: "header_unreadable" };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const size = webpSize(buffer);
    return size && size.w > 0 && size.h > 0 ? { ok: true, format: "webp", ...size } : { ok: false, format: "webp", reason: "header_unreadable" };
  }
  const brand = isoBrand(buffer);
  if (brand) return { ok: false, format: brand, reason: "needs_conversion" };
  return { ok: false, format: "", reason: "unknown_format" };
}

/**
 * The EXIF TIFF block of a JPEG, if it has one.
 * @param {Buffer} buffer
 */
function exifBlock(buffer) {
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null;
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker === 0xe1 && buffer.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
      return { start: offset + 10, end: offset + 2 + length };
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * Read one IFD's entries as tag → { type, count, valueOffset }.
 * @param {Buffer} buffer
 * @param {number} base
 * @param {number} limit
 * @param {number} ifdOffset
 * @param {boolean} little
 */
function readIfd(buffer, base, limit, ifdOffset, little) {
  const tags = new Map();
  const at = base + ifdOffset;
  if (at + 2 > limit) return tags;
  const count = readUInt16(buffer, at, little);
  for (let index = 0; index < count; index += 1) {
    const entry = at + 2 + index * 12;
    if (entry + 12 > limit) break;
    const tag = readUInt16(buffer, entry, little);
    const type = readUInt16(buffer, entry + 2, little);
    const items = readUInt32(buffer, entry + 4, little);
    // A value that fits in four bytes is stored inline; otherwise it is an offset.
    const valueOffset = items * (type === 3 ? 2 : type === 1 || type === 7 || type === 2 ? 1 : 4) <= 4
      ? entry + 8
      : readUInt32(buffer, entry + 8, little);
    tags.set(tag, { type, count: items, at: base + valueOffset, inlineAt: entry + 8 });
  }
  return tags;
}

/**
 * The month a photograph was taken, as "YYYY-MM".
 *
 * EXIF DateTimeOriginal is the camera's own answer; DateTime is the file's
 * last-changed date and is only the fallback. A file without either returns ""
 * so the caller can use the filesystem's date instead of inventing one.
 * @param {Buffer} buffer
 * @returns {string} "YYYY-MM" or ""
 */
function takenMonth(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return "";
  if (!buffer.subarray(0, 2).equals(SIGNATURE_JPEG)) return "";
  const block = exifBlock(buffer);
  if (!block) return "";
  const { start, end } = block;
  const order = buffer.toString("ascii", start, start + 2);
  const little = order === "II";
  if (!little && order !== "MM") return "";
  const magic = readUInt16(buffer, start + 2, little);
  if (magic !== 42) return "";
  const ifd0 = readUInt32(buffer, start + 4, little);
  const top = readIfd(buffer, start, end, ifd0, little);

  const ascii = (entry) => {
    if (!entry || entry.type !== 2) return "";
    const from = entry.count <= 4 ? entry.inlineAt : entry.at;
    if (from + Math.min(entry.count, 20) > end) return "";
    const raw = buffer.toString("latin1", from, Math.min(from + entry.count, end));
    const match = raw.match(/(\d{4})[:-](\d{2})[:-](\d{2})/);
    return match ? `${match[1]}-${match[2]}` : "";
  };

  const exifPointer = top.get(0x8769);
  if (exifPointer) {
    const exifIfd = readIfd(buffer, start, end, readUInt32(buffer, exifPointer.inlineAt, little), little);
    const original = ascii(exifIfd.get(0x9003));
    if (original) return original;
  }
  return ascii(top.get(0x0132));
}

module.exports = Object.freeze({ imageInfo, takenMonth });
