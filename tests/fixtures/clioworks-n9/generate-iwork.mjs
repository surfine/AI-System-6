// ClioWorks N9: generates the synthetic iWork fixtures deterministically.
//   node tests/fixtures/clioworks-n9/generate-iwork.mjs          write the files
//   node tests/fixtures/clioworks-n9/generate-iwork.mjs --check  rebuild and compare, write nothing
// Output (next to this script): sample.pages, sample.numbers, sample.key.
//
// Self-made minimal legal bundles (spec: 自造最小合法文件), not Apple exports:
// real IWA streams — snappy(literal-only) chunks of protobuf archives carrying
// exactly the structures apps/server/server/importers/iwork.js parses (Pages
// storage archives, a Numbers table model + string table + tile, Keynote
// slide files) — plus a hand-built one-page PDF under QuickLook/Preview.pdf,
// the entry the N9 原页阅读 path serves as-is. The builders are exported so
// the contract can also build the failure variants (no preview, no readable
// text) from the same pieces without a second writer.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------- protobuf + snappy */

function protoVarint(value) {
  const bytes = [];
  let v = value;
  do {
    let b = v & 0x7f;
    v = Math.floor(v / 128);
    if (v) b |= 0x80;
    bytes.push(b);
  } while (v);
  return Buffer.from(bytes);
}

function protoField(fieldNumber, wireType, payload) {
  const key = protoVarint((fieldNumber << 3) | wireType);
  if (wireType === 0) return Buffer.concat([key, protoVarint(Number(payload))]);
  if (wireType === 2) return Buffer.concat([key, protoVarint(payload.length), payload]);
  throw new Error("fixture writer: unsupported wire type");
}

/** Literal-only snappy block: every declared length is exact. */
function snappyBlock(body) {
  const chunks = [protoVarint(body.length)];
  const tag = Buffer.from([0]); // literal, length 1
  for (const byte of body) chunks.push(tag, Buffer.from([byte]));
  return Buffer.concat(chunks);
}

function iwaChunk(snappy) {
  const header = Buffer.alloc(4);
  header[0] = 0;
  header.writeUIntLE(snappy.length, 1, 3);
  return Buffer.concat([header, snappy]);
}

/** One archive: [varint headerLen][header: id + messageInfos][messages…]. */
function iwaArchive(identifier, messages) {
  const infos = messages.map((m) => Buffer.concat([
    protoField(1, 0, m.type),
    protoField(3, 0, m.payload.length),
  ]));
  const header = Buffer.concat([protoField(1, 0, identifier), ...infos.map((info) => protoField(2, 2, info))]);
  return iwaChunk(snappyBlock(Buffer.concat([protoVarint(header.length), header, ...messages.map((m) => m.payload)])));
}

/** A Pages storage archive's text payload (field 3 chunks). */
const storage = (text) => protoField(3, 2, Buffer.from(text, "utf8"));

/* ---------------------------------------------------------------- STORE zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) c = CRC_TABLE[(c ^ buffer[index]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** STORE-mode ZIP, entry order preserved (the importer's reader only reads). */
export function writeZipEntries(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuffer, end]);
}

/* -------------------------------------------------- minimal one-page PDF */

/** A structurally valid one-page PDF (correct xref), so the fixture's preview
 * is a PDF a reader could actually open, not just bytes with a header. */
