// Minimal ZIP reader copied from server-importers.js. It supports the
// two modes the importer depends on: central directory reads and local
// header fallback, with stored and deflated entries.

"use strict";

const zlib = require("node:zlib");

const ZIP_MAX_ENTRIES = Math.max(
  16,
  Number(process.env.AI_SYSTEM6_ZIP_MAX_ENTRIES || 256)
);
const ZIP_MAX_ENTRY_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.AI_SYSTEM6_ZIP_MAX_ENTRY_BYTES || 8 * 1024 * 1024)
);
const ZIP_MAX_TOTAL_BYTES = Math.max(
  ZIP_MAX_ENTRY_BYTES,
  Number(process.env.AI_SYSTEM6_ZIP_MAX_TOTAL_BYTES || 32 * 1024 * 1024)
);
const ZIP_MAX_COMPRESSION_RATIO = Math.max(
  10,
  Number(process.env.AI_SYSTEM6_ZIP_MAX_COMPRESSION_RATIO || 100)
);

function zipBudgetError(message) {
  const error = /** @type {Error & { statusCode?: number, code?: string }} */ (
    new Error(message)
  );
  error.statusCode = 413;
  error.code = "archive_budget_exceeded";
  return error;
}

function assertEntryBudget(compressedSize, uncompressedSize, totalBytes) {
  if (uncompressedSize > ZIP_MAX_ENTRY_BYTES) {
    throw zipBudgetError(`Archive entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes.`);
  }
  if (
    compressedSize > 0
    && uncompressedSize > compressedSize * ZIP_MAX_COMPRESSION_RATIO
  ) {
    throw zipBudgetError("Archive entry compression ratio is too high.");
  }
  if (totalBytes + uncompressedSize > ZIP_MAX_TOTAL_BYTES) {
    throw zipBudgetError(`Archive expands beyond ${ZIP_MAX_TOTAL_BYTES} bytes.`);
  }
}

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function inflateRaw(buffer) {
  return zlib.inflateRawSync(buffer, { maxOutputLength: ZIP_MAX_ENTRY_BYTES });
}

/**
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
function readZipEntries(buffer) {
  const entries = new Map();
  let totalBytes = 0;
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65535 - 22); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset !== -1) {
    try {
      const cdEntriesCount = buffer.readUInt16LE(eocdOffset + 10);
      if (cdEntriesCount > ZIP_MAX_ENTRIES) {
        throw zipBudgetError(`Archive contains more than ${ZIP_MAX_ENTRIES} entries.`);
      }
      const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
      let offset = cdOffset;
      for (let entryIdx = 0; entryIdx < cdEntriesCount; entryIdx++) {
        if (offset + 46 > buffer.length) break;
        if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        assertEntryBudget(compressedSize, uncompressedSize, totalBytes);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const nameStart = offset + 46;
        if (nameStart + nameLength > buffer.length) break;
        const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
        if (localHeaderOffset + 30 <= buffer.length) {
          if (buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
            const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
            const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const dataEnd = dataStart + compressedSize;
            if (dataEnd <= buffer.length) {
              const compressed = buffer.subarray(dataStart, dataEnd);
              /** @type {Buffer<ArrayBufferLike>} */
              let data = Buffer.alloc(0);
              if (method === 0) {
                data = compressed;
              } else if (method === 8) {
                try {
                  data = zlib.inflateRawSync(compressed, {
                    maxOutputLength: Math.min(ZIP_MAX_ENTRY_BYTES, Math.max(1, uncompressedSize)),
                  });
                } catch (err) {
                  if (/** @type {any} */ (err)?.code === "ERR_BUFFER_TOO_LARGE") {
                    throw zipBudgetError("Archive entry exceeded its declared size.");
                  }
                }
              }
              const normalizedName = name.replace(/\\/g, "/");
              assertEntryBudget(compressedSize, data.length, totalBytes);
              totalBytes += data.length;
              entries.set(normalizedName, data);
            }
          }
        }
        offset = nameStart + nameLength + extraLength + commentLength;
      }
      if (entries.size > 0) return entries;
    } catch (cdError) {
      if (/** @type {any} */ (cdError)?.code === "archive_budget_exceeded") {
        throw cdError;
      }
    }
  }
  entries.clear();
  totalBytes = 0;
  let offset = 0;
  const localHeader = 0x04034b50;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === localHeader) {
    if (entries.size >= ZIP_MAX_ENTRIES) {
      throw zipBudgetError(`Archive contains more than ${ZIP_MAX_ENTRIES} entries.`);
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    assertEntryBudget(compressedSize, uncompressedSize, totalBytes);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;
    if (flags & 0x08 || dataStart > buffer.length) break;
    const dataEnd = dataStart + compressedSize;
    const compressed = buffer.subarray(dataStart, dataEnd);
    /** @type {Buffer<ArrayBufferLike>} */
    let data = Buffer.alloc(0);
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed, {
          maxOutputLength: Math.min(ZIP_MAX_ENTRY_BYTES, Math.max(1, uncompressedSize)),
        });
      } catch (err) {
        if (/** @type {any} */ (err)?.code === "ERR_BUFFER_TOO_LARGE") {
          throw zipBudgetError("Archive entry exceeded its declared size.");
        }
      }
    }
    const normalizedName = name.replace(/\\/g, "/");
    assertEntryBudget(compressedSize, data.length, totalBytes);
    totalBytes += data.length;
    entries.set(normalizedName, data);
    offset = dataEnd;
  }
  return entries;
}

module.exports = {
  inflateRaw,
  readZipEntries,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_ENTRY_BYTES,
  ZIP_MAX_TOTAL_BYTES,
};
