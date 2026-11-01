// N9 (CLIOWORKS-1060-REMAINING-SPEC 二): an iWork file becomes an editable
// Office copy through the SAME importer chain that reads its text. The IWA
// structures the importer already parses (Pages paragraphs, Numbers tables,
// Keynote slides) are written into minimal but real OOXML packages here; the
// conversion is honest about being text-shaped: whatever the importer cannot
// read is listed in `report.notCarried` as translation keys, never dropped in
// silence, and the browser's first-save list shows exactly that.
//
// No iWork-native write-back exists or is planned (roadmap 「明确不做」): the
// original stays read-only and the copy is a separate Office document.

"use strict";

const zlib = require("node:zlib");
const { readZipEntries } = require("./zip.js");
const {
  extractPagesIwaChunks,
  extractNumbersIwaTables,
  extractKeynoteIwaSlides,
  iworkKindForName,
} = require("./iwork.js");

const OFFICE_FORMAT_BY_KIND = Object.freeze({
  pages: "docx",
  numbers: "xlsx",
  keynote: "pptx",
});

/** @typedef {{ kind: string, paragraphs?: number, tables?: number, rows?: number, slides?: number, mediaObjects: number, notCarried: string[] }} IworkConvertReport */

/* ---------------------------------------------------------------- ZIP writer */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** @param {Buffer} data @returns {number} */
function crc32(data) {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * A minimal ZIP writer: local headers, one central directory, one EOCD. Every
 * entry is deflated (the XML of a text document compresses several times
 * over); nothing here needs the extras real writers carry.
 * @param {[string, Buffer][]} parts in package order
 * @returns {Buffer}
 */
function buildZip(parts) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of parts) {
    const nameBuffer = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(content, { level: 6 });
    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // deflated
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x5c21, 12); // DOS date 2026-01-01 (a fixed valid date; nothing reads it for meaning)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, deflated);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x5c21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(deflated.length, 20);
    entry.writeUInt32LE(content.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // disk
    entry.writeUInt16LE(0, 36); // internal attrs
    entry.writeUInt32LE(0, 38); // external attrs
    entry.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([entry, nameBuffer]));

    offset += local.length + nameBuffer.length + deflated.length;
  }

  const centralBuffer = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(parts.length, 8);
  eocd.writeUInt16LE(parts.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, eocd]);
}

/* --------------------------------------------------------------- XML helpers */

/** @param {string} text @returns {string} */
function xmlEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** @param {string} body @returns {Buffer} */
const xmlPart = (body) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`, "utf8");

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const RELS_DOC_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/**
 * @param {string[][]} relationships rows of [id, typeTail, target]
 * @returns {Buffer}
 */
function relationshipsPart(relationships) {
  const items = relationships
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${RELS_DOC_NS}/${type}" Target="${target}"/>`)
    .join("");
  return xmlPart(`<Relationships xmlns="${RELS_NS}">${items}</Relationships>`);
}

/**
 * @param {string[][]} overrides rows of [partName, contentType]
 * @param {string[][]} [defaults] rows of [extension, contentType]
 * @returns {Buffer}
 */
