"use strict";

const zlib = require("node:zlib");
const { TextDecoder } = require("node:util");
const {
  cleanImportedText,
  decodeTextBuffer,
  stripXml,
} = require("./shared.js");
const { readZipEntries } = require("./zip.js");

const iworkMaxInflatedXmlBytes = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_IWORK_MAX_XML_BYTES || 8 * 1024 * 1024)
);
const { extractPdfText, renderPdfOcrImages } = require("./pdf.js");
const { extractImageText } = require("./image-ocr.js");

const pagesStorageArchiveTypes = new Set([
  2001, 2005, 2101, 2102, 2104, 2105, 2107, 2108, 2113, 2114, 2115, 2116, 2117,
  2118, 2119, 2120, 2121, 2122, 2206, 2207, 2231, 2232, 2400, 2401, 2402,
  2403, 2404, 2405, 2406, 2411,
]);
const numbersTableModelTypes = new Set([
  3061, 6001, 6030, 6100, 6205, 6207, 6208, 6209, 6210, 6211, 6212, 6213,
  6214, 6215, 6216, 6221, 6222, 6223, 6224, 6225, 6226, 6228, 6229, 6231,
  6232, 6233, 6234, 6237, 6238, 6240, 6241, 6242, 6244, 6245, 6246, 6248,
  6249, 6250, 6251, 6252, 6254, 6255, 6256, 6267, 6305, 6318, 6366,
]);
const pagesUtf8Decoder = new TextDecoder("utf-8");

function readProtoVarint(buffer, offset = 0) {
  let value = 0n;
  let shift = 0n;
  let index = offset;

  while (index < buffer.length) {
    const byte = buffer[index];
    index += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value, offset: index };
    }
    shift += 7n;
    if (shift > 70n) throw new Error("Protobuf varint is too long.");
  }

  throw new Error("Truncated protobuf varint.");
}

function readProtoVarintNumber(buffer, offset = 0) {
  const result = readProtoVarint(buffer, offset);
  if (result.value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Protobuf varint is too large.");
  }
  return { value: Number(result.value), offset: result.offset };
}

function skipProtoValue(buffer, offset, wireType) {
  if (wireType === 0) return readProtoVarint(buffer, offset).offset;
  if (wireType === 1) return offset + 8;
  if (wireType === 2) {
    const length = readProtoVarintNumber(buffer, offset);
    return length.offset + length.value;
  }
  if (wireType === 5) return offset + 4;
  throw new Error(`Unsupported protobuf wire type ${wireType}.`);
}

function readProtoFields(buffer) {
  const fields = [];
  let offset = 0;

  while (offset < buffer.length) {
    const key = readProtoVarintNumber(buffer, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType === 0) {
      const value = readProtoVarint(buffer, offset);
      offset = value.offset;
      fields.push({ field, wireType, value: value.value });
      continue;
    }

    if (wireType === 1) {
      if (offset + 8 > buffer.length) throw new Error("Truncated protobuf fixed64.");
      fields.push({ field, wireType, value: buffer.subarray(offset, offset + 8) });
      offset += 8;
      continue;
    }

    if (wireType === 2) {
      const length = readProtoVarintNumber(buffer, offset);
      offset = length.offset;
      const end = offset + length.value;
      if (end > buffer.length) throw new Error("Truncated protobuf bytes.");
      fields.push({ field, wireType, value: buffer.subarray(offset, end) });
      offset = end;
      continue;
    }

    if (wireType === 5) {
      if (offset + 4 > buffer.length) throw new Error("Truncated protobuf fixed32.");
      fields.push({ field, wireType, value: buffer.subarray(offset, offset + 4) });
      offset += 4;
      continue;
    }

    throw new Error(`Unsupported protobuf wire type ${wireType}.`);
  }

  return fields;
}

