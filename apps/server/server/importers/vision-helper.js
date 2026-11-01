// macOS 26 document recognition, the first rung of the OCR ladder on a Mac.
//
// AISystem6Vision (platform/macos/shell/macos-webview/Sources/AISystem6Vision)
// reads a page image's structure with Vision's RecognizeDocumentsRequest: the
// title, paragraphs, lists and tables in reading order. The other engines
// return lines; this one returns a document, so a scanned table comes back as
// a table. It recognises text only and rewrites nothing.
//
// The helper is a compiled binary: bundled next to the shell app (the shell
// passes its path in AI_SYSTEM6_VISION_HELPER), or built in the checkout by
// `swift build`. Anywhere else (Linux, an older macOS, no build) this rung is
// simply absent and the ladder starts at the next engine.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");

const VISION_TIMEOUT_MS = 60000;
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

let cachedHelper;

function visionHelperPath() {
  if (cachedHelper !== undefined) return cachedHelper;
  cachedHelper = null;
  if (process.platform !== "darwin" || process.env.AI_SYSTEM6_VISION === "0") return cachedHelper;
  const candidates = [
    process.env.AI_SYSTEM6_VISION_HELPER || "",
    path.join(repoRoot, "platform/macos/shell/macos-webview/.build/release/AISystem6Vision"),
    path.join(repoRoot, "platform/macos/shell/macos-webview/.build/debug/AISystem6Vision"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedHelper = candidate;
      break;
    } catch {}
  }
  return cachedHelper;
}

/** @param {string} value */
function cell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/**
 * The helper's blocks as Markdown. Exported for the contract test.
 *
 * @param {Array<{ kind: string, text?: string, items?: string[], rows?: string[][] }>} blocks
 */
function visionBlocksToMarkdown(blocks) {
  const out = [];
  for (const block of blocks || []) {
    if (block.kind === "title" && block.text) {
      out.push(`## ${block.text.replace(/\s+/g, " ").trim()}`);
    } else if (block.kind === "paragraph" && block.text) {
      out.push(block.text.trim());
    } else if (block.kind === "list" && Array.isArray(block.items)) {
      out.push(block.items.map((item) => `- ${String(item).replace(/^[-•·*\d.)\s]+/, "").trim()}`).join("\n"));
    } else if (block.kind === "table" && Array.isArray(block.rows) && block.rows.length) {
      const width = Math.max(...block.rows.map((row) => row.length));
      const rows = block.rows.map((row) => Array.from({ length: width }, (_, index) => cell(row[index])));
      out.push([
        `| ${rows[0].join(" | ")} |`,
        `| ${rows[0].map(() => "---").join(" | ")} |`,
        ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`),
      ].join("\n"));
    }
  }
  return out.join("\n\n").trim();
}

/**
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<string | null>} null when the rung is not available here
 */
async function extractImageTextWithVisionHelper(buffer, mimeType, options = {}) {
  const helper = visionHelperPath();
  if (!helper) return null;
  const ext = /png/i.test(mimeType) ? ".png" : /heic|heif/i.test(mimeType) ? ".heic" : /tiff/i.test(mimeType) ? ".tiff" : /gif/i.test(mimeType) ? ".gif" : /webp/i.test(mimeType) ? ".webp" : ".jpg";
  const file = path.join(os.tmpdir(), `ais6-vision-${crypto.randomBytes(8).toString("hex")}${ext}`);
  await fs.promises.writeFile(file, buffer);
  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(helper, [file], { timeout: VISION_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, signal: options.signal }, (error, out) => {
        // A non-zero exit still prints the JSON with its error; read it.
        if (error && !out) reject(error);
        else resolve(out);
      });
    });
    const result = JSON.parse(String(stdout || "{}"));
    if (!result.available) {
      cachedHelper = null;
      return null;
    }
    if (result.error) throw new Error(result.error);
    return visionBlocksToMarkdown(result.blocks);
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}

module.exports = {
  extractImageTextWithVisionHelper,
  visionBlocksToMarkdown,
  visionHelperPath,
};
