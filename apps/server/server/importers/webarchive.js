// WebArchive importer copied from server-importers.js. Supports the
// macOS plutil XML conversion path plus the bundled binary plist
// parser fallback.

"use strict";

const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  cleanImportedText,
  decodeTextBuffer,
  decodeUtf16BE,
} = require("./shared.js");
const { decodeHtml } = require("../lib/text.js");
const { extractHtmlText } = require("./text.js");

const webArchiveMaxBytes = 25 * 1024 * 1024;

/**
 * @param {Buffer} buffer
 * @param {number} offset
 * @param {number} size
 * @returns {number}
 */
function readUInt(buffer, offset, size) {
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value = (value * 256) + buffer[offset + index];
  }
  return value;
}

/**
 * @param {Buffer} buffer
 * @returns {any}
 */
function parseBinaryPlist(buffer) {
  if (buffer.subarray(0, 8).toString("ascii") !== "bplist00") {
    throw new Error("Not a binary plist.");
  }

  let trailerOffset = buffer.length - 32;
  for (let i = buffer.length - 32; i >= Math.max(0, buffer.length - 1024); i--) {
    if (buffer[i] === 0 && buffer[i + 1] === 0 && buffer[i + 2] === 0 && buffer[i + 3] === 0 && buffer[i + 4] === 0) {
      const offsetIntSize = buffer[i + 6];
      const objectRefSize = buffer[i + 7];
      if ([1, 2, 4, 8].includes(offsetIntSize) && [1, 2, 4, 8].includes(objectRefSize)) {
        try {
          const objectCount = Number(buffer.readBigUInt64BE(i + 8));
          const offsetTableOffset = Number(buffer.readBigUInt64BE(i + 24));
          if (offsetTableOffset + (objectCount * offsetIntSize) === i) {
            trailerOffset = i;
            break;
          }
        } catch {}
      }
    }
  }

  const trailer = buffer.subarray(trailerOffset, trailerOffset + 32);
  const offsetIntSize = trailer[6];
  const objectRefSize = trailer[7];
  const objectCount = Number(trailer.readBigUInt64BE(8));
  const topObject = Number(trailer.readBigUInt64BE(16));
  const offsetTableOffset = Number(trailer.readBigUInt64BE(24));
  const offsets = [];

  for (let index = 0; index < objectCount; index += 1) {
    offsets.push(readUInt(buffer, offsetTableOffset + (index * offsetIntSize), offsetIntSize));
  }

  /**
   * @param {number} offset
   * @param {number} lowNibble
   * @returns {{ length: number, offset: number }}
   */
  function readLength(offset, lowNibble) {
    if (lowNibble < 0x0f) return { length: lowNibble, offset };
    const marker = buffer[offset];
    const type = marker >> 4;
    const size = 2 ** (marker & 0x0f);
    if (type !== 0x1) throw new Error("Invalid binary plist length.");
    return {
      length: readUInt(buffer, offset + 1, size),
      offset: offset + 1 + size,
    };
  }

  /**
   * @param {number} index
   * @returns {any}
   */
  function parseObject(index) {
    const objectOffset = offsets[index];
    const marker = buffer[objectOffset];
    const type = marker >> 4;
    const info = marker & 0x0f;
    let cursor = objectOffset + 1;

    if (type === 0x0) {
      if (info === 0x8) return false;
      if (info === 0x9) return true;
      return null;
    }
    if (type === 0x1) {
      return readUInt(buffer, cursor, 2 ** info);
    }
    if (type === 0x4) {
      const result = readLength(cursor, info);
      return buffer.subarray(result.offset, result.offset + result.length);
    }
    if (type === 0x5) {
      const result = readLength(cursor, info);
      return buffer.toString("ascii", result.offset, result.offset + result.length);
    }
    if (type === 0x6) {
      const result = readLength(cursor, info);
      return decodeUtf16BE(buffer.subarray(result.offset, result.offset + (result.length * 2)));
    }
    if (type === 0xa) {
      const result = readLength(cursor, info);
      cursor = result.offset;
      return Array.from({ length: result.length }, (_, itemIndex) =>
        parseObject(readUInt(buffer, cursor + (itemIndex * objectRefSize), objectRefSize))
      );
    }
    if (type === 0xd) {
      const result = readLength(cursor, info);
      cursor = result.offset;
      const keysOffset = cursor;
      const valuesOffset = cursor + (result.length * objectRefSize);
      const dict = {};
      for (let itemIndex = 0; itemIndex < result.length; itemIndex += 1) {
        const keyRef = readUInt(buffer, keysOffset + (itemIndex * objectRefSize), objectRefSize);
        const valueRef = readUInt(buffer, valuesOffset + (itemIndex * objectRefSize), objectRefSize);
        dict[String(parseObject(keyRef))] = parseObject(valueRef);
      }
      return dict;
    }

    return null;
  }

  return parseObject(topObject);
}