function uncompressSnappyBlock(input) {
  let offset = 0;
  const length = readProtoVarintNumber(input, offset);
  offset = length.offset;
  const output = Buffer.allocUnsafe(length.value);
  let outOffset = 0;

  while (offset < input.length) {
    const tag = input[offset];
    offset += 1;
    const type = tag & 0x03;

    if (type === 0) {
      let literalLength = tag >> 2;
      if (literalLength < 60) {
        literalLength += 1;
      } else {
        const lengthBytes = literalLength - 59;
        literalLength = 0;
        for (let index = 0; index < lengthBytes; index += 1) {
          literalLength |= input[offset + index] << (8 * index);
        }
        offset += lengthBytes;
        literalLength += 1;
      }

      if (offset + literalLength > input.length || outOffset + literalLength > output.length) {
        throw new Error("Invalid Snappy literal length.");
      }
      input.copy(output, outOffset, offset, offset + literalLength);
      offset += literalLength;
      outOffset += literalLength;
      continue;
    }

    let copyLength = 0;
    let copyOffset = 0;

    if (type === 1) {
      copyLength = ((tag >> 2) & 0x07) + 4;
      copyOffset = ((tag & 0xe0) << 3) | input[offset];
      offset += 1;
    } else if (type === 2) {
      copyLength = (tag >> 2) + 1;
      copyOffset = input[offset] | (input[offset + 1] << 8);
      offset += 2;
    } else {
      copyLength = (tag >> 2) + 1;
      copyOffset = (input[offset] | (input[offset + 1] << 8) | (input[offset + 2] << 16) | (input[offset + 3] << 24)) >>> 0;
      offset += 4;
    }

    if (!copyOffset || copyOffset > outOffset || outOffset + copyLength > output.length) {
      throw new Error("Invalid Snappy copy command.");
    }
    for (let index = 0; index < copyLength; index += 1) {
      output[outOffset + index] = output[outOffset - copyOffset + index];
    }
    outOffset += copyLength;
  }

  if (outOffset !== output.length) {
    throw new Error("Snappy block length mismatch.");
  }
  return output;
}

function decompressIwa(buffer) {
  const chunks = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 4 > buffer.length || buffer[offset] !== 0x00) {
      throw new Error("Invalid IWA Snappy chunk header.");
    }
    const length = buffer[offset + 1] | (buffer[offset + 2] << 8) | (buffer[offset + 3] << 16);
    offset += 4;
    if (offset + length > buffer.length) throw new Error("Truncated IWA Snappy chunk.");
    chunks.push(uncompressSnappyBlock(buffer.subarray(offset, offset + length)));
    offset += length;
  }

  return Buffer.concat(chunks);
}

function parseIwaMessageInfo(buffer) {
  const info = { type: 0, length: 0 };
  let offset = 0;

  while (offset < buffer.length) {
    const key = readProtoVarintNumber(buffer, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType === 0) {
      const value = readProtoVarintNumber(buffer, offset);
      offset = value.offset;
      if (field === 1) info.type = value.value;
      if (field === 3) info.length = value.value;
    } else {
      offset = skipProtoValue(buffer, offset, wireType);
    }
  }

  return info;
}

function parseIwaArchiveInfo(buffer) {
  const archive = { identifier: "", messageInfos: [] };
  let offset = 0;

  while (offset < buffer.length) {
    const key = readProtoVarintNumber(buffer, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType === 0) {
      const value = readProtoVarint(buffer, offset);
      offset = value.offset;
      if (field === 1) archive.identifier = value.value.toString();
      continue;
    }

    if (wireType === 2) {
      const length = readProtoVarintNumber(buffer, offset);
      offset = length.offset;
      const payload = buffer.subarray(offset, offset + length.value);
      offset += length.value;
      if (field === 2) archive.messageInfos.push(parseIwaMessageInfo(payload));
      continue;
    }

    offset = skipProtoValue(buffer, offset, wireType);
  }

  return archive;
}

