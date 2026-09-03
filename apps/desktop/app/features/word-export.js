// @ts-check
// Lazy feature module: word-export.
//
// The route already ends in paper the writer can hand over: a printed PDF, a
// slide deck, a chart. It did not end in the one file an editor or a client
// asks for by name. This module is that last kind of paper.
//
// Three rules hold the module together.
//
// 1. There is one document, not two. This file contains NO Markdown parser.
//    It reads the token stream that parseMarkdownDocument() already made for
//    the preview, so the page on screen and the page in the .docx are two
//    views of one lexer result. A second parser would be a second document,
//    and the two would disagree the first time one of them was corrected.
// 2. There is one Page Setup. Paper size, margin, body size, line height and
//    the heading scale come in as one metrics object, which the print
//    stylesheet builds from the same call. This file converts those
//    millimetres and points into twips; it does not choose them.
// 3. The file is a container, not a conversion. A .docx is a ZIP of XML
//    parts. The ZIP writer below is the whole dependency: no library, no
//    server round trip, and no upload of the writer's manuscript.
//
// What this module never does: claim a save. exportDocumentAsWord() reports
// only what saveArtifact() confirmed, and refuses -- with reasons read from
// the tokens themselves -- before it builds anything at all.

const WORD_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// One inch is 1440 twips and 72 points; one inch is 25.4 mm. Word measures
// pages in twips and type in half-points, so every number the Page Setup
// carries passes through here and nowhere else.
const WORD_TWIPS_PER_MM = 1440 / 25.4;
const WORD_TWIPS_PER_LINE = 240;

const WORD_NAMESPACE_MAIN = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WORD_NAMESPACE_RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WORD_XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * Escape one string for XML text or for an attribute value.
 *
 * This is not escapeHtml(). OOXML is XML, so a character that XML forbids
 * outright -- a raw control character pasted in from a PDF or a terminal --
 * makes the whole part unreadable and Word refuses the file rather than
 * skipping the character. Those are dropped here, before they can travel.
 *
 * @param {unknown} value
 * @returns {string}
 */
function wordXmlText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wordTwips(millimetres) {
  return Math.round(Number(millimetres || 0) * WORD_TWIPS_PER_MM);
}

function wordHalfPoints(points) {
  return Math.max(2, Math.round(Number(points || 0) * 2));
}

// --- The container -----------------------------------------------------------

/**
 * CRC-32 over bytes, the same table-free algorithm the CMF PNG writer uses in
 * apps/server/server/cmf/service.js. Written for the browser: a Uint8Array
 * rather than a Node Buffer, and no shared table, because a .docx holds eight
 * small parts and building a table would cost more than it saves.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function wordCrc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function wordUtf8Bytes(text) {
  return new TextEncoder().encode(String(text ?? ""));
}

/**
 * Deflate bytes with the platform compressor, or report that there is none.
 *
 * Returns null when the browser has no CompressionStream, when the stream
 * fails, or when the "compressed" result is not actually smaller. The caller
 * then stores the part instead. This is correct, not a degraded mode: a ZIP
 * entry may declare method 0 (stored) per the format, an OPC package is an
 * ordinary ZIP, and Word reads a stored .docx exactly as it reads a deflated
 * one. The only difference is the size of the file on disk.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array | null>}
 */
async function wordDeflateRaw(bytes) {
  if (typeof CompressionStream !== "function") return null;
  try {
    const compressor = new CompressionStream("deflate-raw");
    const writer = compressor.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const reader = compressor.readable.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    if (total >= bytes.length) return null;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

function wordWriteU16(view, offset, value) {
  view.setUint16(offset, value & 0xffff, true);
}

function wordWriteU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Write one ZIP container: a local header per entry, then the central
 * directory, then the end-of-central-directory record.
 *
 * Every entry carries the same fixed MS-DOS stamp (1 January 1980, the
 * earliest the format can express). A .docx built twice from the same
 * manuscript is then byte-identical, which is what lets the round-trip
 * contract compare files rather than compare descriptions of files. The dates
 * a reader actually sees live in docProps/core.xml.
 *
 * @param {Array<{ name: string, data: Uint8Array | string }>} entries
 * @returns {Promise<Uint8Array>}
 */
async function zipContainer(entries) {
  const dosTime = 0;
  const dosDate = (0 << 9) | (1 << 5) | 1;
  const utf8NameFlag = 0x0800;
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries || []) {
    const nameBytes = wordUtf8Bytes(entry.name);
    const raw = entry.data instanceof Uint8Array ? entry.data : wordUtf8Bytes(entry.data);
    const deflated = await wordDeflateRaw(raw);
    const stored = deflated === null;
    const payload = stored ? raw : deflated;
    const crc = wordCrc32(raw);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    wordWriteU32(localView, 0, 0x04034b50);
    wordWriteU16(localView, 4, 20);
    wordWriteU16(localView, 6, utf8NameFlag);
    wordWriteU16(localView, 8, stored ? 0 : 8);
    wordWriteU16(localView, 10, dosTime);
    wordWriteU16(localView, 12, dosDate);
    wordWriteU32(localView, 14, crc);
    wordWriteU32(localView, 18, payload.length);
    wordWriteU32(localView, 22, raw.length);
    wordWriteU16(localView, 26, nameBytes.length);
    wordWriteU16(localView, 28, 0);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    wordWriteU32(centralView, 0, 0x02014b50);
    wordWriteU16(centralView, 4, 20);
    wordWriteU16(centralView, 6, 20);
    wordWriteU16(centralView, 8, utf8NameFlag);
    wordWriteU16(centralView, 10, stored ? 0 : 8);
    wordWriteU16(centralView, 12, dosTime);
    wordWriteU16(centralView, 14, dosDate);
    wordWriteU32(centralView, 16, crc);
    wordWriteU32(centralView, 20, payload.length);
    wordWriteU32(centralView, 24, raw.length);
    wordWriteU16(centralView, 28, nameBytes.length);
    wordWriteU16(centralView, 30, 0);
    wordWriteU16(centralView, 32, 0);
    wordWriteU16(centralView, 34, 0);
    wordWriteU16(centralView, 36, 0);
    wordWriteU32(centralView, 38, 0);
    wordWriteU32(centralView, 42, offset);
    central.set(nameBytes, 46);

    localParts.push(local, payload);
    centralParts.push(central);
    offset += local.length + payload.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  wordWriteU32(endView, 0, 0x06054b50);
  wordWriteU16(endView, 8, centralParts.length);
  wordWriteU16(endView, 10, centralParts.length);
  wordWriteU32(endView, 12, centralSize);
  wordWriteU32(endView, 16, offset);

  const all = [...localParts, ...centralParts, end];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const container = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    container.set(part, cursor);
    cursor += part.length;
  }
  return container;
}

// --- Reading the token stream ------------------------------------------------

/**
 * A footnote definition is an ordinary paragraph to the lexer, because the
 * Markdown the product renders has no footnote extension. Recognising the
 * `[^id]: text` shape here is not a second parse of the document: it reads a
 * token the lexer already produced and decides where it belongs.
 */
const WORD_FOOTNOTE_DEFINITION = /^\[\^([^\]\s]+)\]:\s*([\s\S]*)$/;
const WORD_FOOTNOTE_REFERENCE = /\[\^([^\]\s]+)\]/g;

