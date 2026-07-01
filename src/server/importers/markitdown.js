// MarkItDown extraction path for /api/import-text. The availability
// probe lives in server/markitdown.js; this file adds the actual
// adapter invocation used by the importer.

"use strict";

const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  markitdownEnabled,
  markitdownTimeoutMs,
  markitdownAdapterPath,
  markitdownPython,
  markitdownEnv,
} = require("../markitdown.js");
const {
  importExtension,
  safeTempExtension,
  readableTextRatio,
} = require("./shared.js");

const execFileAsync = promisify(execFile);

const markitdownExtensions = new Set([
  ".txt",
  ".text",
  ".md",
  ".mdx",
  ".markdown",
  ".mdown",
  ".mkd",
  ".mkdn",
  ".csv",
  ".json",
  ".htm",
  ".html",
  ".xhtml",
  ".pdf",
  ".docx",
  ".epub",
  ".pptx",
  ".xlsx",
  ".xls",
]);

/**
 * @param {string} name
 * @param {string} mimeType
 * @returns {boolean}
 */
function markitdownCanHandle(name, mimeType) {
  if (!markitdownEnabled || !fsSync.existsSync(markitdownAdapterPath)) return false;

  const ext = importExtension(name);
  if (markitdownExtensions.has(ext)) return true;

  const type = String(mimeType || "").toLowerCase();
  return type.startsWith("text/")
    || type === "application/json"
    || type === "application/markdown"
    || type === "application/pdf"
    || type === "application/epub+zip"
    || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    || type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function shouldFallbackFromMarkitdown(text) {
  const value = String(text || "");
  if (!value.trim()) return true;
  if (value.length > 200 && readableTextRatio(value) < 0.18) return true;

  const replacementCount = value.match(/\uFFFD/g)?.length || 0;
  return replacementCount >= 3 && replacementCount / Math.max(value.length, 1) > 0.01;
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @returns {Promise<string | null>}
 */
async function tryExtractWithMarkitdown(name, mimeType, buffer) {
  if (!markitdownCanHandle(name, mimeType)) return null;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-system6-markitdown-"));
  const inputPath = path.join(tempDir, `input${safeTempExtension(name)}`);
  try {
    await fs.writeFile(inputPath, buffer);

    const { stdout } = await execFileAsync(
      markitdownPython,
      [markitdownAdapterPath, inputPath, "--name", name || "", "--mime", mimeType || ""],
      {
        timeout: markitdownTimeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        env: markitdownEnv(),
      }
    );
    const result = JSON.parse(stdout);
    if (!result.ok) {
      throw new Error(result.error || "MarkItDown conversion failed.");
    }
    const text = String(result.text || "");
    if (shouldFallbackFromMarkitdown(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  markitdownCanHandle,
  shouldFallbackFromMarkitdown,
  tryExtractWithMarkitdown,
};