function parsePagesObjectAttributeIndexes(buffer) {
  const indexes = [];
  let offset = 0;

  while (offset < buffer.length) {
    const key = readProtoVarintNumber(buffer, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wireType = key.value & 0x07;

    if (field !== 1 || wireType !== 2) {
      offset = skipProtoValue(buffer, offset, wireType);
      continue;
    }

    const length = readProtoVarintNumber(buffer, offset);
    offset = length.offset;
    const end = offset + length.value;
    let characterIndex = null;

    while (offset < end) {
      const entryKey = readProtoVarintNumber(buffer, offset);
      offset = entryKey.offset;
      const entryField = entryKey.value >> 3;
      const entryWireType = entryKey.value & 0x07;

      if (entryField === 1 && entryWireType === 0) {
        const value = readProtoVarintNumber(buffer, offset);
        characterIndex = value.value;
        offset = value.offset;
      } else {
        offset = skipProtoValue(buffer, offset, entryWireType);
      }
    }

    if (Number.isFinite(characterIndex)) indexes.push(characterIndex);
  }

  return indexes;
}

function cleanPagesIwaText(value) {
  return cleanImportedText(
    String(value || "")
      .replace(/\uFFFC/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[ \t]+\n/g, "\n")
  );
}

function extractPagesStorageArchiveText(buffer) {
  const textParts = [];
  let paragraphIndexes = [];
  let offset = 0;

  while (offset < buffer.length) {
    const key = readProtoVarintNumber(buffer, offset);
    offset = key.offset;
    const field = key.value >> 3;
    const wireType = key.value & 0x07;

    if (wireType !== 2) {
      offset = skipProtoValue(buffer, offset, wireType);
      continue;
    }

    const length = readProtoVarintNumber(buffer, offset);
    offset = length.offset;
    const payload = buffer.subarray(offset, offset + length.value);
    offset += length.value;

    if (field === 3) {
      textParts.push(pagesUtf8Decoder.decode(payload));
    } else if (field === 5) {
      paragraphIndexes = parsePagesObjectAttributeIndexes(payload);
    }
  }

  const text = textParts.join("");
  const runes = Array.from(text);
  const indexes = Array.from(new Set(paragraphIndexes))
    .filter((index) => index >= 0 && index <= runes.length)
    .sort((a, b) => a - b);

  if (indexes.length > 1) {
    const paragraphs = [];
    for (let index = 0; index < indexes.length; index += 1) {
      const start = indexes[index];
      const end = index + 1 < indexes.length ? indexes[index + 1] : runes.length;
      const paragraph = cleanPagesIwaText(runes.slice(start, end).join(""));
      if (paragraph) paragraphs.push(paragraph);
    }
    return paragraphs.join("\n");
  }

  return cleanPagesIwaText(text);
}

function extractPagesIwaText(entries) {
  const iwaEntries = Array.from(entries.entries())
    .filter(([name, data]) => /^Index\/.+\.iwa$/i.test(name) && data?.length)
    .sort(([nameA], [nameB]) => {
      if (nameA === "Index/Document.iwa") return -1;
      if (nameB === "Index/Document.iwa") return 1;
      return nameA.localeCompare(nameB);
    });
  const chunks = [];
  const seen = new Set();

  for (const [, iwaBuffer] of iwaEntries) {
    let data;
    try {
      data = decompressIwa(iwaBuffer);
    } catch {
      continue;
    }

    try {
      let offset = 0;
      while (offset < data.length) {
        const headerLength = readProtoVarintNumber(data, offset);
        offset = headerLength.offset;
        const headerEnd = offset + headerLength.value;
        if (headerEnd > data.length) break;

        const archive = parseIwaArchiveInfo(data.subarray(offset, headerEnd));
        offset = headerEnd;

        for (const info of archive.messageInfos) {
          const payloadEnd = offset + info.length;
          if (payloadEnd > data.length) {
            offset = data.length;
            break;
          }

          const payload = data.subarray(offset, payloadEnd);
          offset = payloadEnd;
          if (!pagesStorageArchiveTypes.has(info.type)) continue;

          let text = "";
          try {
            text = extractPagesStorageArchiveText(payload);
          } catch {
            continue;
          }
          const key = text.replace(/\s+/g, " ").trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            chunks.push(text);
          }
        }
      }
    } catch {
      continue;
    }
  }

  const text = cleanPagesIwaText(chunks.join("\n\n"));
  const readable = text.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  return readable >= 12 ? text : "";
}

function extractPagesXmlText(entries) {
  const xml = entries.get("index.xml") || entries.get("Index/index.xml");
  if (xml?.length) return cleanImportedText(stripXml(decodeTextBuffer(xml)));

  const gzippedXml = entries.get("index.xml.gz") || entries.get("Index/index.xml.gz");
  if (gzippedXml?.length) {
    return cleanImportedText(stripXml(decodeTextBuffer(zlib.gunzipSync(gzippedXml, {
      maxOutputLength: iworkMaxInflatedXmlBytes,
    }))));
  }

  return "";
}

function previewImages(entries) {
  return [
    ["preview.jpg", "image/jpeg"],
    ["preview.jpeg", "image/jpeg"],
    ["preview.png", "image/png"],
    ["preview-web.jpg", "image/jpeg"],
    ["preview-web.jpeg", "image/jpeg"],
    ["preview-web.png", "image/png"],
    ["QuickLook/Thumbnail.jpg", "image/jpeg"],
    ["QuickLook/Thumbnail.jpeg", "image/jpeg"],
    ["QuickLook/Thumbnail.png", "image/png"],
  ]
    .map(([name, mimeType]) => ({ name, mimeType, data: entries.get(name) }))
    .filter((item) => item.data?.length)
    .sort((a, b) => b.data.length - a.data.length);
}