function wordTokenText(token) {
  if (!token) return "";
  if (typeof token.text === "string") return token.text;
  if (Array.isArray(token.tokens)) return token.tokens.map(wordTokenText).join("");
  return String(token.raw || "");
}

/**
 * Split the top-level tokens into the flow of the document and the footnote
 * bodies it carries. A definition never appears in the flow, wherever the
 * writer left it in the file.
 *
 * @param {Array<any>} tokens
 */
function splitWordFootnotes(tokens) {
  const flow = [];
  const definitions = new Map();
  for (const token of tokens || []) {
    if (token?.type === "paragraph") {
      const match = WORD_FOOTNOTE_DEFINITION.exec(String(token.raw || "").trim());
      if (match) {
        definitions.set(match[1], match[2].trim());
        continue;
      }
    }
    flow.push(token);
  }
  return { flow, definitions };
}

// --- The structural self-check ----------------------------------------------

/**
 * How many cells the writer actually typed in each body row of one table.
 *
 * The header line and the alignment line are dropped; what is left is the
 * rows a reader would count. An escaped pipe is text inside a cell, not a
 * cell edge.
 *
 * @param {unknown} raw the table token's own source text
 * @returns {Array<number>}
 */
function wordTableRawRowWidths(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .slice(2)
    .map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).length);
}

/**
 * Read the tokens and report what would make the delivered file wrong.
 *
 * Every problem is a fact taken from the token stream: a level that was
 * skipped, a row whose cell count does not match the header, a picture with
 * no words to stand for it. There is no score, no estimate and no judgement
 * of the writing. A document with no problems is not called good; it is
 * called ready to write, which is all the check knows.
 *
 * @param {Array<any>} tokens
 * @returns {{ ok: boolean, problems: Array<{ code: string, detail: string }> }}
 */
function inspectWordDocumentStructure(tokens) {
  const problems = [];
  const { flow, definitions } = splitWordFootnotes(tokens);
  let lastHeadingLevel = 0;
  let carriesText = false;

  const inspectInline = (inlineTokens) => {
    for (const token of inlineTokens || []) {
      if (token?.type === "image" && !String(token.text || "").trim()) {
        problems.push({ code: "image_without_alt", detail: String(token.href || "") });
      }
      if (Array.isArray(token?.tokens)) inspectInline(token.tokens);
    }
  };

  const walk = (blockTokens) => {
    for (const token of blockTokens || []) {
      if (!token || token.type === "space") continue;

      if (token.type === "heading") {
        const level = Number(token.depth) || 1;
        const text = String(token.text || "").trim();
        if (!text) problems.push({ code: "empty_heading", detail: `H${level}` });
        else carriesText = true;
        if (lastHeadingLevel && level > lastHeadingLevel + 1) {
          problems.push({ code: "heading_skipped", detail: `H${lastHeadingLevel} → H${level}` });
        }
        lastHeadingLevel = level;
        inspectInline(token.tokens);
        continue;
      }

      if (token.type === "table") {
        const columns = (token.header || []).length;
        // The cell arrays cannot answer this. The lexer pads a short row and
        // cuts a long one to the width of the header, so by the time a table
        // is tokens it is always square. The raggedness is only in the raw
        // text the token still carries, which is why it is counted there.
        wordTableRawRowWidths(token.raw).forEach((width, index) => {
          if (width !== columns) {
            problems.push({ code: "ragged_table", detail: `${index + 1}: ${width}/${columns}` });
          }
        });
        if (columns) carriesText = true;
        (token.header || []).forEach((cell) => inspectInline(cell.tokens));
        (token.rows || []).forEach((row) => row.forEach((cell) => inspectInline(cell.tokens)));
        continue;
      }

      if (token.type === "list") {
        for (const item of token.items || []) {
          if (String(item.text || "").trim()) carriesText = true;
          walk(item.tokens);
        }
        continue;
      }

      if (token.type === "blockquote") {
        walk(token.tokens);
        continue;
      }

      if (token.type === "code") {
        if (String(token.text || "").trim()) carriesText = true;
        continue;
      }

      if (token.type === "paragraph" || token.type === "text") {
        if (String(token.text || "").trim()) carriesText = true;
        inspectInline(token.tokens);
        continue;
      }
    }
  };

  walk(flow);
  for (const body of definitions.values()) {
    if (body) carriesText = true;
  }
  if (!carriesText) problems.unshift({ code: "empty_body", detail: "" });

  return { ok: problems.length === 0, problems };
}

// --- Building the parts ------------------------------------------------------

/**
 * Normalise the Page Setup metrics the caller hands in. Every default here is
 * the product's own A4 manuscript page, so a caller that forgets a field gets
 * the page the printer would have made, not an arbitrary one.
 */
function normalizeWordPageSetup(pageSetup = {}) {
  const headingScale = pageSetup.headingScale || {};
  return {
    widthMm: Number(pageSetup.widthMm) || 210,
    heightMm: Number(pageSetup.heightMm) || 297,
    orientation: pageSetup.orientation === "landscape" ? "landscape" : "portrait",
    marginMm: Number(pageSetup.marginMm) || 20,
    fontPt: Number(pageSetup.fontPt) || 11.5,
    lineHeight: Number(pageSetup.lineHeight) || 1.58,
    wordFontName: String(pageSetup.wordFontName || "Georgia"),
    headingScale: {
      1: Number(headingScale[1]) || 1.75,
      2: Number(headingScale[2]) || 1.25,
      3: Number(headingScale[3]) || 1.1,
    },
  };
}

