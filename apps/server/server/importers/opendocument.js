// OpenDocument importer: .odt, .ods and .odp all ship the same container, and
// the reading order lives in content.xml. There is no OpenDocument parser in
// this tree and no npm parser is allowed, so this is a small token walker over
// the XML that keeps only the structures a reader cares about: headings,
// paragraphs, list items, tables and presentation pages.
//
// It is deliberately not a general XML parser. ODF documents are machine
// written and well formed, and the element names this importer acts on are a
// fixed, small set; anything else is passed through as transparent nesting so
// inline text inside a span or a frame still lands in its paragraph.

"use strict";

const { decodeHtml } = require("../lib/text.js");
const { readZipEntries } = require("./zip.js");

// A repeated cell is legitimate in ODS (a merged region), but a corrupt or
// hostile document could claim millions of columns. The reader's Markdown
// table is not a spreadsheet, so the repeat is capped rather than trusted.
const MAX_REPEATED_COLUMNS = 50;
const MAX_SPACES = 200;

/**
 * @param {string} rawName
 * @returns {string}
 */
function localName(rawName) {
  return String(rawName || "").split(":").pop().toLowerCase();
}

/**
 * @param {string} attrs
 * @param {string} name
 * @returns {string}
 */
function readAttribute(attrs, name) {
  const pattern = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*("([^"]*)"|'([^']*)')`);
  const match = pattern.exec(String(attrs || ""));
  if (match === null) return "";
  return match[2] !== undefined ? match[2] : (match[3] || "");
}

/**
 * Walk the ODF content stream and assemble Markdown.
 *
 * @returns {{
 *   startElement: (rawName: string, attrs: string, selfClosing: boolean) => void,
 *   endElement: (rawName: string) => void,
 *   characters: (value: string) => void,
 *   result: () => string,
 * }}
 */
function createOpenDocumentTextBuilder() {
  const blocks = [];
  const stack = [];
  let inline = "";
  let table = null;
  let pageIndex = 0;

  function inside(name) {
    return stack.some((frame) => frame.name === name);
  }

  function appendInline(value) {
    const collapsed = String(value || "").replace(/\s+/g, " ");
    if (collapsed === "") return;
    if (table !== null && table.cell !== null) {
      table.cell.text += collapsed;
      return;
    }
    inline += collapsed;
  }

  function takeInline() {
    const text = inline.replace(/\s+/g, " ").trim();
    inline = "";
    return text;
  }

  function flushParagraph() {
    const text = takeInline();
    if (text === "") return;
    if (table !== null && table.cell !== null) {
      table.cell.text = (table.cell.text + " " + text).trim();
      return;
    }
    blocks.push(inside("list-item") ? "- " + text : text);
  }

  function flushHeading(frame) {
    const text = takeInline();
    if (text === "") return;
    const level = Math.min(Math.max(Number(frame.level) || 1, 1), 6);
    blocks.push("#".repeat(level) + " " + text);
  }

  function finishCell() {
    if (table === null || table.cell === null) return;
    const text = table.cell.text.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
    const repeat = table.cell.repeat;
    if (Array.isArray(table.row)) {
      for (let index = 0; index < repeat; index += 1) table.row.push(text);
    }
    table.cell = null;
  }

  function finishRow() {
    if (table === null) return;
    const row = Array.isArray(table.row) ? table.row : [];
    table.row = null;
    while (row.length > 0 && row[row.length - 1].trim() === "") row.pop();
    if (row.some((cell) => cell.trim() !== "")) table.rows.push(row);
  }

  function emitTable() {
    if (table === null) return;
    const rows = table.rows.filter((row) => row.some((cell) => cell.trim() !== ""));
    if (rows.length === 0) return;
    const maxCols = Math.min(Math.max(...rows.map((row) => row.length)), MAX_REPEATED_COLUMNS);
    const pad = (row) => {
      const cells = row.slice(0, maxCols);
      while (cells.length < maxCols) cells.push("");
      return cells;
    };
    const lines = ["| " + pad(rows[0]).join(" | ") + " |"];
    lines.push("| " + Array(maxCols).fill("---").join(" | ") + " |");
    for (let index = 1; index < rows.length; index += 1) {
      lines.push("| " + pad(rows[index]).join(" | ") + " |");
    }
    blocks.push(lines.join("\n"));
  }

  function popFrame(name) {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].name === name) return stack.splice(index, 1)[0];
    }
    return { name, level: 0 };
  }

  function startElement(rawName, attrs, selfClosing) {
    const name = localName(rawName);
    const prefix = String(rawName || "").split(":")[0].toLowerCase();

    if (name === "s") {
      const count = Math.min(Math.max(Number(readAttribute(attrs, "text:c")) || 1, 1), MAX_SPACES);
      appendInline(" ".repeat(count));
    } else if (name === "tab") {
      appendInline(" ");
    } else if (name === "line-break") {
      appendInline("\n");
    } else if (name === "p" || name === "h") {
      flushParagraph();
    } else if (name === "table") {
      table = { rows: [], row: null, cell: null };
    } else if (name === "table-row") {
      if (table !== null) table.row = [];
    } else if (name === "table-cell") {
      if (table !== null) {
        const repeated = Number(readAttribute(attrs, "table:number-columns-repeated")) || 1;
        table.cell = { text: "", repeat: Math.min(Math.max(repeated, 1), MAX_REPEATED_COLUMNS) };
      }
    } else if (name === "page" && prefix === "draw") {
      flushParagraph();
      pageIndex += 1;
      blocks.push("## 幻灯片 " + pageIndex);
    }

    const level = name === "h" ? Number(readAttribute(attrs, "text:outline-level")) || 1 : 0;
    stack.push({ name, level });
    if (selfClosing) endElement(rawName);
  }

  function endElement(rawName) {
    const name = localName(rawName);
    const frame = popFrame(name);
    if (name === "p") {
      flushParagraph();
    } else if (name === "h") {
      flushHeading(frame);
    } else if (name === "table-cell") {
      finishCell();
    } else if (name === "table-row") {
      finishRow();
    } else if (name === "table") {
      finishRow();
      emitTable();
      table = null;
    }
  }

  return {
    startElement,
    endElement,
    characters: (value) => appendInline(decodeHtml(value)),
    result: () => blocks.join("\n\n").trim(),
  };
}

// Matches a start tag, an end tag or a run of character data. Quoted attribute
// values may contain `>`, so the attribute part is matched as a whole rather
// than by hunting for the first `>`.
const ODF_TOKEN = /<([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|<\/([a-zA-Z][\w:.-]*)>|([^<]+)/g;

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractOpenDocumentText(buffer) {
  const entries = readZipEntries(buffer);
  const content = entries.get("content.xml");
  if (content === undefined) {
    throw new Error("Could not find content.xml in this OpenDocument file.");
  }

  const xml = content.toString("utf8");
  const builder = createOpenDocumentTextBuilder();
  ODF_TOKEN.lastIndex = 0;

  let match;
  while ((match = ODF_TOKEN.exec(xml))) {
    if (match[1] !== undefined) {
      builder.startElement(match[1], match[2] || "", match[3] === "/");
    } else if (match[4] !== undefined) {
      builder.endElement(match[4]);
    } else if (match[5] !== undefined) {
      builder.characters(match[5]);
    }
  }

  const text = builder.result();
  if (text === "") throw new Error("Could not find readable text in this OpenDocument file.");
  return text;
}

module.exports = {
  createOpenDocumentTextBuilder,
  extractOpenDocumentText,
};
