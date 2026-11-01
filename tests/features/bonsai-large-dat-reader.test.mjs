import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../apps/desktop/app/features/bonsai-large-dat-reader.js", import.meta.url),
  "utf8",
);

function loadReader() {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "bonsai-large-dat-reader.js" });
  return sandbox.window.AISystem6BonsaiLargeDatReader;
}

// Emit one sprite's chunk bytes from a row description. Rows are arrays of
// segments; each segment is [count, mode, payload...] exactly as the file
// grammar reads them back.
function spriteChunk(rows) {
  const out = [];
  for (const row of rows) {
    out.push(row.length + 1, 0x01); // row marker: count = row bytes + mode byte
    for (const segment of row) out.push(...segment);
  }
  out.push(0x00, 0x02); // end marker
  return out;
}

function buildFile() {
  // Sprite 0 (id 0x04e8, 4x2): row 1 = skip 1 then 3 pixels; row 2 = 2 pixels.
  const s0 = spriteChunk([
    [[0x01, 0x03], [0x03, 0x04, 0x09, 0x07, 0x09, 0x00]],
    [[0x02, 0x04, 0x03, 0x01]],
  ]);
  // Sprite 1 (id 0x04e9, 3x1): a single 3-pixel run carries one pad byte.
  const s1 = spriteChunk([
    [[0x03, 0x04, 0x01, 0x02, 0x03, 0x00]],
  ]);
  const body = [...s0, ...s1];
  const headerBytes = 2 + 2 * 10;
  const bytes = new Uint8Array(headerBytes + body.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 2, false);
  view.setUint16(2, 0x04e8, false);
  view.setUint32(4, headerBytes, false);
  view.setUint16(8, 2, false);
  view.setUint16(10, 4, false);
  view.setUint16(12, 0x04e9, false);
  view.setUint32(14, headerBytes + s0.length, false);
  view.setUint16(18, 1, false);
  view.setUint16(20, 3, false);
  body.forEach((b, i) => { bytes[headerBytes + i] = b; });
  return bytes;
}

test("bonsai large.dat reader: header parses count, ids, offsets and sizes", () => {
  const reader = loadReader();
  const bytes = buildFile();
  const { count, sprites } = reader.parseHeader(bytes);
  assert.equal(count, 2);
  assert.equal(sprites.length, 2);
  assert.equal(sprites[0].id, 0x04e8);
  assert.equal(sprites[0].offset, 22);
  assert.equal(sprites[0].height, 2);
  assert.equal(sprites[0].width, 4);
  assert.equal(sprites[1].id, 0x04e9);
  assert.equal(sprites[1].offset, 22 + 18); // 18 chunk bytes for sprite 0
  assert.equal(sprites[1].height, 1);
  assert.equal(sprites[1].width, 3);
});

test("bonsai large.dat reader: chunk grammar decodes transparent skips and palettes", () => {
  const reader = loadReader();
  const bytes = buildFile();
  const { sprites } = reader.parseHeader(bytes);
  const rows = reader.decodeSprite(bytes, sprites[0]);
  assert.equal(rows.length, 2);
  // row 1: column 1..3 = 9,7,9
  assert.equal(JSON.stringify(Array.from(rows[0].entries())), JSON.stringify([[1, 9], [2, 7], [3, 9]]));
  // row 2: columns 0..1 = 3,1
  assert.equal(JSON.stringify(Array.from(rows[1].entries())), JSON.stringify([[0, 3], [1, 1]]));

  const rows2 = reader.decodeSprite(bytes, sprites[1]);
  assert.equal(rows2.length, 1);
  assert.equal(JSON.stringify(Array.from(rows2[0].entries())), JSON.stringify([[0, 1], [1, 2], [2, 3]]));
});

test("bonsai large.dat reader: end marker stops a sprite mid-file", () => {
  const reader = loadReader();
  const bytes = buildFile();
  const { sprites } = reader.parseHeader(bytes);
  const rows = reader.decodeSprite(bytes, sprites[1]);
  // Sprite 1 ends at its own 0x00 0x02 pair; decoding never runs past it
  // into sprite 0's data or past EOF.
  assert.equal(rows.length, 1);
  assert.equal(rows[0].size, 3);
});