function contentTypesPart(overrides, defaults = [["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"]]) {
  const def = defaults.map(([ext, type]) => `<Default Extension="${ext}" ContentType="${type}"/>`).join("");
  const over = overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join("");
  return xmlPart(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${def}${over}</Types>`);
}

const CT = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  worksheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  slideMaster: "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml",
  slideLayout: "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml",
  slide: "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
  theme: "application/vnd.openxmlformats-officedocument.theme+xml",
};

/* ------------------------------------------------------------------ docx out */

/**
 * @param {string[]} paragraphs cleaned paragraph texts
 * @returns {Buffer}
 */
function buildDocx(paragraphs) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body = paragraphs
    .map((text) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`)
    .join("");
  const document = xmlPart(
    `<w:document xmlns:w="${W}"><w:body>${body}` +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>` +
      `</w:body></w:document>`
  );
  return buildZip([
    ["[Content_Types].xml", contentTypesPart([["/word/document.xml", CT.docx]])],
    ["_rels/.rels", relationshipsPart([["rId1", "officeDocument", "word/document.xml"]])],
    ["word/document.xml", document],
  ]);
}

/* ------------------------------------------------------------------ xlsx out */

/** Column index → A1 letters. @param {number} index @returns {string} */
function columnLetters(index) {
  let letters = "";
  let value = index;
  while (value >= 0) {
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26) - 1;
  }
  return letters;
}

const NUMERIC_TEXT = /^-?\d+(?:\.\d+)?$/;

/** A plain number survives as a number (formulas are already only cached text). */
function sheetCell(row, column, value) {
  const ref = `${columnLetters(column)}${row}`;
  if (NUMERIC_TEXT.test(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

/**
 * @param {{ name: string, rows: string[][] }[]} tables one sheet per table
 * @returns {Buffer}
 */
function buildXlsx(tables) {
  const used = new Set();
  const sheetName = (wanted, index) => {
    let name = String(wanted || "").replace(/[\\/?*[\]:]/g, "_").slice(0, 31).trim();
    if (!name) name = `Sheet${index + 1}`;
    let unique = name;
    let suffix = 2;
    while (used.has(unique.toLowerCase())) unique = `${name.slice(0, 28)} ${suffix++}`;
    used.add(unique.toLowerCase());
    return unique;
  };

  const sheetParts = tables.map((table, index) => {
    const rows = table.rows
      .map((cells, rowIndex) => {
        const columns = cells
          .map((value, columnIndex) => sheetCell(rowIndex + 1, columnIndex, String(value || "")))
          .join("");
        return columns ? `<row r="${rowIndex + 1}">${columns}</row>` : "";
      })
      .join("");
    const sheet = xmlPart(
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${rows}</sheetData></worksheet>`
    );
    return { name: sheetName(table.name, index), part: `xl/worksheets/sheet${index + 1}.xml`, body: sheet };
  });

  const sheetRefs = sheetParts
    .map((part, index) => `<sheet name="${xmlEscape(part.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const workbook = xmlPart(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELS_DOC_NS}">` +
      `<sheets>${sheetRefs}</sheets></workbook>`
  );

  /** @type {[string, Buffer][]} */
  const parts = [
    ["[Content_Types].xml", contentTypesPart([
      ["/xl/workbook.xml", CT.xlsx],
      ...sheetParts.map((part) => [`/${part.part}`, CT.worksheet]),
    ])],
    ["_rels/.rels", relationshipsPart([["rId1", "officeDocument", "xl/workbook.xml"]])],
    ["xl/workbook.xml", workbook],
    ["xl/_rels/workbook.xml.rels", relationshipsPart(
      sheetParts.map((part, index) => [`rId${index + 1}`, "worksheet", `worksheets/sheet${index + 1}.xml`])
    )],
    .../** @type {[string, Buffer][]} */(sheetParts.map((part) => [part.part, part.body])),
  ];
  return buildZip(parts);
}

/* ------------------------------------------------------------------ pptx out */

const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const SLIDE_W = 12192000;
const SLIDE_H = 6858000;