export function minimalPreviewPdf(label) {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 240 80]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    null, // content stream, filled once its length is known
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  const text = `BT /F1 12 Tf 24 40 Td (${label}) Tj ET`;
  objects[3] = `<</Length ${Buffer.byteLength(text, "latin1")}>>stream\n${text}\nendstream`;

  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets = [0];
  let position = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(position);
    const part = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    chunks.push(part);
    position += part.length;
  });
  const xrefOffset = position;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  chunks.push(Buffer.from(`${xref}trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

/* ------------------------------------------------------------ the fixtures */

export function buildPagesFixture({ preview = true } = {}) {
  const entries = [
    ["Index/Document.iwa", Buffer.concat([
      iwaArchive(1, [{ type: 2001, payload: storage("搬家周报") }]),
      iwaArchive(2, [{ type: 2001, payload: storage("这个周末要把东西搬到新家，先做准备。") }]),
    ])],
    ["Index/Extra.iwa", iwaArchive(3, [{ type: 2113, payload: storage("第一批装书，第二批装厨房。") }])],
    ["Data/full-moon.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])],
  ];
  if (preview) entries.push(["QuickLook/Preview.pdf", minimalPreviewPdf("ClioWorks N9 pages sample")]);
  return writeZipEntries(entries);
}

export function buildNumbersFixture({ preview = true } = {}) {
  // Table model (id 1) → dataStore: tile ref (id 3) + string table ref (id 2).
  const ref = (id) => protoField(1, 0, id);
  const stringEntry = (key, text) => Buffer.concat([protoField(1, 0, key), protoField(3, 2, Buffer.from(text, "utf8"))]);
  const stringsPayload = Buffer.concat([
    stringEntry(9001, "物品"), stringEntry(9003, "数量"),
    stringEntry(9002, "纸箱"), stringEntry(9004, "20"),
  ].map((entry) => protoField(3, 2, entry)));

  // One tile row of wide-offset cells; a cell's string-table key sits at
  // storage offset + 12 (numbersCellKey's first read).
  const cellStorage = (keys) => {
    const buffer = Buffer.alloc(keys.length * 16);
    keys.forEach((key, index) => buffer.writeUInt32LE(key, index * 16 + 12));
    return buffer;
  };
  const wideOffsets = (count) => Buffer.concat(Array.from({ length: count }, (_, index) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(index * 16);
    return b;
  }));
  const rowInfo = (rowIndex, keys) => Buffer.concat([
    protoField(1, 0, rowIndex),
    protoField(2, 0, keys.length),
    protoField(6, 2, cellStorage(keys)),
    protoField(7, 2, wideOffsets(keys.length)),
    protoField(8, 0, 1), // wide offsets
  ]);
  const tilePayload = Buffer.concat([
    rowInfo(1, [9001, 9003]),
    rowInfo(2, [9002, 9004]),
  ].map((row) => protoField(5, 2, row)));

  const dataStore = Buffer.concat([
    protoField(3, 2, protoField(1, 2, Buffer.concat([protoField(1, 0, 1), protoField(2, 2, ref(3))]))),
    protoField(4, 2, ref(2)),
  ]);
  const model = Buffer.concat([
    protoField(4, 2, dataStore),
    protoField(6, 0, 2), // rows
    protoField(7, 0, 2), // columns
    protoField(8, 2, Buffer.from("预算", "utf8")),
  ]);

  const entries = [
    ["Index/Document.iwa", Buffer.concat([
      iwaArchive(1, [{ type: 6001, payload: model }]),
      iwaArchive(2, [{ type: 3061, payload: stringsPayload }]),
      iwaArchive(3, [{ type: 3061, payload: tilePayload }]),
    ])],
  ];
  if (preview) entries.push(["QuickLook/Preview.pdf", minimalPreviewPdf("ClioWorks N9 numbers sample")]);
  return writeZipEntries(entries);
}

export function buildKeynoteFixture({ preview = true } = {}) {
  const entries = [
    ["Index/Document.iwa", iwaArchive(1, [{ type: 1, payload: protoField(1, 0, 1) }])],
    ["Index/Slide.iwa", Buffer.concat([
      iwaArchive(10, [{ type: 2001, payload: storage("搬家简报") }]),
      iwaArchive(11, [{ type: 2005, payload: storage("周六上午装箱。\n周日下午搬运。") }]),
    ])],
    ["Index/Slide-2.iwa", iwaArchive(12, [{ type: 2001, payload: storage("第二天\n整理新家，先擦地板。") }])],
  ];
  if (preview) entries.push(["QuickLook/Preview.pdf", minimalPreviewPdf("ClioWorks N9 keynote sample")]);
  return writeZipEntries(entries);
}

/** A .pages bundle with nothing readable: no IWA text, no preview. */
export function buildEmptyFixture() {
  return writeZipEntries([
    ["preview.jpg", Buffer.alloc(256, 0x01)],
  ]);
}

/* ------------------------------------------------------------------- main */

const FILES = [
  ["sample.pages", buildPagesFixture()],
  ["sample.numbers", buildNumbersFixture()],
  ["sample.key", buildKeynoteFixture()],
];

// pathToFileURL, not a plain string compare: this checkout lives under a path
// containing a space, which percent-encodes, so a plain
// `file://${process.argv[1]}` never matches (the fixture guard silently
// refused to run, and sample.key was never written).
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const check = process.argv.includes("--check");
  let unchanged = true;
  for (const [name, bytes] of FILES) {
    const path = join(here, name);
    if (check) {
      const current = readFileSync(path);
      const same = current.length === bytes.length && current.equals(bytes);
      if (!same) unchanged = false;
      console.log(`${same ? "OK  " : "DRIFT"} ${name} (${bytes.length} bytes)`);
    } else {
      writeFileSync(path, bytes);
      console.log(`wrote ${name} (${bytes.length} bytes)`);
    }
  }
  if (check && !unchanged) {
    console.error("Fixtures drifted; rerun without --check to refresh them.");
    process.exit(1);
  }
}