/**
 * @param {any} value
 * @returns {Buffer}
 */
function decodeWebArchiveData(value) {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === "string") return Buffer.from(value, "base64");
  if (Array.isArray(value)) return Buffer.from(value);
  if (typeof value === "object") {
    if (typeof value.data === "string") return Buffer.from(value.data, "base64");
    if (Array.isArray(value.data)) return Buffer.from(value.data);
    if (typeof value.NSData === "string") return Buffer.from(value.NSData, "base64");
    if (Buffer.isBuffer(value.data)) return Buffer.from(value.data);
    if (value.data && value.data instanceof Uint8Array) {
      return Buffer.from(value.data);
    }
  }
  return Buffer.alloc(0);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function parseWebArchiveXmlWithPlutil(buffer) {
  const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "ai-system6-webarchive-"));
  const tempPath = path.join(tempDir, "source.webarchive");

  try {
    fsSync.writeFileSync(tempPath, buffer);
    return execFileSync("plutil", ["-convert", "xml1", "-o", "-", tempPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    fsSync.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * @param {string} dictXml
 * @param {string} key
 * @returns {string}
 */
function extractXmlPlistValue(dictXml, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<key>${escapedKey}</key>\\s*<(string|data)>((?:.|\\n)*?)<\\/\\1>`, "i");
  const match = dictXml.match(pattern);
  if (!match) return "";
  const value = match[2].replace(/\s+/g, match[1].toLowerCase() === "data" ? "" : " ").trim();
  return match[1].toLowerCase() === "data" ? value : decodeHtml(value);
}

/**
 * @param {string} resourceXml
 * @returns {string}
 */
function extractWebResourceTextFromXml(resourceXml) {
  if (!resourceXml) return "";

  const data = decodeWebArchiveData(extractXmlPlistValue(resourceXml, "WebResourceData"));
  const mimeType = extractXmlPlistValue(resourceXml, "WebResourceMIMEType").toLowerCase();
  const encoding = extractXmlPlistValue(resourceXml, "WebResourceTextEncodingName") || "utf-8";
  if (!data.length) return "";

  if (/html|xhtml/.test(mimeType)) {
    return extractHtmlText(data, encoding);
  }
  if (/^text\//.test(mimeType) || /json|xml/.test(mimeType)) {
    return cleanImportedText(decodeTextBuffer(data, encoding));
  }
  return "";
}

/**
 * @param {any} resource
 * @returns {string}
 */
function extractWebResourceText(resource) {
  if (!resource || typeof resource !== "object") return "";

  const data = decodeWebArchiveData(resource.WebResourceData);
  const mimeType = String(resource.WebResourceMIMEType || "").toLowerCase();
  const encoding = resource.WebResourceTextEncodingName || "utf-8";
  if (!data.length) return "";

  if (/html|xhtml/.test(mimeType)) {
    return extractHtmlText(data, encoding);
  }
  if (/^text\//.test(mimeType) || /json|xml/.test(mimeType)) {
    return cleanImportedText(decodeTextBuffer(data, encoding));
  }
  return "";
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractWebArchiveText(buffer) {
  if (buffer.length > webArchiveMaxBytes) {
    throw new Error("This WebArchive is too large for direct File Disk import. Export the page as HTML or PDF first.");
  }

  if (process.platform === "darwin") {
    try {
      const xml = parseWebArchiveXmlWithPlutil(buffer);
      const mainMatch = xml.match(/<key>WebMainResource<\/key>\s*<dict>((?:.|\n)*?)<\/dict>/i);
      const text = cleanImportedText(extractWebResourceTextFromXml(mainMatch?.[1] || ""));
      if (text) return text;
    } catch {
      // Fall through to the bundled parser so macOS imports are not tied to plutil success.
    }
  }

  if (buffer.subarray(0, 8).toString("ascii") === "bplist00") {
    const archive = parseBinaryPlist(buffer);
    const text = cleanImportedText(extractWebResourceText(archive?.WebMainResource));
    if (!text) throw new Error("Could not find readable text in this WebArchive.");
    return text;
  }

  const xml = buffer.toString("utf8");
  const mainMatch = xml.match(/<key>WebMainResource<\/key>\s*<dict>((?:.|\n)*?)<\/dict>/i);
  const text = cleanImportedText(extractWebResourceTextFromXml(mainMatch?.[1] || ""));
  if (!text) throw new Error("Could not find readable text in this WebArchive.");
  return text;
}

module.exports = {
  parseBinaryPlist,
  decodeWebArchiveData,
  parseWebArchiveXmlWithPlutil,
  extractXmlPlistValue,
  extractWebResourceTextFromXml,
  extractWebResourceText,
  extractWebArchiveText,
};