function wordSectionProperties(setup) {
  const landscape = setup.orientation === "landscape";
  const width = wordTwips(landscape ? setup.heightMm : setup.widthMm);
  const height = wordTwips(landscape ? setup.widthMm : setup.heightMm);
  const margin = wordTwips(setup.marginMm);
  return `<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${landscape ? ' w:orient="landscape"' : ""}/>`
    + `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}"`
    + ` w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
}

function wordRunProperties({ bold = false, italic = false, mono = false, footnote = false, link = false, commentRef = false } = {}) {
  const marks = [];
  if (mono) marks.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>');
  if (link) marks.push('<w:rStyle w:val="Hyperlink"/>');
  if (commentRef) marks.push('<w:rStyle w:val="CommentReference"/>');
  if (footnote) marks.push('<w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/>');
  if (bold) marks.push("<w:b/>");
  if (italic) marks.push("<w:i/>");
  return marks.length ? `<w:rPr>${marks.join("")}</w:rPr>` : "";
}

/**
 * One run of text. `xml:space="preserve"` is not optional: without it Word
 * drops the space between two differently formatted runs, so "read **this**
 * now" would come back as "read**this**now".
 */
function wordTextRun(text, style) {
  if (!text) return "";
  return `<w:r>${wordRunProperties(style)}<w:t xml:space="preserve">${wordXmlText(text)}</w:t></w:r>`;
}

/**
 * One run, kept as a piece instead of as finished XML.
 *
 * A Word comment range starts and ends *between* runs, so the paragraph
 * builder must know what text each run carries and whether the run may be cut
 * in two. A run that carries bold or italic may not be cut: a reader rebuilds
 * `**word**` from that one run's marks, so cutting it would read back as
 * `**wo**` `**rd**` -- different text. A plain run cuts into two plain runs
 * and the text a reader gets is the same string, which is why only plain runs
 * are splittable. Anything with no text of its own -- a break, a footnote
 * reference, a whole hyperlink -- is one piece a range can sit beside but
 * never inside.
 *
 * @param {unknown} text
 * @param {Record<string, boolean>} style
 * @param {{ xml?: string, splittable?: boolean }} [override]
 */
function wordRunPiece(text, style = {}, override = {}) {
  const body = String(text ?? "");
  return {
    text: body,
    style,
    splittable: override.splittable === undefined ? !style.bold && !style.italic : Boolean(override.splittable),
    xml: override.xml === undefined ? wordTextRun(body, style) : override.xml,
  };
}

function wordRunsXml(pieces) {
  return (pieces || []).map((piece) => piece.xml).join("");
}

/**
 * Inline tokens to run pieces. `state` collects the footnote references and
 * the external links as they are met, because both need a part of their own
 * and a relationship id, and both are only known once the body has been
 * walked.
 */
function wordInlineRuns(tokens, state, style = {}) {
  const pieces = [];
  for (const token of tokens || []) {
    if (!token) continue;
    switch (token.type) {
      case "strong":
        pieces.push(...wordInlineRuns(token.tokens, state, { ...style, bold: true }));
        break;
      case "em":
        pieces.push(...wordInlineRuns(token.tokens, state, { ...style, italic: true }));
        break;
      case "del":
        pieces.push(...wordInlineRuns(token.tokens, state, style));
        break;
      case "codespan":
        pieces.push(wordRunPiece(token.text, { ...style, mono: true }));
        break;
      case "br":
        pieces.push(wordRunPiece("", style, { xml: "<w:r><w:br/></w:r>", splittable: false }));
        break;
      case "link": {
        const target = String(token.href || "");
        const inner = token.tokens?.length
          ? wordInlineRuns(token.tokens, state, { ...style, link: true })
          : [wordRunPiece(token.text, { ...style, link: true })];
        if (!target) {
          pieces.push(...inner);
          break;
        }
        const id = `rIdLink${state.links.length + 1}`;
        state.links.push({ id, target });
        pieces.push(wordRunPiece(inner.map((piece) => piece.text).join(""), style, {
          xml: `<w:hyperlink r:id="${id}">${wordRunsXml(inner)}</w:hyperlink>`,
          splittable: false,
        }));
        break;
      }
      case "image":
        // The picture bytes are not in the token stream, so the file carries
        // the words that stood for the picture rather than an empty frame.
        // An image with no alternative text has nothing to carry, which is
        // exactly why inspectWordDocumentStructure() refuses it.
        pieces.push(wordRunPiece(token.text, { ...style, italic: true }));
        break;
      case "text":
      case "escape":
      default:
        if (Array.isArray(token.tokens) && token.tokens.length) {
          pieces.push(...wordInlineRuns(token.tokens, state, style));
        } else {
          pieces.push(...wordTextWithFootnotes(String(token.text ?? token.raw ?? ""), state, style));
        }
        break;
    }
  }
  return pieces;
}

function wordTextWithFootnotes(text, state, style) {
  if (!state.definitions.size || !text.includes("[^")) return [wordRunPiece(text, style)];
  const pieces = [];
  let cursor = 0;
  WORD_FOOTNOTE_REFERENCE.lastIndex = 0;
  let match;
  while ((match = WORD_FOOTNOTE_REFERENCE.exec(text))) {
    const name = match[1];
    if (!state.definitions.has(name)) continue;
    pieces.push(wordRunPiece(text.slice(cursor, match.index), style));
    cursor = match.index + match[0].length;
    let id = state.footnoteIds.get(name);
    if (!id) {
      // Word reserves ids 0 and 1 for the separator paragraphs, so the
      // writer's own notes start at 2.
      id = state.footnoteIds.size + 2;
      state.footnoteIds.set(name, id);
      state.footnoteOrder.push(name);
    }
    pieces.push(wordRunPiece("", style, {
      xml: `<w:r>${wordRunProperties({ footnote: true })}<w:footnoteReference w:id="${id}"/></w:r>`,
      splittable: false,
    }));
  }
  pieces.push(wordRunPiece(text.slice(cursor), style));
  return pieces;
}

function wordParagraph(properties, runs) {
  return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ""}${runs}</w:p>`;
}