/** One slide's text: the first block is the title, the rest are body paragraphs. */
function slideXml(title, bodyParagraphs) {
  const shape = (id, name, phType, x, y, cx, cy, paragraphs) => {
    const paras = paragraphs.length
      ? paragraphs.map((text) => `<a:p><a:r><a:t xml:space="preserve">${xmlEscape(text)}</a:t></a:r></a:p>`).join("")
      : "<a:p/>";
    return (
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
      `<p:nvPr><p:ph type="${phType}"/></p:nvPr></p:nvSpPr>` +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
      `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`
    );
  };
  const titleShape = shape(2, "Title", "title", 838200, 365125, SLIDE_W - 1676400, 1325563, title ? [title] : []);
  const bodyShape = shape(3, "Body", "body", 838200, 1825625, SLIDE_W - 1676400, SLIDE_H - 2560375, bodyParagraphs);
  return xmlPart(
    `<p:sld xmlns:a="${A}" xmlns:r="${RELS_DOC_NS}" xmlns:p="${P}"><p:cSld><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
      `${titleShape}${bodyShape}</p:spTree></p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

const EMPTY_TREE =
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`;

const CLR_MAP =
  `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ` +
  `accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;

function themeXml() {
  const color = (tag, value) => `<a:${tag}><a:srgbClr val="${value}"/></a:${tag}>`;
  const hlinkColors = () => `${color("hlink", "0563C1")}${color("folHlink", "954F72")}`;
  return xmlPart(
    `<a:theme xmlns:a="${A}" name="Copy"><a:themeElements>` +
      `<a:clrScheme name="Copy">${color("dk1", "000000")}${color("lt1", "FFFFFF")}${color("dk2", "44546A")}${color("lt2", "E7E6E6")}` +
      `${color("accent1", "4472C4")}${color("accent2", "ED7D31")}${color("accent3", "A5A5A5")}${color("accent4", "FFC000")}` +
      `${color("accent5", "5B9BD5")}${color("accent6", "70AD47")}${hlinkColors()}` +
      `</a:clrScheme>` +
      `<a:fontScheme name="Copy"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
      `<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
      `<a:fmtScheme name="Copy">` +
      `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
      `<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
      `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
      `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
      `</a:fmtScheme></a:themeElements></a:theme>`
  );
}

/**
 * @param {string[][]} slides per-slide text blocks (block 1 = title)
 * @returns {Buffer}
 */
function buildPptx(slides) {
  const slideParts = slides.map((blocks, index) => {
    const [first, ...rest] = blocks;
    // A Keynote text block can hold its own line breaks; only the first line
    // is the title, every later line of every block is a body paragraph.
    const firstLines = String(first || "").split("\n").filter(Boolean);
    const body = [
      ...firstLines.slice(1),
      ...rest.flatMap((block) => String(block).split("\n")),
    ].filter(Boolean);
    return {
      part: `ppt/slides/slide${index + 1}.xml`,
      body: slideXml(firstLines[0] || "", body),
      rels: `ppt/slides/_rels/slide${index + 1}.xml.rels`,
    };
  });

  const slideIds = slideParts
    .map((part, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`)
    .join("");
  const presentation = xmlPart(
    `<p:presentation xmlns:a="${A}" xmlns:r="${RELS_DOC_NS}" xmlns:p="${P}">` +
      `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
      `<p:sldIdLst>${slideIds}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="${SLIDE_H}" cy="9144000"/></p:presentation>`
  );
  const master = xmlPart(
    `<p:sldMaster xmlns:a="${A}" xmlns:r="${RELS_DOC_NS}" xmlns:p="${P}"><p:cSld name="Copy">` +
      `<p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>${CLR_MAP}` +
      `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
  );
  const layout = xmlPart(
    `<p:sldLayout xmlns:a="${A}" xmlns:r="${RELS_DOC_NS}" xmlns:p="${P}" type="blank" preserve="1">` +
      `<p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  );

  /** @type {[string, Buffer][]} */
  const parts = [
    ["[Content_Types].xml", contentTypesPart([
      ["/ppt/presentation.xml", CT.pptx],
      ["/ppt/slideMasters/slideMaster1.xml", CT.slideMaster],
      ["/ppt/slideLayouts/slideLayout1.xml", CT.slideLayout],
      ["/ppt/theme/theme1.xml", CT.theme],
      ...slideParts.map((part) => [`/${part.part}`, CT.slide]),
    ])],
    ["_rels/.rels", relationshipsPart([["rId1", "officeDocument", "ppt/presentation.xml"]])],
    ["ppt/presentation.xml", presentation],
    ["ppt/_rels/presentation.xml.rels", relationshipsPart([
      ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
      ...slideParts.map((part, index) => [`rId${index + 2}`, "slide", `slides/slide${index + 1}.xml`]),
    ])],
    ["ppt/slideMasters/slideMaster1.xml", master],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", relationshipsPart([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
      ["rId2", "theme", "../theme/theme1.xml"],
    ])],
    ["ppt/slideLayouts/slideLayout1.xml", layout],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", relationshipsPart([
      ["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"],
    ])],
    ["ppt/theme/theme1.xml", themeXml()],
    .../** @type {[string, Buffer][]} */(slideParts.map((part) => [part.part, part.body])),
    .../** @type {[string, Buffer][]} */(slideParts.map((part) => [part.rels, relationshipsPart([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]])])),
  ];
  return buildZip(parts);
}

