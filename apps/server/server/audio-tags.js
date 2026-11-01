// Read the few tags Soundscape shows for a downloaded track — title, artist,
// album, disc/track numbers, duration and the codec's sample format — straight
// from the file. MP4 (AAC and ALAC in .m4a) and FLAC cover everything the
// Apple Music bridge produces, so no tagging library or Python is needed.
//
// Every reader is defensive: a truncated or unfamiliar file yields empty
// fields, never an exception, and the caller falls back to the file name.

"use strict";

const { promises: fs } = require("node:fs");
const path = require("node:path");

const MAX_MOOV_BYTES = 32 * 1024 * 1024;
const MAX_FLAC_BLOCK_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {{
 *   title: string,
 *   artist: string,
 *   album: string,
 *   disc: number,
 *   track: number,
 *   duration: number,
 *   codec: string,
 *   sampleRate: number,
 *   bitDepth: number,
 * }} AudioTags
 */

/** @returns {AudioTags} */
function emptyTags() {
  return {
    title: "",
    artist: "",
    album: "",
    disc: 0,
    track: 0,
    duration: 0,
    codec: "",
    sampleRate: 0,
    bitDepth: 0,
  };
}

async function readAt(handle, position, length) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, position);
  return buffer.subarray(0, bytesRead);
}

// ---------- MP4 ----------

/** Iterate the boxes inside `buffer[start, end)`. */
function* mp4Boxes(buffer, start = 0, end = buffer.length) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

function findBox(buffer, start, end, type) {
  for (const box of mp4Boxes(buffer, start, end)) {
    if (box.type === type) return box;
  }
  return null;
}

function findPath(buffer, start, end, types) {
  let box = { start, end };
  for (const type of types) {
    box = findBox(buffer, box.start, box.end, type);
    if (!box) return null;
  }
  return box;
}

async function readMoov(handle, fileSize) {
  let offset = 0;
  while (offset + 8 <= fileSize) {
    const head = await readAt(handle, offset, 16);
    if (head.length < 8) return null;
    let size = head.readUInt32BE(0);
    const type = head.toString("latin1", 4, 8);
    let header = 8;
    if (size === 1 && head.length >= 16) {
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) {
      size = fileSize - offset;
    }
    if (size < header) return null;
    if (type === "moov") {
      const bodySize = size - header;
      if (bodySize > MAX_MOOV_BYTES) return null;
      return readAt(handle, offset + header, bodySize);
    }
    offset += size;
  }
  return null;
}

function ilstValue(buffer, item) {
  const data = findBox(buffer, item.start, item.end, "data");
  if (!data || data.end - data.start < 8) return null;
  return buffer.subarray(data.start + 8, data.end);
}

function readMp4Duration(moov, tags) {
  const mvhd = findBox(moov, 0, moov.length, "mvhd");
  if (!mvhd) return;
  const version = moov[mvhd.start];
  const base = mvhd.start + 4;
  let timescale = 0;
  let duration = 0;
  if (version === 1 && base + 28 <= mvhd.end) {
    timescale = moov.readUInt32BE(base + 16);
    duration = Number(moov.readBigUInt64BE(base + 20));
  } else if (base + 16 <= mvhd.end) {
    timescale = moov.readUInt32BE(base + 8);
    duration = moov.readUInt32BE(base + 12);
  }
  if (timescale > 0) tags.duration = Math.round(duration / timescale);
}

function readMp4Format(moov, tags) {
  for (const trak of mp4Boxes(moov, 0, moov.length)) {
    if (trak.type !== "trak") continue;
    const stsd = findPath(moov, trak.start, trak.end, ["mdia", "minf", "stbl", "stsd"]);
    if (!stsd) continue;
    // stsd: version/flags (4) + entry count (4), then sample entries.
    for (const entry of mp4Boxes(moov, stsd.start + 8, stsd.end)) {
      if (entry.type !== "alac" && entry.type !== "mp4a" && entry.type !== "ec-3") continue;
      tags.codec = entry.type === "mp4a" ? "aac" : entry.type === "alac" ? "alac" : "ec3";
      // AudioSampleEntry: 6 reserved + 2 index + 8 reserved + channels (2)
      // + sample size (2) + 4 reserved + sample rate (16.16).
      if (entry.start + 28 <= entry.end) {
        tags.bitDepth = moov.readUInt16BE(entry.start + 18);
        tags.sampleRate = moov.readUInt32BE(entry.start + 24) >>> 16;
      }
      if (entry.type === "alac") {
        // The inner "alac" box holds ALACSpecificConfig after 4 bytes of
        // version/flags: bitDepth at +5, sampleRate in the last 4 bytes.
        const config = findBox(moov, entry.start + 28, entry.end, "alac");
        if (config && config.end - config.start >= 28) {
          const cfg = config.start + 4;
          tags.bitDepth = moov[cfg + 5] || tags.bitDepth;
          tags.sampleRate = moov.readUInt32BE(cfg + 20) || tags.sampleRate;
        }
      }
      if (tags.codec === "aac") tags.bitDepth = 0;
      return;
    }
  }
}