// A paragraph is written twice: once as a slot while the body is walked, and
// once as XML after the review notes have been anchored. The walk cannot write
// the final paragraph, because a comment range is only known when every
// paragraph's text has been read and each anchor has been found exactly once.
//
// The slot is spelled with NUL, which wordXmlText() deletes from every string
// that comes from the writer. No manuscript can therefore counterfeit a slot.
const WORD_PARAGRAPH_SLOT = "\u0000p";

/**
 * Hold one paragraph for the second pass and return its slot.
 *
 * @param {{ paragraphs: Array<any> }} state
 * @param {string} properties the paragraph's own <w:pPr> body
 * @param {Array<any>} pieces the runs, still as pieces
 * @returns {string}
 */
function wordAnchorParagraph(state, properties, pieces) {
  const index = state.paragraphs.length;
  state.paragraphs.push({ properties, pieces: pieces || [], marks: [] });
  return `${WORD_PARAGRAPH_SLOT}${index};`;
}

function wordListParagraph(state, pieces, ordered, level) {
  const depth = Math.min(Math.max(level, 0), 2);
  const numId = ordered ? 2 : 1;
  return wordAnchorParagraph(
    state,
    `<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${depth}"/><w:numId w:val="${numId}"/></w:numPr>`
      + `<w:ind w:left="${360 * (depth + 1)}" w:hanging="360"/>`,
    pieces
  );
}

function wordTableCell(cell, state, header, widthPercent) {
  const pieces = wordInlineRuns(cell?.tokens, state, header ? { bold: true } : {});
  const shading = header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${widthPercent}" w:type="pct"/>${shading}</w:tcPr>`
    + `${wordAnchorParagraph(state, "", pieces)}</w:tc>`;
}

