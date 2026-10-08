// Jupyter notebook importer.
//
// A notebook is a reading order document: prose the author wrote, code the
// author ran, and the text those runs printed. The prose is already Markdown,
// so it is kept verbatim rather than re-flowed; code goes into a fenced block
// tagged with the notebook's own kernel language so the reader's highlighter
// sees the language the author used; and only textual output is kept, because
// an image output is a picture this importer cannot describe and a JSON blob
// is machine state, not prose.

"use strict";

const { decodePlainTextBuffer } = require("./shared.js");

// Output text per cell is bounded so one runaway loop cannot swamp the import.
const NOTEBOOK_OUTPUT_MAX_CHARS = 2000;

/**
 * @param {unknown} source
 * @returns {string}
 */
function notebookSourceText(source) {
  if (Array.isArray(source)) return source.map((line) => String(line)).join("");
  return String(source || "");
}

/**
 * Keep the text output of a code cell, and only that.
 *
 * @param {unknown} outputs
 * @returns {string[]}
 */
function notebookOutputTexts(outputs) {
  if (Array.isArray(outputs) === false) return [];
  const collected = [];

  for (const output of outputs) {
    if (output === null || typeof output !== "object") continue;
    // `stream` is a live print; results carry the MIME bundle a front end renders.
    if (output.output_type === "stream") {
      collected.push(String(output.text || ""));
      continue;
    }
    const data = output.data || null;
    if (data === null) continue;
    if (typeof data["text/plain"] === "string") {
      collected.push(data["text/plain"]);
    } else if (Array.isArray(data["text/plain"])) {
      collected.push(data["text/plain"].map((line) => String(line)).join(""));
    }
  }

  return collected
    .map((text) => text.replace(/\s+$/, ""))
    .filter((text) => text.trim())
    .map((text) => (text.length > NOTEBOOK_OUTPUT_MAX_CHARS
      ? `${text.slice(0, NOTEBOOK_OUTPUT_MAX_CHARS)}\n[truncated]`
      : text));
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractNotebookText(buffer) {
  let notebook;
  try {
    notebook = JSON.parse(decodePlainTextBuffer(buffer));
  } catch {
    throw new Error("Could not read this Jupyter notebook: it is not valid JSON.");
  }
  if (notebook === null || typeof notebook !== "object" || Array.isArray(notebook.cells) === false) {
    throw new Error("Could not find readable cells in this Jupyter notebook.");
  }

  const metadata = notebook.metadata || {};
  const language = String(
    metadata.kernelspec?.language
    || metadata.language_info?.name
    || "python"
  ).trim() || "python";

  const parts = [];
  for (const cell of notebook.cells) {
    if (cell === null || typeof cell !== "object") continue;
    const body = notebookSourceText(cell.source).replace(/\s+$/, "");
    if (body.trim() === "") continue;

    if (cell.cell_type === "markdown") {
      parts.push(body);
    } else if (cell.cell_type === "code") {
      const outputs = notebookOutputTexts(cell.outputs);
      parts.push("```" + language + "\n" + body + "\n```");
      if (outputs.length) parts.push(outputs.join("\n\n"));
    } else if (cell.cell_type === "raw") {
      parts.push(body);
    }
  }

  if (parts.length === 0) throw new Error("Could not find readable cells in this Jupyter notebook.");
  return parts.join("\n\n");
}

module.exports = {
  extractNotebookText,
};
