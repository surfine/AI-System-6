// Bonsai City SC2K master-palette mapper / 盆景城市 SC2K 主调色板映射器.
// Clean-room implementation from public format facts (OpenCity2k/SC2k-docs
// sprite spec, CC BY-SA 4.0): an 8-bit BMP whose palette block is a 16x16
// grid of BGRX colours; sprite palette indices address that grid by nibble —
// the high nibble is the row, the low nibble the column. This module maps
// indices to RGBA colours and assembles indexed rows (as decoded by
// bonsai-large-dat-reader) into pixel buffers. No palette or sprite byte
// content is embedded; the file is a runtime input. Headless and
// deterministic.
window.AISystem6BonsaiSc2kPaletteLoaded = true;

(function initBonsaiSc2kPalette() {
  "use strict";

  // BMP layout facts: 14-byte file header, DIB header starts at 14, palette
  // colour table starts at 14 + dibHeaderSize, each entry is 4 bytes
  // (B, G, R, X).
  const BMP_FILE_HEADER_BYTES = 14;
  const BMP_DIB_HEADER_OFFSET = 14;
  const BMP_PALETTE_ENTRY_BYTES = 4;
  const PALETTE_GRID_SIDE = 16;
  const PALETTE_ENTRIES = PALETTE_GRID_SIDE * PALETTE_GRID_SIDE;

  function isBmp(bytes) {
    return ArrayBuffer.isView(bytes)
      && bytes.length >= BMP_FILE_HEADER_BYTES + 4
      && bytes[0] === 0x42 && bytes[1] === 0x4d; // "BM"
  }

  function paletteOf(bytes) {
    if (!isBmp(bytes)) {
      throw new TypeError("sc2k-palette: expected an 8-bit BMP byte view");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pixelDataOffset = view.getUint32(10, true);
    const dibSize = view.getUint32(BMP_DIB_HEADER_OFFSET, true);
    const bpp = view.getUint16(BMP_DIB_HEADER_OFFSET + 14, true);
    if (bpp !== 8) {
      throw new RangeError(`sc2k-palette: expected 8 bpp, got ${bpp}`);
    }
    const paletteStart = BMP_DIB_HEADER_OFFSET + dibSize;
    if (pixelDataOffset < paletteStart + PALETTE_ENTRIES * BMP_PALETTE_ENTRY_BYTES) {
      throw new RangeError("sc2k-palette: BMP has no full 256-entry colour table");
    }
    const colours = new Array(PALETTE_ENTRIES);
    for (let i = 0; i < PALETTE_ENTRIES; i += 1) {
      const at = paletteStart + i * BMP_PALETTE_ENTRY_BYTES;
      colours[i] = [bytes[at + 2], bytes[at + 1], bytes[at], 255];
    }
    return colours;
  }

  // The game addresses the grid by nibbles; index 0 is transparent for
  // sprite rendering (the sprite spec treats unset/0 as transparent).
  function mapIndex(index) {
    return ((index >> 4) & 0x0f) * PALETTE_GRID_SIDE + (index & 0x0f);
  }

  // rows: array of Map<column, paletteIndex> as produced by the large.dat
  // reader. Returns a flat RGBA buffer laid out row-major (width x height),
  // with transparent pixels as [0,0,0,0].
  function rasterize(rows, width, height, colours) {
    const out = new Uint8Array(width * height * 4);
    const rowsList = Array.isArray(rows) ? rows : [];
    for (let y = 0; y < height; y += 1) {
      const row = rowsList[y] && typeof rowsList[y].entries === "function" ? rowsList[y] : new Map();
      for (let x = 0; x < width; x += 1) {
        const index = row.get(x);
        if (index === undefined || index === 0) continue; // transparent
        const entry = colours[mapIndex(index)];
        if (!entry) continue;
        const at = (y * width + x) * 4;
        out[at] = entry[0]; out[at + 1] = entry[1]; out[at + 2] = entry[2]; out[at + 3] = 255;
      }
    }
    return out;
  }

  window.AISystem6BonsaiSc2kPalette = Object.freeze({
    isBmp,
    paletteOf,
    mapIndex,
    rasterize,
  });
})();