function wordTable(token, state) {
  const columns = Math.max((token.header || []).length, 1);
  const width = Math.floor(5000 / columns);
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`)
    .join("");
  // tblHeader is what makes the header row repeat on every page the table
  // runs onto. A table that breaks across pages without it hands the reader a
  // grid of unlabelled numbers.
  const headerRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>`
    + (token.header || []).map((cell) => wordTableCell(cell, state, true, width)).join("")
    + "</w:tr>";
  const bodyRows = (token.rows || [])
    .map((row) => `<w:tr>${row.map((cell) => wordTableCell(cell, state, false, width)).join("")}</w:tr>`)
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr>`
    + `${headerRow}${bodyRows}</w:tbl>`
    // A table must not be the last thing in the body, and two tables must not
    // touch, or Word merges them into one grid.
    + wordParagraph("", "");
}

function wordBlockXml(tokens, state, level = 0) {
  let xml = "";
  for (const token of tokens || []) {
    if (!token || token.type === "space") continue;
    switch (token.type) {
      case "heading": {
        const depth = Math.min(Math.max(Number(token.depth) || 1, 1), 6);
        xml += wordAnchorParagraph(state, `<w:pStyle w:val="Heading${depth}"/>`, wordInlineRuns(token.tokens, state));
        break;
      }
      case "paragraph":
        xml += wordAnchorParagraph(state, "", wordInlineRuns(token.tokens, state));
        break;
      case "text":
        xml += wordRunsXml(wordInlineRuns(token.tokens?.length ? token.tokens : [token], state));
        break;
      case "list":
        for (const item of token.items || []) {
          const own = (item.tokens || []).filter((child) => child.type === "text" || child.type === "paragraph");
          const nested = (item.tokens || []).filter((child) => child.type === "list");
          const pieces = own.flatMap((child) => wordInlineRuns(child.tokens?.length ? child.tokens : [child], state));
          xml += wordListParagraph(state, pieces, Boolean(token.ordered), level);
          for (const child of nested) xml += wordBlockXml([child], state, level + 1);
        }
        break;
      case "blockquote":
        for (const child of token.tokens || []) {
          if (child.type === "space") continue;
          xml += wordAnchorParagraph(state, '<w:pStyle w:val="Quote"/>', wordInlineRuns(child.tokens, state));
        }
        break;
      case "table":
        xml += wordTable(token, state);
        break;
      case "hr":
        xml += wordParagraph('<w:pStyle w:val="HorizontalRule"/>', "");
        break;
      case "code":
        // One paragraph per line. A code block is the one place where the
        // writer's line breaks are the content, so they may not be reflowed.
        for (const line of String(token.text || "").split("\n")) {
          xml += wordAnchorParagraph(state, '<w:pStyle w:val="SourceCode"/>', [wordRunPiece(line, { mono: true })]);
        }
        break;
      case "html":
        // Raw HTML is not Word markup and has no honest translation, so it is
        // left out rather than printed as its own source text.
        break;
      default:
        break;
    }
  }
  return xml;
}

// --- Review notes as Word comments -------------------------------------------
//
// The Review Desk's findings used to stop at the edge of the product: the
// editor opened a clean manuscript and saw none of the review. A finding is a
// suggestion handed to a person, so it travels as a real Word comment -- the
// editor accepts it, replies to it, or dismisses it in Word, and the
// manuscript itself is not touched.
//
// Two rules decide everything below.
//
// 1. A comment is placed only where the manuscript really says the anchor
//    words. The finding carries the text it is about; that text is matched
//    against the document, and it must match in exactly one place. No match,
//    or more than one, and the comment is not written at all -- it is reported
//    to the writer instead. A note on the wrong sentence is worse than a note
//    that is missing, and there is no position worth guessing at.
// 2. The manuscript does not change. A comment adds range marks and a
//    reference run beside the runs it points at; it never rewrites, inserts,
//    or deletes one character of the writer's text. Build the same document
//    with and without the findings and the body reads back identically.

const WORD_COMMENT_SKIP_ANCHOR_EMPTY = "anchor_empty";
const WORD_COMMENT_SKIP_NOTE_EMPTY = "note_empty";
const WORD_COMMENT_SKIP_ANCHOR_NOT_FOUND = "anchor_not_found";
const WORD_COMMENT_SKIP_ANCHOR_AMBIGUOUS = "anchor_ambiguous";
const WORD_COMMENT_SKIP_ANCHOR_UNPLACEABLE = "anchor_unplaceable";

/**
 * Collapse the whitespace of one string and keep the way back.
 *
 * The Review Desk quotes a sentence the way it was read aloud, and the
 * manuscript may hold the same sentence with a line break in the middle of it.
 * Matching on collapsed whitespace finds it; the index map turns a position in
 * the collapsed string back into a position in the writer's own text, so the
 * comment range still lands on the real characters.
 *
 * @param {unknown} value
 * @returns {{ normalized: string, map: Array<number> }}
 */
function wordAnchorNormalize(value) {
  const source = String(value ?? "");
  const map = [];
  let normalized = "";
  let gap = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (/\s/.test(character)) {
      if (normalized) gap = true;
      continue;
    }
    if (gap) {
      normalized += " ";
      map.push(index);
      gap = false;
    }
    normalized += character;
    map.push(index);
  }
  return { normalized, map };
}

/**
 * The anchor text as it will be matched.
 *
 * shortClaimText() ends a clipped quote with three dots. Those dots are the
 * product's own mark, not the writer's words, so they come off before the
 * match. Nothing else about the anchor is changed: the words that are left are
 * the words that must be in the manuscript.
 *
 * @param {unknown} anchor
 * @returns {string}
 */
function wordAnchorText(anchor) {
  return String(anchor ?? "").trim().replace(/(?:\.{3}|…)\s*$/, "").trim();
}

/**
 * Every place in the document where the anchor text appears.
 *
 * @param {Array<{ normalized: string, map: Array<number> }>} index one entry per paragraph
 * @param {string} anchor
 * @returns {Array<{ paragraph: number, start: number, end: number }>}
 */
function wordAnchorHits(index, anchor) {
  const needle = wordAnchorNormalize(anchor).normalized;
  const hits = [];
  if (!needle) return hits;
  index.forEach((paragraph, paragraphIndex) => {
    let from = 0;
    for (;;) {
      const at = paragraph.normalized.indexOf(needle, from);
      if (at < 0) break;
      hits.push({
        paragraph: paragraphIndex,
        start: paragraph.map[at],
        end: paragraph.map[at + needle.length - 1] + 1,
      });
      from = at + 1;
    }
  });
  return hits;
}

/**
 * Initials for the review pane, which Word shows beside every comment.
 *
 * @param {unknown} author
 * @returns {string}
 */
function wordAuthorInitials(author) {
  const words = String(author ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  // The first character of each word, at most three. Taken by character and
  // not by code unit, so a surrogate pair stays whole. One rule covers a name
  // written with spaces and a name written without them.
  return words.slice(0, 3).map((word) => Array.from(word)[0]).join("").toUpperCase();
}

/**
 * Read one finding as the product writes it.
 *
 * The writing route calls the anchor `quote` in its own findings and `anchor`
 * when the caller names it directly; both are read, and neither is invented.
 *
 * @param {Record<string, any>} finding
 * @param {{ author: string, date: string }} meta
 */
function normalizeWordFinding(finding, meta) {
  const author = String(finding?.author || meta.author || "").trim() || meta.author;
  return {
    anchor: wordAnchorText(finding?.anchor ?? finding?.quote ?? ""),
    note: String(finding?.note ?? finding?.text ?? "").trim(),
    author,
    initials: wordAuthorInitials(author),
    date: String(finding?.date || meta.date || ""),
  };
}

/**
 * Decide, for every finding, whether it can become a comment and where.
 *
 * This is the whole of the anchoring rule. It reads the paragraphs the body
 * walk collected, matches each finding once, and reports every finding it
 * refuses with the reason it refused. It never falls back to a nearby
 * paragraph, to the first match, or to the top of the document.
 *
 * @param {Array<any>} paragraphs
 * @param {Array<Record<string, any>>} findings
 * @param {{ author: string, date: string }} meta
 */
function resolveWordComments(paragraphs, findings, meta) {
  const list = Array.isArray(findings) ? findings : [];
  const index = (paragraphs || []).map((paragraph) =>
    wordAnchorNormalize((paragraph.pieces || []).map((piece) => piece.text).join(""))
  );
  const placed = [];
  const skipped = [];

  for (const raw of list) {
    const finding = normalizeWordFinding(raw, meta);
    if (!finding.anchor) {
      skipped.push({ ...finding, reason: WORD_COMMENT_SKIP_ANCHOR_EMPTY, detail: "" });
      continue;
    }
    if (!finding.note) {
      skipped.push({ ...finding, reason: WORD_COMMENT_SKIP_NOTE_EMPTY, detail: "" });
      continue;
    }
    const hits = wordAnchorHits(index, finding.anchor);
    if (!hits.length) {
      skipped.push({ ...finding, reason: WORD_COMMENT_SKIP_ANCHOR_NOT_FOUND, detail: "" });
      continue;
    }
    if (hits.length > 1) {
      // The same words in two places. Either one could be the sentence the
      // reviewer meant, so neither is written.
      skipped.push({ ...finding, reason: WORD_COMMENT_SKIP_ANCHOR_AMBIGUOUS, detail: String(hits.length) });
      continue;
    }
    placed.push({ ...finding, id: placed.length + 1, ...hits[0] });
  }

  return { requested: list.length, placed, skipped };
}

/**
 * Move a range's ends out to the edges of any run that may not be cut.
 *
 * A range that would fall inside a bold run, a hyperlink, or an image stand-in
 * grows to take that whole run instead. It then surrounds more than the
 * reviewer quoted, which is honest, where cutting the run would have changed
 * the text a reader gets back.
 */
function wordSnapAnchor(pieces, start, end) {
  let snappedStart = start;
  let snappedEnd = end;
  let offset = 0;
  for (const piece of pieces) {
    const from = offset;
    const to = offset + piece.text.length;
    if (!piece.splittable && piece.text.length) {
      if (start > from && start < to) snappedStart = from;
      if (end > from && end < to) snappedEnd = to;
    }
    offset = to;
  }
  return { start: snappedStart, end: snappedEnd };
}

/**
 * Cut the pieces at the offsets a range needs, and return them in order.
 *
 * Only a splittable piece is ever cut, and a cut copies the run's own style
 * into both halves, so the text is the same string written as two runs.
 */
function wordSegmentPieces(pieces, cuts) {
  const segments = [];
  let offset = 0;
  for (const piece of pieces) {
    const start = offset;
    const end = offset + piece.text.length;
    const inner = piece.splittable ? cuts.filter((cut) => cut > start && cut < end) : [];
    let cursor = start;
    for (const cut of inner) {
      segments.push({ start: cursor, end: cut, xml: wordTextRun(piece.text.slice(cursor - start, cut - start), piece.style) });
      cursor = cut;
    }
    segments.push(cursor === start
      ? { start, end, xml: piece.xml }
      : { start: cursor, end, xml: wordTextRun(piece.text.slice(cursor - start), piece.style) });
    offset = end;
  }
  return segments;
}

/**
 * Write one paragraph, with the comment ranges it carries.
 *
 * A paragraph with no ranges is written exactly as it was before comments
 * existed -- the same string, character for character. That is what makes the
 * body of a reviewed export and of a plain export the same body.
 *
 * @param {any} node
 * @param {{ commentsPlaced: Set<number> }} state
 * @returns {string}
 */
function wordParagraphXml(node, state) {
  if (!node) return "";
  if (!node.marks.length) return wordParagraph(node.properties, wordRunsXml(node.pieces));

  const marks = node.marks.map((mark) => ({ id: mark.id, ...wordSnapAnchor(node.pieces, mark.start, mark.end) }));
  const cuts = [...new Set(marks.flatMap((mark) => [mark.start, mark.end]))].sort((left, right) => left - right);
  const segments = wordSegmentPieces(node.pieces, cuts);
  const opens = new Map();
  const closes = new Map();

  for (const mark of marks) {
    const startAt = segments.findIndex((segment) => segment.start === mark.start);
    let endAt = -1;
    segments.forEach((segment, position) => {
      if (segment.end === mark.end) endAt = position;
    });
    // Every cut a mark asked for is in `cuts`, so both ends are always found.
    // A mark that is somehow not placeable is dropped here and reported by the
    // caller; it never lands on a segment that was not asked for.
    if (startAt < 0 || endAt < startAt) continue;
    if (!opens.has(startAt)) opens.set(startAt, []);
    opens.get(startAt).push(mark.id);
    if (!closes.has(endAt)) closes.set(endAt, []);
    closes.get(endAt).push(mark.id);
    state.commentsPlaced.add(mark.id);
  }

  let runs = "";
  segments.forEach((segment, position) => {
    for (const id of opens.get(position) || []) runs += `<w:commentRangeStart w:id="${id}"/>`;
    runs += segment.xml;
    for (const id of closes.get(position) || []) {
      runs += `<w:commentRangeEnd w:id="${id}"/>`
        + `<w:r>${wordRunProperties({ commentRef: true })}<w:commentReference w:id="${id}"/></w:r>`;
    }
  });
  return wordParagraph(node.properties, runs);
}

function wordFillParagraphSlots(xml, state) {
  const slots = new RegExp(`${WORD_PARAGRAPH_SLOT}(\\d+);`, "g");
  return String(xml).replace(slots, (_, index) => wordParagraphXml(state.paragraphs[Number(index)], state));
}

function wordCommentsXml(comments) {
  const body = comments.map((comment) => {
    const lines = String(comment.note).split("\n").map((line) => line.trim()).filter(Boolean);
    const paragraphs = (lines.length ? lines : [""]).map((line, position) =>
      wordParagraph(
        '<w:pStyle w:val="CommentText"/>',
        // The annotation reference is the mark Word puts at the head of a
        // comment in the review pane. It belongs to the comment's first
        // paragraph only.
        (position === 0 ? `<w:r>${wordRunProperties({ commentRef: true })}<w:annotationRef/></w:r>` : "")
          + wordTextRun(line, {})
      )
    ).join("");
    return `<w:comment w:id="${comment.id}" w:author="${wordXmlText(comment.author)}"`
      + ` w:initials="${wordXmlText(comment.initials)}" w:date="${wordXmlText(comment.date)}">`
      + `${paragraphs}</w:comment>`;
  }).join("");
  return `${WORD_XML_DECLARATION}
<w:comments xmlns:w="${WORD_NAMESPACE_MAIN}">${body}</w:comments>`;
}

/**
 * The report the writer reads before the file is written.
 *
 * Counts only, and the anchor words of everything that was refused with the
 * reason it was refused. No score, no confidence, no "most notes anchored".
 *
 * @param {{ requested: number, placed: Array<any>, skipped: Array<any> }} resolved
 */
function wordCommentReport(resolved) {
  return {
    requested: resolved.requested,
    placed: resolved.placed.length,
    skipped: resolved.skipped.map((finding) => ({
      anchor: finding.anchor,
      note: finding.note,
      reason: finding.reason,
      detail: finding.detail || "",
    })),
  };
}

/**
 * Answer, without building anything, which findings would become comments.
 *
 * The preview asks this so the writer knows what will travel before choosing
 * Save. It runs the same walk and the same resolver the export runs, so the
 * two can never disagree.
 *
 * @param {Array<any>} tokens
 * @param {Array<Record<string, any>>} findings
 * @param {{ commentAuthor?: string, savedAt?: string }} [meta]
 */
function planWordComments(tokens, findings, meta = {}) {
  const { flow, definitions } = splitWordFootnotes(tokens || []);
  const state = wordBuildState(definitions);
  wordBlockXml(flow, state);
  return wordCommentReport(resolveWordComments(state.paragraphs, findings, wordCommentMeta(meta)));
}

/**
 * Read the Review Desk's own report rows as findings.
 *
 * The Review Desk writes its findings as a table whose first column is the
 * sentence the finding is about; the columns after it are what the reviewer
 * said. A row this cannot read -- a header, a separator, a row with one cell
 * -- is dropped, because a row with no quoted sentence has nothing to anchor
 * to and this must not invent one.
 *
 * @param {Array<Array<string>>} rows
 * @param {{ author?: string, skipFirstRow?: boolean }} [options]
 * @returns {Array<{ anchor: string, note: string, author: string }>}
 */
function reviewFindingsFromRows(rows, options = {}) {
  const author = String(options.author || "").trim();
  const list = Array.isArray(rows) ? rows : [];
  const body = options.skipFirstRow === false ? list : list.slice(1);
  return body
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
    .filter((cells) => cells.length > 1 && cells[0] && !/^-{3,}$/.test(cells[0]))
    .map((cells) => ({
      anchor: cells[0],
      note: cells.slice(1).filter(Boolean).join(" — "),
      author,
    }))
    .filter((finding) => finding.note);
}

function wordStylesXml(setup) {
  const size = wordHalfPoints(setup.fontPt);
  const line = Math.round(WORD_TWIPS_PER_LINE * setup.lineHeight);
  const font = wordXmlText(setup.wordFontName);
  const fonts = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/>`;
  const heading = (level, scale) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>`
    + `<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/>`
    + `<w:spacing w:before="${level === 1 ? 0 : 240}" w:after="120" w:line="${line}" w:lineRule="auto"/>`
    + `${level === 1 ? '<w:jc w:val="center"/>' : ""}</w:pPr>`
    + `<w:rPr>${fonts}<w:b/><w:sz w:val="${wordHalfPoints(setup.fontPt * scale)}"/></w:rPr></w:style>`;

  return `${WORD_XML_DECLARATION}
<w:styles xmlns:w="${WORD_NAMESPACE_MAIN}">
<w:docDefaults><w:rPrDefault><w:rPr>${fonts}<w:sz w:val="${size}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${heading(1, setup.headingScale[1])}
${heading(2, setup.headingScale[2])}
${heading(3, setup.headingScale[3])}
${heading(4, 1)}
${heading(5, 1)}
${heading(6, 1)}
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="555555"/></w:pBdr></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="SourceCode"><w:name w:val="Source Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="HorizontalRule"><w:name w:val="Horizontal Rule"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="777777"/></w:pBdr><w:spacing w:before="240" w:after="240"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="${wordHalfPoints(setup.fontPt * 0.85)}"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="${wordHalfPoints(setup.fontPt * 0.85)}"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/></w:rPr></w:style>
</w:styles>`;
}

function wordNumberingXml() {
  // <w:numPr> without a numbering part is a reference to nothing, and Word
  // reports the file as damaged rather than falling back to a plain
  // paragraph. Three levels each is what the writing route's outline depth
  // can produce.
  const levels = (format, text) =>
    [0, 1, 2]
      .map(
        (level) =>
          `<w:lvl w:ilvl="${level}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>`
          + `<w:lvlText w:val="${text(level)}"/><w:lvlJc w:val="left"/>`
          + `<w:pPr><w:ind w:left="${360 * (level + 1)}" w:hanging="360"/></w:pPr>`
          + (format === "bullet" ? '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>' : "")
          + "</w:lvl>"
      )
      .join("");
  return `${WORD_XML_DECLARATION}
<w:numbering xmlns:w="${WORD_NAMESPACE_MAIN}">
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels("bullet", () => "")}</w:abstractNum>
<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${levels("decimal", (level) => `%${level + 1}.`)}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`;
}