function iworkPreviewPdf(entries) {
  return entries.get("QuickLook/Preview.pdf") || entries.get("QuickLook/Thumbnail.pdf") || entries.get("preview.pdf");
}

function imagePreviewOcrPages(entries) {
  return previewImages(entries).map((image, index) => ({
    pageNumber: index + 1,
    mimeType: image.mimeType,
    buffer: image.data,
  }));
}

async function renderIworkOcrImages(buffer, kind, options = {}) {
  const entries = readZipEntries(buffer);
  const normalizedKind = String(kind || "").toLowerCase();
  const readableText = normalizedKind === "numbers"
    ? extractNumbersIwaText(entries)
    : normalizedKind === "keynote"
      ? extractKeynoteIwaText(entries)
      : extractPagesIwaText(entries) || extractPagesXmlText(entries);
  if (readableText) {
    return { text: readableText, pages: [], pageCount: 0, truncated: false };
  }

  const previewPdf = iworkPreviewPdf(entries);
  if (previewPdf) return renderPdfOcrImages(previewPdf, options);

  const pages = imagePreviewOcrPages(entries);
  if (pages.length) return { pages, pageCount: pages.length, truncated: false };

  throw new Error("This iWork file needs a readable PDF or image preview for PaddleOCR.");
}

async function extractPagesText(buffer, options = {}) {
  const entries = readZipEntries(buffer);
  const iwaText = extractPagesIwaText(entries);
  if (iwaText) return iwaText;

  const pagesXmlText = extractPagesXmlText(entries);
  if (pagesXmlText) return pagesXmlText;

  const previewPdf = iworkPreviewPdf(entries);
  if (previewPdf) return extractPdfText(previewPdf, options);

  const images = previewImages(entries);
  if (images.length) {
    const text = await extractImageText(images[0].data, images[0].mimeType, options);
    return cleanImportedText(`Pages 预览图 OCR\n${text}`);
  }

  throw new Error("Pages files need a PDF or image preview. Export to DOCX or PDF if this file cannot be read.");
}

function parseIwaRecords(entries) {
  const records = new Map();
  const iwaEntries = Array.from(entries.entries())
    .filter(([name, data]) => /^Index\/.+\.iwa$/i.test(name) && data?.length)
    .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

  for (const [name, iwaBuffer] of iwaEntries) {
    let data;
    try {
      data = decompressIwa(iwaBuffer);
    } catch {
      continue;
    }

    try {
      let offset = 0;
      while (offset < data.length) {
        const headerLength = readProtoVarintNumber(data, offset);
        offset = headerLength.offset;
        const headerEnd = offset + headerLength.value;
        if (headerEnd > data.length) break;

        const archive = parseIwaArchiveInfo(data.subarray(offset, headerEnd));
        offset = headerEnd;

        for (const info of archive.messageInfos) {
          const payloadEnd = offset + info.length;
          if (payloadEnd > data.length) {
            offset = data.length;
            break;
          }

          const payload = data.subarray(offset, payloadEnd);
          offset = payloadEnd;
          if (archive.identifier) {
            records.set(archive.identifier, {
              id: archive.identifier,
              type: info.type,
              payload,
              file: name,
            });
          }
        }
      }
    } catch {
      continue;
    }
  }

  return records;
}

function protoNumber(value) {
  return Number(typeof value === "bigint" ? value : value || 0);
}

function parseIwaReference(buffer) {
  for (const field of readProtoFields(buffer)) {
    if (field.field === 1 && field.wireType === 0) return field.value.toString();
  }
  return "";
}

function parseNumbersTileStorage(buffer) {
  const tiles = [];
  for (const field of readProtoFields(buffer)) {
    if (field.field !== 1 || field.wireType !== 2) continue;

    let tileId = 0;
    let tile = "";
    for (const item of readProtoFields(field.value)) {
      if (item.field === 1 && item.wireType === 0) tileId = protoNumber(item.value);
      if (item.field === 2 && item.wireType === 2) tile = parseIwaReference(item.value);
    }
    if (tile) tiles.push({ tileId, tile });
  }
  return tiles;
}

