import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// Load the reader the same way the app does: as a lazy runtime module that
// registers a headless global. The test builds synthetic containers only.
const source = readFileSync(
  new URL("../../apps/desktop/app/features/bonsai-sc2000-reader.js", import.meta.url),
  "utf8",
);

function loadReader() {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: "bonsai-sc2000-reader.js" });
  return sandbox.window.AISystem6BonsaiSc2000Reader;
}

function buildContainer(files) {
  // files: [{name, bytes}] — directory is firstOffset bytes; offsets are
  // little-endian; sizes are implicit gaps, exactly as the format notes say.
  const dirBytes = files.length * 16;
  const body = [];
  for (const file of files) body.push(...file.bytes);
  const bytes = new Uint8Array(dirBytes + body.length);
  const view = new DataView(bytes.buffer);
  let cursor = dirBytes;
  files.forEach((file, i) => {
    const nameBytes = new TextEncoder().encode(file.name);
    for (let j = 0; j < 12; j += 1) {
      bytes[i * 16 + j] = j < nameBytes.length ? nameBytes[j] : 0;
    }
    view.setUint32(i * 16 + 12, cursor, true);
    bytes.set(file.bytes, cursor);
    cursor += file.bytes.length;
  });
  return bytes;
}

test("bonsai sc2000 reader: directory aliasing and implicit sizes", () => {
  const reader = loadReader();
  const bytes = buildContainer([
    { name: "TXT1200", bytes: new TextEncoder().encode("hello world") },
    { name: "TXT1201", bytes: new TextEncoder().encode("hello world") }, // alias
    { name: "SMALL.DAT", bytes: new Uint8Array([1, 2, 3, 4]) },
    { name: "OTHER.DAT", bytes: new Uint8Array(8) },
    { name: "TRAILER", bytes: new Uint8Array([9, 9]) }, // bounds OTHER.DAT
  ]);
  const entries = reader.readContainer(bytes);
  const actual = JSON.stringify(entries.map((e) => [String(e.name), Number(e.size), Number(e.offset)]));
  assert.equal(actual, JSON.stringify([
    ["TXT1200", 11, 80],
    ["TXT1201", 11, 91],
    ["SMALL.DAT", 4, 102],
    ["OTHER.DAT", 8, 106],
    ["TRAILER", 2, 114],
  ]));
  assert.equal(new TextDecoder().decode(reader.sliceEntry(bytes, entries[0])), "hello world");
  assert.deepEqual([...reader.sliceEntry(bytes, entries[2])], [1, 2, 3, 4]);
});

test("bonsai sc2000 reader: empty directory", () => {
  const reader = loadReader();
  const empty = new (vm.runInNewContext("Uint8Array"))(0);
  assert.equal(reader.readContainer(empty).length, 0);
});

test("bonsai sc2000 reader: container stops at first data offset", () => {
  const reader = loadReader();
  // 64 directory records (1024 bytes) then one payload per record, each 7
  // bytes. Parsing stops when the cursor reaches the first payload offset,
  // never treating payload bytes as more directory records.
  const recordCount = 64;
  const dirBytes = recordCount * 16;
  const payloadBytes = 7;
  const body = new Uint8Array(recordCount * payloadBytes).map((_, i) => i + 1);
  const bytes = new Uint8Array(dirBytes + body.length);
  const view = new DataView(bytes.buffer);
  const encoder = new TextEncoder();
  let cursor = dirBytes;
  for (let i = 0; i < recordCount; i += 1) {
    const name = encoder.encode(`FILE${String(i).padStart(4, "0")}.DAT`);
    for (let j = 0; j < 12; j += 1) bytes[i * 16 + j] = j < name.length ? name[j] : 0;
    view.setUint32(i * 16 + 12, cursor, true);
    cursor += payloadBytes;
  }
  bytes.set(body, dirBytes);
  const entries = reader.readContainer(bytes);
  assert.equal(entries.length, recordCount);
  assert.equal(entries[0].offset, dirBytes);
  assert.equal(entries[0].size, payloadBytes);
  const slice = reader.sliceEntry(bytes, entries[0]);
  assert.equal(slice.length, payloadBytes);
  assert.equal(slice[0], 1);
  assert.equal(slice[payloadBytes - 1], payloadBytes);
});
