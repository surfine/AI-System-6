// Minimal ZIP reader copied from server-importers.js. It supports the
// two modes the importer depends on: central directory reads and local
// header fallback, with stored and deflated entries.

"use strict";

const zlib = require("node:zlib");

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function inflateRaw(buffer) {
  return zlib.inflateRawSync(buffer);
}

/**
 * @param {Buffer} buffer
 * @returns {Map<string, Buffer>}
 */
function readZipEntries(buffer) {
  const entries = new Map();
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
      const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
      let offset = cdOffset;
      for (let entryIdx = 0; entryIdx < cdEntriesCount; entryIdx++) {
        if (offset + 46 > buffer.length) break;
        if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
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
                  data = zlib.inflateRawSync(compressed);
                } catch (err) {}
              }
              const normalizedName = name.replace(/\\/g, "/");
              entries.set(normalizedName, data);
            }
          }
        }
        offset = nameStart + nameLength + extraLength + commentLength;
      }
      if (entries.size > 0) return entries;
    } catch (cdError) {}
  }
  entries.clear();
  let offset = 0;
  const localHeader = 0x04034b50;
  while (offset + 30 < buffer.length && buffer.readUInt32LE(offset) === localHeader) {
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
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
        data = zlib.inflateRawSync(compressed);
      } catch (err) {}
    }
    const normalizedName = name.replace(/\\/g, "/");
    entries.set(normalizedName, data);
    offset = dataEnd;
  }
  return entries;
}

module.exports = {
  inflateRaw,
  readZipEntries,
};