function parseNumbersDataStore(buffer) {
  const store = {
    tiles: [],
    stringTable: "",
    richTextTable: "",
    formatTable: "",
    multipleChoiceListFormatTable: "",
  };

  for (const field of readProtoFields(buffer)) {
    if (field.field === 3 && field.wireType === 2) store.tiles = parseNumbersTileStorage(field.value);
    if (field.field === 4 && field.wireType === 2) store.stringTable = parseIwaReference(field.value);
    if (field.field === 16 && field.wireType === 2) store.multipleChoiceListFormatTable = parseIwaReference(field.value);
    if (field.field === 17 && field.wireType === 2) store.richTextTable = parseIwaReference(field.value);
    if (field.field === 22 && field.wireType === 2) store.formatTable = parseIwaReference(field.value);
  }

  return store;
}

function parseNumbersTableModel(buffer) {
  const table = { name: "", rows: 0, columns: 0, dataStore: null };

  for (const field of readProtoFields(buffer)) {
    if (field.field === 4 && field.wireType === 2) table.dataStore = parseNumbersDataStore(field.value);
    if (field.field === 6 && field.wireType === 0) table.rows = protoNumber(field.value);
    if (field.field === 7 && field.wireType === 0) table.columns = protoNumber(field.value);
    if (field.field === 8 && field.wireType === 2) table.name = pagesUtf8Decoder.decode(field.value);
  }

  return table;
}

function parseNumbersListEntry(buffer) {
  const entry = { key: null, string: "", reference: "", richTextPayload: "" };

  for (const field of readProtoFields(buffer)) {
    if (field.field === 1 && field.wireType === 0) entry.key = protoNumber(field.value);
    if (field.field === 3 && field.wireType === 2) entry.string = pagesUtf8Decoder.decode(field.value);
    if (field.field === 4 && field.wireType === 2) entry.reference = parseIwaReference(field.value);
    if (field.field === 9 && field.wireType === 2) entry.richTextPayload = parseIwaReference(field.value);
  }

  return entry;
}

function parseNumbersTableDataList(buffer) {
  const entries = [];
  for (const field of readProtoFields(buffer)) {
    if (field.field === 3 && field.wireType === 2) entries.push(parseNumbersListEntry(field.value));
  }
  return entries;
}

function numbersTableDataMap(records, reference) {
  const record = records.get(String(reference || ""));
  const map = new Map();
  if (!record) return map;

  try {
    for (const entry of parseNumbersTableDataList(record.payload)) {
      if (entry.key !== null) map.set(entry.key, entry);
    }
  } catch {
    return new Map();
  }

  return map;
}

function numbersStorageTextByRecord(records, reference) {
  const record = records.get(String(reference || ""));
  if (!record) return "";

  try {
    return cleanPagesIwaText(extractPagesStorageArchiveText(record.payload));
  } catch {
    return "";
  }
}

function numbersRichTextValue(records, entry) {
  if (!entry?.richTextPayload) return "";
  const record = records.get(String(entry.richTextPayload));
  if (!record) return "";

  try {
    for (const field of readProtoFields(record.payload)) {
      if (field.field === 1 && field.wireType === 2) {
        return numbersStorageTextByRecord(records, parseIwaReference(field.value));
      }
    }
  } catch {
    return "";
  }

  return "";
}

function parseNumbersTileRowInfo(buffer) {
  const row = {
    rowIndex: 0,
    cellCount: 0,
    storagePreBnc: null,
    offsetsPreBnc: null,
    storage: null,
    offsets: null,
    wideOffsets: false,
  };

  for (const field of readProtoFields(buffer)) {
    if (field.field === 1 && field.wireType === 0) row.rowIndex = protoNumber(field.value);
    if (field.field === 2 && field.wireType === 0) row.cellCount = protoNumber(field.value);
    if (field.field === 3 && field.wireType === 2) row.storagePreBnc = field.value;
    if (field.field === 4 && field.wireType === 2) row.offsetsPreBnc = field.value;
    if (field.field === 6 && field.wireType === 2) row.storage = field.value;
    if (field.field === 7 && field.wireType === 2) row.offsets = field.value;
    if (field.field === 8 && field.wireType === 0) row.wideOffsets = protoNumber(field.value) !== 0;
  }

  return row;
}