function wordFootnotesXml(state) {
  const separators = `<w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>`
    + `<w:footnote w:type="continuationSeparator" w:id="1"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`;
  const notes = state.footnoteOrder
    .map((name) => {
      const id = state.footnoteIds.get(name);
      const body = state.definitions.get(name) || "";
      return `<w:footnote w:id="${id}">`
        + wordParagraph('<w:pStyle w:val="FootnoteText"/>', wordTextRun(body, {}))
        + "</w:footnote>";
    })
    .join("");
  return `${WORD_XML_DECLARATION}
<w:footnotes xmlns:w="${WORD_NAMESPACE_MAIN}">${separators}${notes}</w:footnotes>`;
}

function wordDocumentRelationshipsXml(state, hasComments) {
  const links = state.links
    .map(
      (link) =>
        `<Relationship Id="${link.id}" Type="${WORD_NAMESPACE_RELATIONSHIPS}/hyperlink"`
        + ` Target="${wordXmlText(link.target)}" TargetMode="External"/>`
    )
    .join("");
  // A comment reference with no relationship to word/comments.xml is a
  // reference to nothing, and Word calls the whole package damaged rather than
  // showing the manuscript without its notes. The relationship exists only
  // when the part exists, for the same reason.
  const comments = hasComments
    ? `<Relationship Id="rIdComments" Type="${WORD_NAMESPACE_RELATIONSHIPS}/comments" Target="comments.xml"/>\n`
    : "";
  return `${WORD_XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="${WORD_NAMESPACE_RELATIONSHIPS}/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="${WORD_NAMESPACE_RELATIONSHIPS}/numbering" Target="numbering.xml"/>
<Relationship Id="rIdFootnotes" Type="${WORD_NAMESPACE_RELATIONSHIPS}/footnotes" Target="footnotes.xml"/>
${comments}${links}</Relationships>`;
}

