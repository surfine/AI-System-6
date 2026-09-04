// Bonsai City SC2000.DAT container reader / 盆景城市 SC2000.DAT 容器读取器.
// Clean-room implementation from public format facts (Krusher 2017 format
// notes, CC BY-SA 4.0 blog; QuickBMS unpack script by Cameron Cawley), all
// recorded in the project's own words below. No game code, artwork, sound or
// text is consulted or embedded; the container's layout is a functional
// format fact, not creative expression. Headless and deterministic: no DOM,
// no timers, no wall clock, no randomness.
//
// Format facts this reader relies on:
//  - SC2000.DAT has no global header; a directory of fixed 16-byte records
//    starts at byte 0.
//  - Each record is a 12-byte MS-DOS-style name (8.3, NUL padded) followed by
//    a 32-bit little-endian offset of the entry's first byte.
//  - The directory runs until the first recorded offset, so its length is
//    that offset; each file's size is the gap to the next offset (or to EOF
//    for the last entry). Duplicate directory names alias one file region.
window.AISystem6BonsaiSc2000ReaderLoaded = true;

(function initBonsaiSc2000Reader() {
  "use strict";

  const RECORD_BYTES = 16;
  const NAME_BYTES = 12;
  const OFFSET_BYTES = 4;

  function parseDirectory(bytes) {
    if (!ArrayBuffer.isView(bytes)) {
      throw new TypeError("sc2000-directory: expected a typed array view");
    }
    if (bytes.length < RECORD_BYTES) return [];
    const firstView = new DataView(bytes.buffer, bytes.byteOffset + NAME_BYTES, OFFSET_BYTES);
    const firstOffset = firstView.getUint32(0, true);
    // The directory occupies exactly firstOffset bytes (each record is 16).
    const recordCount = Math.min(Math.floor(firstOffset / RECORD_BYTES), Math.floor(bytes.length / RECORD_BYTES));
    const records = [];
    for (let i = 0; i < recordCount; i += 1) {
      const at = i * RECORD_BYTES;
      const nameBytes = bytes.subarray(at, at + NAME_BYTES);
      let name = "";
      for (const b of nameBytes) {
        if (b === 0) break;
        name += String.fromCharCode(b);
      }
      const dataView = new DataView(bytes.buffer, bytes.byteOffset + at + NAME_BYTES, OFFSET_BYTES);
      records.push({ name, offset: dataView.getUint32(0, true) });
    }
    return records;
  }

  function readContainer(bytes) {
    if (!ArrayBuffer.isView(bytes)) {
      throw new TypeError("sc2000-container: expected a typed array view");
    }
    const records = parseDirectory(bytes);
    if (!records.length) return [];
    const entries = [];
    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      const next = records[i + 1];
      const end = next ? next.offset : bytes.length;
      const start = record.offset;
      if (start > bytes.length) break;
      entries.push({
        name: record.name,
        offset: start,
        size: Math.max(0, end - start),
      });
    }
    return entries;
  }

  function sliceEntry(bytes, entry) {
    if (entry.offset + entry.size > bytes.length) {
      throw new RangeError("sc2000-slice: entry out of range");
    }
    return bytes.subarray(entry.offset, entry.offset + entry.size);
  }

  window.AISystem6BonsaiSc2000Reader = Object.freeze({
    readContainer,
    sliceEntry,
  });
})();