function parseNumbersTile(buffer) {
  const tile = { rows: [] };
  for (const field of readProtoFields(buffer)) {
    if (field.field === 5 && field.wireType === 2) tile.rows.push(parseNumbersTileRowInfo(field.value));
  }
  return tile;
}

function countBits16(value) {
  let count = 0;
  let current = value & 0xffff;
  while (current) {
    count += 1;
    current &= current - 1;
  }
  return count;
}

function numbersCellKey(storage, offset) {
  if (offset + 16 <= storage.length) {
    const directKey = storage.readUInt32LE(offset + 12);
    if (directKey) return directKey;
  }

  if (offset + 8 <= storage.length) {
    const flags = storage.readUInt16LE(offset + 4);
    const keyOffset = offset + 8 + countBits16(flags) * 4;
    if (keyOffset + 4 <= storage.length) return storage.readUInt32LE(keyOffset);
  }

  return 0;
}

function numbersCellOffset(offsets, column, wideOffsets) {
  const byteOffset = column * (wideOffsets ? 4 : 2);
  if (wideOffsets) {
    if (byteOffset + 4 > offsets.length) return null;
    const value = offsets.readUInt32LE(byteOffset);
    return value === 0xffffffff ? null : value;
  }

  if (byteOffset + 2 > offsets.length) return null;
  const value = offsets.readUInt16LE(byteOffset);
  return value === 0xffff ? null : value;
}

function cleanNumbersCellValue(value) {
  return String(value || "")
    .replace(/\uFFFC/g, "")
    .replace(/\u2028/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function formatNumbersCellValue(value) {
  return cleanNumbersCellValue(value)
    .replace(/\s*\n\s*/g, " / ")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]{2,}/g, " ")
    .trim();
}

function numbersCellValue(records, stringMap, richTextMap, storage, offset) {
  const cellType = storage[offset] === 5 && offset + 1 < storage.length ? storage[offset + 1] : 0;
  const key = numbersCellKey(storage, offset);
  if (cellType === 2) return String(key);
  if (!key) return "";

  const stringEntry = stringMap.get(key);
  if (stringEntry?.string) return stringEntry.string;

  const richValue = numbersRichTextValue(records, richTextMap.get(key));
  if (richValue) return richValue;

  return [0, 3, 9].includes(cellType) ? "" : String(key);
}

function extractNumbersTableRows(records, tableRecord) {
  const model = parseNumbersTableModel(tableRecord.payload);
  const stringMap = numbersTableDataMap(records, model.dataStore?.stringTable);
  const richTextMap = numbersTableDataMap(records, model.dataStore?.richTextTable);
  const rowEntries = [];
  let sequence = 0;

  for (const tileInfo of model.dataStore?.tiles || []) {
    const tileRecord = records.get(String(tileInfo.tile));
    if (!tileRecord) continue;

    let tile;
    try {
      tile = parseNumbersTile(tileRecord.payload);
    } catch {
      continue;
    }

    for (const rowInfo of tile.rows) {
      const storage = rowInfo.storage?.length ? rowInfo.storage : rowInfo.storagePreBnc;
      const offsets = rowInfo.offsets?.length ? rowInfo.offsets : rowInfo.offsetsPreBnc;
      if (!storage?.length || !offsets?.length) continue;

      const availableColumns = Math.floor(offsets.length / (rowInfo.wideOffsets ? 4 : 2));
      const columnCount = Math.min(Math.max(model.columns || rowInfo.cellCount || availableColumns, 0), availableColumns, 2048);
      const cells = [];
      for (let column = 0; column < columnCount; column += 1) {
        const cellOffset = numbersCellOffset(offsets, column, rowInfo.wideOffsets);
        if (cellOffset === null || cellOffset >= storage.length) {
          cells.push("");
          continue;
        }
        cells.push(cleanNumbersCellValue(numbersCellValue(records, stringMap, richTextMap, storage, cellOffset)));
      }

      if (cells.some(Boolean)) {
        rowEntries.push({ rowIndex: rowInfo.rowIndex, sequence, cells });
      }
      sequence += 1;
    }
  }

  rowEntries.sort((a, b) => (a.rowIndex - b.rowIndex) || (a.sequence - b.sequence));
  return {
    name: cleanNumbersCellValue(model.name),
    rows: rowEntries.map((row) => row.cells),
  };
}

