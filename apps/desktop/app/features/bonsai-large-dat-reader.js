// Bonsai City LARGE.DAT sprite-file reader / 盆景城市 LARGE.DAT 精灵文件读取器.
// Clean-room implementation from public format facts (OpenCity2k/SC2k-docs,
// "Sprite File Specification", CC BY-SA 4.0, pinned in
// docs/city-simulator/OPENSC2K-RESEARCH.md). No game code, artwork, sound or
// text is consulted or embedded; the container layout and run-length chunk
// grammar are functional format facts, not creative expression. Headless and
// deterministic: no DOM, no timers, no wall clock, no randomness.
//
// Format facts this reader relies on (Windows 95 sprite files):
//  - The file is a big-endian header followed by sprite chunks. The header
//    starts with a 2-byte sprite count, then that many 10-byte records:
//    sprite id (2B), absolute chunk offset (4B), height px (2B), width px
//    (2B).
//  - A chunk is a run of 2-byte pairs (count, mode). Modes: 1 = new row
//    (count is a row byte-length hint), 2 = end of sprite, 3 = skip count
//    transparent pixels, 4 = count palette-index pixels follow (odd counts
//    are NUL padded to even), 0 = ignored padding.
//  - Palette indices map through a 16x16 grid (PAL_MSTR.BMP): the high nibble
//    picks the row, the low nibble the column.
window.AISystem6BonsaiLargeDatReaderLoaded = true;

(function initBonsaiLargeDatReader() {
  "use strict";

  const HEADER_BYTES = 2;
  const RECORD_BYTES = 10;

  function parseHeader(bytes) {
    if (!ArrayBuffer.isView(bytes)) {
      throw new TypeError("large-dat-header: expected a typed array view");
    }
    if (bytes.length < HEADER_BYTES + RECORD_BYTES) {
      return { count: 0, sprites: [] };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(0, false);
    const sprites = [];
    for (let i = 0; i < count; i += 1) {
      const at = HEADER_BYTES + i * RECORD_BYTES;
      if (at + RECORD_BYTES > bytes.length) break;
      sprites.push({
        id: view.getUint16(at, false),
        offset: view.getUint32(at + 2, false),
        height: view.getUint16(at + 6, false),
        width: view.getUint16(at + 8, false),
      });
    }
    return { count, sprites };
  }

  function decodeSprite(bytes, sprite) {
    // Returns an array of rows; each row is a map of column -> palette index.
    // Transparent columns are absent from the map. Deterministic and pure.
    const rows = [];
    let row = new Map();
    let column = 0;
    let at = sprite.offset;
    const end = bytes.length;
    while (at + 2 <= end) {
      const count = bytes[at];
      const mode = bytes[at + 1];
      at += 2;
      if (mode === 1) {
        if (row.size) rows.push(row);
        row = new Map();
        column = 0;
      } else if (mode === 2) {
        break;
      } else if (mode === 3) {
        column += count;
      } else if (mode === 4) {
        if (at + count > end) break;
        for (let i = 0; i < count; i += 1) {
          row.set(column, bytes[at + i]);
          column += 1;
        }
        at += count;
        if (count % 2 === 1) at += 1; // odd pixel runs carry one pad byte
      }
    }
    if (row.size) rows.push(row);
    return rows;
  }

  window.AISystem6BonsaiLargeDatReader = Object.freeze({
    parseHeader,
    decodeSprite,
  });
})();
