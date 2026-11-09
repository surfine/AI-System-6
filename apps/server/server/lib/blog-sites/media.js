"use strict";
// The media library's audit (P2): what the site's image directory holds, which
// frames describe it, and the two things the writer can actually act on — an
// image with no alternative text, and an image nothing on the site uses.
//
// Read-only. Every path comes from the validated description, and the caller
// checks the folder grant before this runs.

const fs = require("node:fs");
const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".svg"]);

/**
 * @param {string} dir
 * @returns {string[]} image file names, sorted
 */
function listImageFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

/**
 * The frames a site describes: photos.json's `frames` (keyed by id), flattened.
 * A missing or unreadable file is not an error here — a site without an image
 * collection simply has no frames.
 * @param {Record<string, any>} site
 */
function readFrames(site) {
  const collection = Object.values(site.contentTypes || {}).find((type) => type?.storage?.kind === "json-collection");
  if (!collection) return { frames: [], stacks: [], file: "" };
  const file = path.join(String(collection.storage.dir || ""), String(collection.storage.file || ""));
  if (!file || !fs.existsSync(file)) return { frames: [], stacks: [], file };
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const frames = Object.entries(data.frames || {}).map(([id, frame]) => ({
      id,
      file: String(frame?.file || ""),
      alt: String(frame?.alt || "").trim(),
      cap: String(frame?.cap || "").trim(),
    }));
    const stacks = (Array.isArray(data.stacks) ? data.stacks : []).map((stack) => ({
      slug: String(stack?.slug || ""),
      title: String(stack?.title || ""),
      ids: Array.isArray(stack?.ids) ? stack.ids.map(String) : [],
    }));
    return { frames, stacks, file };
  } catch (error) {
    // A malformed collection is reported by the audit, never silently dropped.
    return { frames: [], stacks: [], file, error: String(/** @type {any} */ (error)?.message || error) };
  }
}

/**
 * Text the site's articles contain, so "used by" can see a file named in a
 * post even when it is not a frame. Bounded: the point is a yes/no, not a full
 * text scan.
 * @param {Record<string, any>} site
 */
function articleCorpus(site) {
  const chunks = [];
  for (const [typeId, type] of Object.entries(site.contentTypes || {})) {
    if (type?.storage?.kind !== "file-per" || !type.storage.dir || !fs.existsSync(type.storage.dir)) continue;
    for (const name of fs.readdirSync(type.storage.dir).slice(0, 5000)) {
      if (!name.endsWith(".md")) continue;
      try {
        chunks.push({ type: typeId, name, text: fs.readFileSync(path.join(type.storage.dir, name), "utf8").slice(0, 20000) });
      } catch {
        // An unreadable article simply contributes no usage.
      }
    }
  }
  return chunks;
}

/**
 * @param {Record<string, any>} site
 * @returns {Record<string, any>} the audit; `ok: false` carries a code and an error
 */
function scanMedia(site) {
  const dir = String(site.media?.dir || "");
  const urlPrefix = String(site.media?.urlPrefix || "");
  if (!dir) {
    return { ok: false, code: "media_not_configured", error: "这个站点没有登记图片目录（media.dir）。", files: [], missingAlt: [], unused: [], orphanFrames: [], summary: { files: 0, missingAlt: 0, unused: 0, orphanFrames: 0 } };
  }
  const names = listImageFiles(dir);
  const { frames, stacks, file: collectionFile, error } = readFrames(site);
  const corpus = articleCorpus(site);

  const frameByFile = new Map();
  for (const frame of frames) {
    if (!frame.file) continue;
    if (!frameByFile.has(frame.file)) frameByFile.set(frame.file, []);
    frameByFile.get(frame.file).push(frame);
  }
  const stackOfFrame = new Map();
  for (const stack of stacks) for (const id of stack.ids) stackOfFrame.set(id, stack);

  const files = names.map((name) => {
    const frameList = frameByFile.get(name) || [];
    const inStacks = frameList.map((frame) => stackOfFrame.get(frame.id)).filter(Boolean).map((stack) => stack.title || stack.slug);
    // "Used" means something on the site shows it: a frame inside a stack, or a
    // post that names the file.
    const namedInArticles = corpus.filter((chunk) => chunk.text.includes(name)).map((chunk) => `${chunk.type}/${chunk.name}`);
    const used = inStacks.length > 0 || namedInArticles.length > 0;
    let bytes = 0;
    try { bytes = fs.statSync(path.join(dir, name)).size; } catch { bytes = 0; }
    return {
      file: name,
      url: urlPrefix ? `${urlPrefix}${name}` : name,
      bytes,
      frames: frameList.map((frame) => frame.id),
      alt: frameList.map((frame) => frame.alt).filter(Boolean).join(" / "),
      missingAlt: frameList.length > 0 ? frameList.every((frame) => !frame.alt) : false,
      used,
      usedBy: [...inStacks, ...namedInArticles],
    };
  });

  const missingAlt = files.filter((entry) => entry.missingAlt);
  const unused = files.filter((entry) => !entry.used);
  // A frame whose file is not on disk is a broken image the site will publish.
  const onDisk = new Set(names);
  const orphanFrames = frames.filter((frame) => frame.file && !onDisk.has(frame.file)).map((frame) => ({ id: frame.id, file: frame.file }));

  return {
    ok: true,
    dir,
    urlPrefix,
    collectionFile,
    ...(error ? { parseError: error } : {}),
    files,
    missingAlt,
    unused,
    orphanFrames,
    summary: {
      files: files.length,
      used: files.filter((entry) => entry.used).length,
      missingAlt: missingAlt.length,
      unused: unused.length,
      orphanFrames: orphanFrames.length,
    },
  };
}

module.exports = Object.freeze({ scanMedia, listImageFiles, readFrames });