function extractNumbersIwaText(entries) {
  const records = parseIwaRecords(entries);
  const tables = [];
  const seen = new Set();

  for (const record of records.values()) {
    if (!numbersTableModelTypes.has(record.type)) continue;

    let table;
    try {
      table = extractNumbersTableRows(records, record);
    } catch {
      continue;
    }

    const rows = table.rows.filter((row) => row.some(Boolean));
    const filledCells = rows.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
    if (!table.name && filledCells < 2) continue;
    if (!rows.length) continue;

    const title = table.name || `Table ${tables.length + 1}`;
    const lines = rows
      .map((row) => row.map(formatNumbersCellValue).join("\t").trimEnd())
      .filter((line) => line.trim());
    const text = cleanImportedText(`# ${title}\n${lines.join("\n")}`);
    const signature = text.replace(/\s+/g, " ").trim();
    if (text && !seen.has(signature)) {
      seen.add(signature);
      tables.push(text);
    }
  }

  const text = cleanImportedText(tables.join("\n\n"));
  const readable = text.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  return readable >= 12 ? text : "";
}

async function extractNumbersText(buffer, options = {}) {
  const entries = readZipEntries(buffer);
  const iwaText = extractNumbersIwaText(entries);
  if (iwaText) return iwaText;

  const previewPdf = iworkPreviewPdf(entries);
  if (previewPdf) return extractPdfText(previewPdf, options);

  const images = previewImages(entries);
  if (images.length) {
    const text = await extractImageText(images[0].data, images[0].mimeType, options);
    return cleanImportedText(`Numbers 预览图 OCR\n${text}`);
  }

  throw new Error("Numbers files need readable tables or a preview image. Export to XLSX or PDF if this file cannot be read.");
}

function extractKeynoteIwaText(entries) {
  const slideNames = Array.from(entries.keys())
    .filter((name) => /^Index\/Slide(?:-\d+)?\.iwa$/i.test(name))
    .filter((name) => !/^Index\/TemplateSlide/i.test(name));
  if (!slideNames.length) return "";

  const slideOrder = new Map(slideNames.map((name, index) => [name, index]));
  const slides = slideNames.map(() => []);
  const seenBySlide = slideNames.map(() => new Set());
  const records = parseIwaRecords(entries);

  for (const record of records.values()) {
    const slideIndex = slideOrder.get(record.file);
    if (slideIndex === undefined) continue;

    let text = "";
    try {
      if (pagesStorageArchiveTypes.has(record.type)) {
        text = extractPagesStorageArchiveText(record.payload);
      } else if (numbersTableModelTypes.has(record.type)) {
        const table = extractNumbersTableRows(records, record);
        const rows = table.rows.filter((row) => row.some(Boolean));
        if (rows.length) {
          const title = table.name ? `Table: ${table.name}\n` : "";
          text = `${title}${rows.map((row) => row.map(formatNumbersCellValue).join("\t").trimEnd()).join("\n")}`;
        }
      }
    } catch {
      text = "";
    }

    text = cleanPagesIwaText(text);
    const signature = text.replace(/\s+/g, " ").trim();
    if (signature && !seenBySlide[slideIndex].has(signature)) {
      seenBySlide[slideIndex].add(signature);
      slides[slideIndex].push(text);
    }
  }

  const chunks = slides
    .map((parts, index) => {
      const body = cleanImportedText(parts.join("\n"));
      return body ? `# Slide ${index + 1}\n${body}` : "";
    })
    .filter(Boolean);
  const text = cleanImportedText(chunks.join("\n\n"));
  const readable = text.match(/[\p{Script=Han}\p{L}\p{N}]/gu)?.length || 0;
  return readable >= 12 ? text : "";
}

async function extractKeynoteText(buffer, options = {}) {
  const entries = readZipEntries(buffer);
  const iwaText = extractKeynoteIwaText(entries);
  if (iwaText) return iwaText;

  const previewPdf = iworkPreviewPdf(entries);
  if (previewPdf) return extractPdfText(previewPdf, options);

  const images = previewImages(entries);
  if (images.length) {
    const text = await extractImageText(images[0].data, images[0].mimeType, options);
    return cleanImportedText(`Keynote 预览图 OCR\n${text}`);
  }

  throw new Error("Keynote files need readable slides or a preview image. Export to PPTX or PDF if this file cannot be read.");
}

module.exports = {
  extractPagesText,
  extractNumbersText,
  extractKeynoteText,
  extractPagesIwaText,
  extractNumbersIwaText,
  extractKeynoteIwaText,
  renderIworkOcrImages,
};