/* ---------------------------------------------------------------- conversion */

/**
 * Media/attachment payloads of the bundle: everything under Data/ that is not
 * an IWA stream. These are the objects the text-shaped copy cannot carry, so
 * they are counted, not guessed at.
 * @param {Map<string, Buffer>} entries
 * @returns {number}
 */
function countMediaObjects(entries) {
  let count = 0;
  for (const name of entries.keys()) {
    if (/^data\//i.test(name) && !/\.iwa$/i.test(name)) count += 1;
  }
  return count;
}

/**
 * Convert an iWork bundle into its Office counterpart through the importer's
 * own structures. `notCarried` holds translation keys for the first-save list.
 * @param {{ name?: string, mimeType?: string, buffer: Buffer }} input
 * @returns {Promise<{ format: string, fileName: string, bytes: Buffer, report: IworkConvertReport }>}
 */
async function convertIworkToOffice(input) {
  const kind = iworkKindForName(String(input.name || ""), input.mimeType);
  const format = OFFICE_FORMAT_BY_KIND[kind];
  if (!format) {
    throw Object.assign(new Error("Not a Pages, Numbers or Keynote file name."), { code: "IWORK_UNSUPPORTED_NAME" });
  }

  const entries = readZipEntries(input.buffer);
  const mediaObjects = countMediaObjects(entries);
  const notCarried = ["iwork_loss_layout"];
  if (mediaObjects > 0) notCarried.push("iwork_loss_media");
  if (kind === "numbers") notCarried.push("iwork_loss_formulas");
  if (kind === "keynote") notCarried.push("iwork_loss_slide_design");

  const stem = String(input.name || "document").replace(/\.[^.]+$/, "");
  const fileName = `${stem || "document"}.${format}`;

  if (kind === "pages") {
    const paragraphs = extractPagesIwaChunks(entries).flatMap((chunk) => chunk.split("\n")).filter(Boolean);
    if (!paragraphs.length) {
      throw Object.assign(new Error("No readable Pages text."), { code: "IWORK_CONVERT_EMPTY" });
    }
    return {
      format,
      fileName,
      bytes: buildDocx(paragraphs),
      report: { kind, paragraphs: paragraphs.length, mediaObjects, notCarried },
    };
  }

  if (kind === "numbers") {
    const tables = extractNumbersIwaTables(entries);
    const rows = tables.reduce((sum, table) => sum + table.rows.length, 0);
    if (!rows) {
      throw Object.assign(new Error("No readable Numbers tables."), { code: "IWORK_CONVERT_EMPTY" });
    }
    return {
      format,
      fileName,
      bytes: buildXlsx(tables),
      report: { kind, tables: tables.length, rows, mediaObjects, notCarried },
    };
  }

  const slides = extractKeynoteIwaSlides(entries);
  if (!slides.length) {
    throw Object.assign(new Error("No readable Keynote slides."), { code: "IWORK_CONVERT_EMPTY" });
  }
  return {
    format,
    fileName,
    bytes: buildPptx(slides),
    report: { kind, slides: slides.length, mediaObjects, notCarried },
  };
}

module.exports = {
  convertIworkToOffice,
  buildZip,
  OFFICE_FORMAT_BY_KIND,
};
