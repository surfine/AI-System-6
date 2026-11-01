// ClioWorks v4.3 (I43-01) contract: the server iWork importer's resource and
// result-reporting fixes (GAP-AUDIT Q01–Q04), tested against synthetic IWA
// streams built here — the byte shapes the parser consumes, under the test's
// control (declared lengths, archive variants, preview bundles).
//
// Q01 A snappy block that DECLARES a huge expansion must be refused before any
//    allocation. The proof is an allocation probe: Buffer.allocUnsafe is
//    instrumented for the decode call, so a code path that allocated first
//    would trip the probe instead of the budget error.
// Q01 B many "modest" chunks cannot outrun the whole-job budget either.
// Q02  an archive header with several messages for one identifier keeps every
//    message; skipped entries are counted in the structured report, and budget
//    errors abort the import instead of degrading to a half-read file.
// Q03  a two-character note and a repeated sentence survive extraction; the
//    structure of the document (found storage archives / tables), not a
//    readable-character count, decides whether there is content.
// Q04  preview images are one page in several sizes: OCR receives ONE image
//    labelled kind "preview" with pageNumber null and pageCount 0.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
// Imported as modules (not createRequire) so the contract visibly executes
// the real importer — the static-contract ratchet reads import specifiers.
const iwork = await import("../../apps/server/server/importers/iwork.js");
const { readZipEntries } = await import("../../apps/server/server/importers/zip.js");

const test = createFeatureTest("iwork-import-quality");

// ---- synthetic IWA construction ------------------------------------------------
// Minimal protobuf + snappy(literal-only) encoders, so every test stream's
// declared lengths are exact and intentional.

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
  throw new Error("test writer: unsupported wire type");
}

/** Snappy literal-only block that decompresses to exactly `declared`… well, to
 * `body`. For the bomb tests the header lies on purpose. */
function snappyBlock(body, declaredLength = body.length) {
  const header = protoVarint(declaredLength);
  const literalTag = Buffer.from([(1 - 1) << 2]); // literal, length 1
  const chunks = [header];
  for (const byte of body) chunks.push(literalTag, Buffer.from([byte]));
  return Buffer.concat(chunks);
}

function iwaChunk(snappy) {
  const header = Buffer.alloc(4);
  header[0] = 0;
  header.writeUIntLE(snappy.length, 1, 3);
  return Buffer.concat([header, snappy]);
}

/** One archive: [varint headerLen][header: id + messageInfos][messages…],
 * snappy-wrapped as one IWA chunk. Messages live AFTER the header — putting
 * them inside it is exactly the kind of stream the report flags. */
function iwaArchive(identifier, messages) {
  const idField = protoField(1, 0, identifier);
  const infos = messages.map((m) => Buffer.concat([
    protoField(1, 0, m.type),
    protoField(3, 0, m.payload.length),
  ]));
  const header = Buffer.concat([idField, ...infos.map((info) => protoField(2, 2, info))]);
  const stream = Buffer.concat([protoVarint(header.length), header, ...messages.map((m) => m.payload)]);
  return iwaChunk(snappyBlock(stream));
}

/** A pages storage archive whose text payload decodes through
 * extractPagesStorageArchiveText (field 3 chunks). */
function storagePayload(text) {
  return protoField(3, 2, Buffer.from(text, "utf8"));
}

// Minimal STORE-mode ZIP writer (the importer's own reader only reads).
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

function writeZipEntries(entries) {
  const encoder = new TextEncoder();
  const files = [...Object.entries(entries)].map(([name, data]) => ({
    nameBytes: encoder.encode(name),
    data: Buffer.isBuffer(data) ? data : Buffer.from(data),
  }));
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(file.nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, Buffer.from(file.nameBytes), file.data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(file.data.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(file.nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, Buffer.from(file.nameBytes));
    offset += local.length + file.nameBytes.length + file.data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuffer, end]);
}

function pagesZip(entries) {
  return writeZipEntries(entries);
}

// ---- tests ---------------------------------------------------------------------

