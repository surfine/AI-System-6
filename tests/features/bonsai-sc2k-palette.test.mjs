import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../apps/desktop/app/features/bonsai-sc2k-palette.js", import.meta.url),
  "utf8",
);

function loadModule() {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "bonsai-sc2k-palette.js" });
  return sandbox.window.AISystem6BonsaiSc2kPalette;
}

// Synthetic 8-bit BMP: 14-byte file header, 40-byte DIB, 256-entry colour
// table where entry i is BGRX with a deterministic gradient.
function buildBmp() {
  const paletteBytes = 256 * 4;
  const bytes = new Uint8Array(14 + 40 + paletteBytes);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42; bytes[1] = 0x4d; // "BM"
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 14 + 40 + paletteBytes, true); // pixel data offset
  view.setUint32(14, 40, true); // DIB size
  view.setUint16(18, 16, true); // width
  view.setUint16(22, 16, true); // height
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 8, true); // bpp
  for (let i = 0; i < 256; i += 1) {
    const at = 14 + 40 + i * 4;
    bytes[at] = i & 0xff; bytes[at + 1] = (i * 2) & 0xff; bytes[at + 2] = (i * 3) & 0xff; bytes[at + 3] = 0; // B G R X
  }
  return bytes;
}

test("bonsai sc2k palette: BMP header facts parse the colour table", () => {
  const m = loadModule();
  const bmp = buildBmp();
  assert.equal(m.isBmp(bmp), true);
  const colours = m.paletteOf(bmp);
  assert.equal(colours.length, 256);
  // entry 4 is BGRX: R=12, G=8, B=4
  assert.deepEqual(Array.from(colours[4]), [12, 8, 4, 255]);
  // entry 170: R=510&255=254, G=340&255=84, B=170
  assert.deepEqual(Array.from(colours[170]), [254, 84, 170, 255]);
});

test("bonsai sc2k palette: nibble addressing maps grid row and column", () => {
  const m = loadModule();
  assert.equal(m.mapIndex(0x42), 4 * 16 + 2);
  assert.equal(m.mapIndex(0x00), 0);
  assert.equal(m.mapIndex(0xa1), 10 * 16 + 1);
});

test("bonsai sc2k palette: rasterize fills transparent and opaque pixels", () => {
  const m = loadModule();
  const colours = m.paletteOf(buildBmp());
  const rows = [
    new Map([[0, 0x00], [1, 0x11]]), // 0x00 transparent, 0x11 -> (1,1)
    new Map([[0, 0x22], [1, 0x00]]),
  ];
  const rgba = m.rasterize(rows, 2, 2, colours);
  const px = (x, y) => Array.from(rgba.subarray((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
  assert.deepEqual(px(0, 0), [0, 0, 0, 0]); // transparent
  // index 0x11 -> palette entry 1*16+1 = 17 -> R=51, G=34, B=17
  assert.deepEqual(px(1, 0), [51, 34, 17, 255]);
  // index 0x22 -> palette entry 2*16+2 = 34 -> R=102, G=68, B=34
  assert.deepEqual(px(0, 1), [102, 68, 34, 255]);
  assert.deepEqual(px(1, 1), [0, 0, 0, 0]); // transparent
});