function readMp4Tags(moov, tags) {
  const ilst = findPath(moov, 0, moov.length, ["udta", "meta"]);
  if (!ilst) return;
  // "meta" is a full box: skip its 4 bytes of version/flags.
  const list = findBox(moov, ilst.start + 4, ilst.end, "ilst");
  if (!list) return;
  for (const item of mp4Boxes(moov, list.start, list.end)) {
    const value = ilstValue(moov, item);
    if (!value) continue;
    switch (item.type) {
      case "©nam": tags.title = value.toString("utf8"); break;
      case "©ART": tags.artist = value.toString("utf8"); break;
      case "©alb": tags.album = value.toString("utf8"); break;
      case "aART": if (!tags.artist) tags.artist = value.toString("utf8"); break;
      case "trkn": if (value.length >= 4) tags.track = value.readUInt16BE(2); break;
      case "disk": if (value.length >= 4) tags.disc = value.readUInt16BE(2); break;
      default: break;
    }
  }
}

async function readMp4(handle, fileSize) {
  const tags = emptyTags();
  const moov = await readMoov(handle, fileSize);
  if (!moov) return tags;
  readMp4Duration(moov, tags);
  readMp4Format(moov, tags);
  readMp4Tags(moov, tags);
  return tags;
}

// ---------- FLAC ----------

function applyVorbisComments(block, tags) {
  let offset = 0;
  const vendorLength = block.readUInt32LE(offset);
  offset += 4 + vendorLength;
  if (offset + 4 > block.length) return;
  const count = block.readUInt32LE(offset);
  offset += 4;
  for (let i = 0; i < count && offset + 4 <= block.length; i += 1) {
    const length = block.readUInt32LE(offset);
    offset += 4;
    if (offset + length > block.length) return;
    const comment = block.toString("utf8", offset, offset + length);
    offset += length;
    const split = comment.indexOf("=");
    if (split < 1) continue;
    const key = comment.slice(0, split).toUpperCase();
    const value = comment.slice(split + 1);
    if (key === "TITLE" && !tags.title) tags.title = value;
    else if (key === "ARTIST" && !tags.artist) tags.artist = value;
    else if (key === "ALBUMARTIST" && !tags.artist) tags.artist = value;
    else if (key === "ALBUM" && !tags.album) tags.album = value;
    else if (key === "TRACKNUMBER") tags.track = Number.parseInt(value, 10) || 0;
    else if (key === "DISCNUMBER") tags.disc = Number.parseInt(value, 10) || 0;
  }
}

async function readFlac(handle) {
  const tags = emptyTags();
  tags.codec = "flac";
  const magic = await readAt(handle, 0, 4);
  if (magic.toString("latin1") !== "fLaC") return tags;
  let offset = 4;
  for (let guard = 0; guard < 128; guard += 1) {
    const header = await readAt(handle, offset, 4);
    if (header.length < 4) break;
    const last = (header[0] & 0x80) !== 0;
    const type = header[0] & 0x7f;
    const length = header.readUIntBE(1, 3);
    offset += 4;
    if ((type === 0 || type === 4) && length <= MAX_FLAC_BLOCK_BYTES) {
      const block = await readAt(handle, offset, length);
      if (type === 0 && block.length >= 18) {
        // STREAMINFO: 20-bit sample rate, 3-bit channels-1, 5-bit bps-1,
        // 36-bit total samples, starting at byte 10.
        const sampleRate = (block[10] << 12) | (block[11] << 4) | (block[12] >> 4);
        const bitDepth = (((block[12] & 0x01) << 4) | (block[13] >> 4)) + 1;
        const totalSamples = (BigInt(block[13] & 0x0f) << 32n) | BigInt(block.readUInt32BE(14));
        tags.sampleRate = sampleRate;
        tags.bitDepth = bitDepth;
        if (sampleRate > 0) tags.duration = Math.round(Number(totalSamples) / sampleRate);
      } else if (type === 4) {
        try {
          applyVorbisComments(block, tags);
        } catch {}
      }
    }
    offset += length;
    if (last) break;
  }
  return tags;
}

/**
 * Read one audio file's tags. Never throws.
 *
 * @param {string} filePath
 * @returns {Promise<AudioTags>}
 */
async function readAudioTags(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const { size } = await handle.stat();
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".flac") return await readFlac(handle);
    return await readMp4(handle, size);
  } catch {
    return emptyTags();
  } finally {
    await handle?.close().catch(() => {});
  }
}

module.exports = {
  readAudioTags,
};