const run = async () => {
  // Q01 A: the allocation probe. A 40-byte chunk declares 2 GiB of expansion.
  const bomb = Buffer.concat([
    iwaChunk(Buffer.concat([protoVarint(2 * 1024 * 1024 * 1024), Buffer.from([0])])),
  ]);
  const bombZip = pagesZip({ "Index/Document.iwa": bomb });

  const realAllocUnsafe = Buffer.allocUnsafe;
  let probeTripped = null;
  Buffer.allocUnsafe = function probedAllocUnsafe(size) {
    if (size > 1024 * 1024) {
      probeTripped = size;
      throw new Error(`PROBE: allocation of ${size} bytes reached Buffer.allocUnsafe`);
    }
    return realAllocUnsafe(size);
  };
  let bombError = null;
  try {
    iwork.extractPagesIwaText(readEntries(bombZip));
  } catch (error) {
    bombError = error;
  } finally {
    Buffer.allocUnsafe = realAllocUnsafe;
  }
  test.assert(bombError && bombError.code === "IWORK_SNAPPY_BLOCK_LIMIT" && probeTripped === null,
    `an oversized declared expansion is refused before allocation (code=${bombError && bombError.code}, probe=${probeTripped})`);

  // Q01 B: the job budget. Two entries whose honest expansions together exceed
  // a small budget: the second is refused, and the refusal aborts the read.
  const bodyA = "A".repeat(600 * 1024);
  const bodyB = "B".repeat(600 * 1024);
  const honestZip = pagesZip({
    "Index/Document.iwa": iwaArchive("1", [{ type: 2001, payload: storagePayload(bodyA) }]),
    "Index/Metadata.iwa": iwaArchive("2", [{ type: 2001, payload: storagePayload(bodyB) }]),
  });
  const entriesHonest = readEntries(honestZip);
  const budget = { remaining: 1024 * 1024 };
  let jobError = null;
  try {
    iwork.extractPagesIwaText(entriesHonest, { budget });
  } catch (error) {
    jobError = error;
  }
  test.assert(jobError && jobError.code === "IWORK_SNAPPY_JOB_LIMIT",
    `many modest chunks cannot outrun the whole-job budget (code=${jobError && jobError.code})`);
  const budgetAgain = { remaining: 4 * 1024 * 1024 };
  const bothRead = iwork.extractPagesIwaText(readEntries(honestZip), { budget: budgetAgain });
  test.assert(bothRead.includes("AAAA") && bothRead.includes("BBBB"),
    "the same stream reads fully under a sufficient budget");

  // Q02: one identifier, three messages (storage text + two variants).
  const multiZip = pagesZip({
    "Index/Document.iwa": iwaArchive("7", [
      { type: 2001, payload: storagePayload("第一句。") },
      { type: 2005, payload: storagePayload("第二句。") },
      { type: 2113, payload: storagePayload("第三句。") },
    ]),
  });
  const multiText = iwork.extractPagesIwaText(readEntries(multiZip));
  test.assert(multiText.includes("第一句。") && multiText.includes("第二句。") && multiText.includes("第三句。"),
    `every message of a multi-message archive survives (${JSON.stringify(multiText)})`);

  // Q03 A: a two-character note is a document.
  const noteZip = pagesZip({
    "Index/Document.iwa": iwaArchive("1", [{ type: 2001, payload: storagePayload("牛奶") }]),
  });
  const noteText = iwork.extractPagesIwaText(readEntries(noteZip));
  test.assert(noteText.includes("牛奶"), `a two-character note reads back whole (${JSON.stringify(noteText)})`);

  // Q03 B: the same sentence on two objects is kept twice.
  const repeatZip = pagesZip({
    "Index/Document.iwa": iwaArchive("1", [{ type: 2001, payload: storagePayload("同一句话") }]),
    "Index/Extra.iwa": iwaArchive("2", [{ type: 2001, payload: storagePayload("同一句话") }]),
  });
  const repeatText = iwork.extractPagesIwaText(readEntries(repeatZip));
  test.assert(repeatText.split("同一句话").length - 1 === 2,
    `a repeated sentence on two objects stays twice (${JSON.stringify(repeatText)})`);

  // Q02 report: a corrupt second entry is counted, not swallowed; the good
  // entry still reads.
  const mixedZip = pagesZip({
    "Index/Document.iwa": iwaArchive("1", [{ type: 2001, payload: storagePayload("好的内容") }]),
    "Index/Broken.iwa": Buffer.from([0x00, 0xff, 0xff, 0xff, 0x01]), // truncated chunk
  });
  const report = { files: 0, skippedFiles: 0, archives: 0, skippedArchives: 0, messages: 0, multiMessageArchives: 0, repeatedIdentifiers: 0 };
  const mixedText = iwork.extractPagesIwaText(readEntries(mixedZip), { report });
  test.assert(mixedText.includes("好的内容") && report.files === 2 && report.skippedFiles === 1,
    `a corrupt entry is counted in the report while the good one reads (${JSON.stringify(report)})`);

  // Q04: preview bundle — three sizes of the same first page, no IWA text.
  const previewZip = pagesZip({
    "preview.jpg": Buffer.alloc(2048, 0x01),
    "preview-web.jpg": Buffer.alloc(512, 0x02),
    "QuickLook/Thumbnail.jpg": Buffer.alloc(128, 0x03),
  });
  const ocr = await iwork.renderIworkOcrImages(previewZip, "pages");
  test.assert(ocr.pages.length === 1 && ocr.pages[0].kind === "preview" && ocr.pages[0].pageNumber === null
    && ocr.pages[0].buffer.length === 2048 && ocr.pageCount === 0 && ocr.previewOnly === true,
    `previews collapse to ONE labeled image, page count stays unknown (${JSON.stringify({ pages: ocr.pages.length, kind: ocr.pages[0] && ocr.pages[0].kind, pageCount: ocr.pageCount })})`);

  // Regression guard: an empty preview-only bundle must NOT report success.
  const emptyZip = pagesZip({ "preview.jpg": Buffer.alloc(0) });
  let emptyError = null;
  try { await iwork.renderIworkOcrImages(emptyZip, "pages"); }
  catch (error) { emptyError = error; }
  test.assert(!!emptyError, "a bundle with no readable content and no preview bytes still fails loudly");

  test.finish();
};

/** readZipEntries equivalent for tests: the importer's own reader. */
function readEntries(zipBuffer) {
  return readZipEntries(zipBuffer);
}

run().catch((error) => {
  test.assert(false, `run failed: ${error && error.stack ? error.stack : error}`);
  test.finish();
});