function wordCorePropertiesXml(meta) {
  const stamp = wordXmlText(meta.savedAt);
  return `${WORD_XML_DECLARATION}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"`
    + ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"`
    + ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${wordXmlText(meta.title)}</dc:title>
<dc:language>${wordXmlText(meta.language)}</dc:language>
<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>
</cp:coreProperties>`;
}

function wordContentTypesXml(hasComments) {
  // An override that names a part which is not in the package is as fatal as a
  // part with no override, so the comments line and the comments part appear
  // together or not at all.
  const comments = hasComments
    ? '<Override PartName="/word/comments.xml"'
      + ' ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>\n'
    : "";
  return `${WORD_XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
${comments}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;
}

const WORD_PACKAGE_RELATIONSHIPS_XML = `${WORD_XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${WORD_NAMESPACE_RELATIONSHIPS}/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

/**
 * The state one walk of the body collects: the footnotes and links it met, and
 * the paragraphs a review note may be anchored to.
 */
function wordBuildState(definitions) {
  return {
    definitions,
    footnoteIds: new Map(),
    footnoteOrder: [],
    links: [],
    paragraphs: [],
    commentsPlaced: new Set(),
  };
}

function wordCommentMeta(meta = {}) {
  return {
    author: String(meta.commentAuthor || "Review Desk").trim() || "Review Desk",
    date: String(meta.savedAt || "1980-01-01T00:00:00Z"),
  };
}

/**
 * Build every part of the .docx, and say what became of the review notes.
 *
 * @param {Array<any>} tokens the lexer result parseMarkdownDocument() already made
 * @param {Record<string, any>} pageSetup the metrics the print stylesheet was built from
 * @param {{ title?: string, language?: string, savedAt?: string, commentAuthor?: string }} meta
 * @param {{ findings?: Array<Record<string, any>> }} [options]
 * @returns {{ parts: Record<string, string>, comments: { requested: number, placed: number,
 *   skipped: Array<{ anchor: string, note: string, reason: string, detail: string }> } }}
 */
function buildWordDocumentPackage(tokens, pageSetup, meta = {}, options = {}) {
  const setup = normalizeWordPageSetup(pageSetup);
  const { flow, definitions } = splitWordFootnotes(tokens);
  const state = wordBuildState(definitions);
  // Pass one lays out the body with a slot where each paragraph will go. The
  // paragraphs cannot be written yet, because a comment range is only known
  // once every paragraph's text has been read.
  const skeleton = wordBlockXml(flow, state);
  const info = {
    title: String(meta.title || ""),
    language: String(meta.language || "en"),
    savedAt: String(meta.savedAt || "1980-01-01T00:00:00Z"),
  };

  const resolved = resolveWordComments(state.paragraphs, options.findings, wordCommentMeta(meta));
  for (const comment of resolved.placed) state.paragraphs[comment.paragraph].marks.push(comment);
  const body = wordFillParagraphSlots(skeleton, state);
  // comments.xml is written from the ranges the body actually carries, never
  // from the ranges that were asked for. A note whose range did not reach the
  // page is reported to the writer, not left in the package as an orphan.
  const written = resolved.placed.filter((comment) => state.commentsPlaced.has(comment.id));
  const lost = resolved.placed
    .filter((comment) => !state.commentsPlaced.has(comment.id))
    .map((comment) => ({ ...comment, reason: WORD_COMMENT_SKIP_ANCHOR_UNPLACEABLE, detail: "" }));

  const document = `${WORD_XML_DECLARATION}
<w:document xmlns:w="${WORD_NAMESPACE_MAIN}" xmlns:r="${WORD_NAMESPACE_RELATIONSHIPS}">
<w:body>${body}${wordSectionProperties(setup)}</w:body>
</w:document>`;

  const parts = {
    "[Content_Types].xml": wordContentTypesXml(written.length > 0),
    "_rels/.rels": WORD_PACKAGE_RELATIONSHIPS_XML,
    "word/document.xml": document,
    "word/styles.xml": wordStylesXml(setup),
    "word/numbering.xml": wordNumberingXml(),
    "word/footnotes.xml": wordFootnotesXml(state),
    ...(written.length ? { "word/comments.xml": wordCommentsXml(written) } : {}),
    "word/_rels/document.xml.rels": wordDocumentRelationshipsXml(state, written.length > 0),
    "docProps/core.xml": wordCorePropertiesXml(info),
  };

  return {
    parts,
    comments: wordCommentReport({
      requested: resolved.requested,
      placed: written,
      skipped: [...resolved.skipped, ...lost],
    }),
  };
}

/**
 * The parts alone, for a caller that has no review notes to carry.
 *
 * @param {Array<any>} tokens
 * @param {Record<string, any>} pageSetup
 * @param {{ title?: string, language?: string, savedAt?: string, commentAuthor?: string }} meta
 * @param {{ findings?: Array<Record<string, any>> }} [options]
 * @returns {Record<string, string>} part name to XML, in package order
 */
function buildWordDocument(tokens, pageSetup, meta = {}, options = {}) {
  return buildWordDocumentPackage(tokens, pageSetup, meta, options).parts;
}

/**
 * Zip the parts into the bytes of one .docx.
 *
 * @param {Record<string, string>} parts
 * @returns {Promise<Uint8Array>}
 */
function packWordDocument(parts) {
  return zipContainer(Object.entries(parts).map(([name, data]) => ({ name, data })));
}

/**
 * Write one .docx to the writer's disk, through the same exit every other
 * artifact leaves by.
 *
 * The self-check runs first and stops the write. Nothing about the file is
 * reported unless saveArtifact() confirmed the download was dispatched --
 * which is also all it can confirm, because no page can see whether the user
 * kept the file.
 *
 * The review notes travel the same way. Each finding that could be anchored
 * becomes a Word comment; each one that could not is named in the returned
 * report, with the reason, so the writer knows what did not reach the editor.
 *
 * @param {{ tokens?: Array<any>, pageSetup?: Record<string, any>, title?: string,
 *   fileName?: string, language?: string, savedAt?: string, commentAuthor?: string,
 *   findings?: Array<Record<string, any>> }} doc
 * @returns {Promise<{ saved: boolean, problems: Array<{ code: string, detail: string }>,
 *   comments: { requested: number, placed: number, skipped: Array<any> } }>}
 */
async function exportDocumentAsWord(doc = {}) {
  const tokens = doc.tokens || [];
  const inspection = inspectWordDocumentStructure(tokens);
  if (!inspection.ok) {
    return { saved: false, problems: inspection.problems, comments: { requested: 0, placed: 0, skipped: [] } };
  }

  const built = buildWordDocumentPackage(tokens, doc.pageSetup, {
    title: doc.title,
    language: doc.language,
    savedAt: doc.savedAt,
    commentAuthor: doc.commentAuthor,
  }, { findings: doc.findings });
  const parts = built.parts;
  const bytes = await packWordDocument(parts);
  const name = typeof sanitizeFilename === "function"
    ? sanitizeFilename(doc.fileName || doc.title || "document")
    : String(doc.fileName || doc.title || "document");
  const saved = window.AISystem6WebPlatform?.saveArtifact?.({
    blob: new Blob([bytes], { type: WORD_DOCX_MIME }),
    fileName: `${name}.docx`,
    mimeType: WORD_DOCX_MIME,
  }) === true;
  return { saved, problems: [], comments: built.comments };
}

window.AISystem6WordExport = Object.freeze({
  WORD_DOCX_MIME,
  WORD_COMMENT_SKIP_ANCHOR_AMBIGUOUS,
  WORD_COMMENT_SKIP_ANCHOR_EMPTY,
  WORD_COMMENT_SKIP_ANCHOR_NOT_FOUND,
  WORD_COMMENT_SKIP_ANCHOR_UNPLACEABLE,
  WORD_COMMENT_SKIP_NOTE_EMPTY,
  buildWordDocument,
  buildWordDocumentPackage,
  exportDocumentAsWord,
  inspectWordDocumentStructure,
  packWordDocument,
  planWordComments,
  reviewFindingsFromRows,
  zipContainer,
});
