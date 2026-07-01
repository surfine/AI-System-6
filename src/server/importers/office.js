// ZIP-backed document importers: DOCX, PPTX, XLSX, and EPUB. This
// mirrors the corresponding slice of server-importers.js.

"use strict";

const { decodeHtml } = require("../lib/text.js");
const { cleanImportedText, stripXml } = require("./shared.js");
const { extractHtmlText } = require("./text.js");
const { readZipEntries } = require("./zip.js");

/**
 * @param {unknown} value
 * @returns {string}
 */
function extractWordXmlText(value) {
  const xml = String(value || "");
  const parts = [];

  const blockPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/gi;
  let blockMatch;

  while ((blockMatch = blockPattern.exec(xml))) {
    const pContent = blockMatch[1];
    const tblContent = blockMatch[2];

    if (pContent !== undefined) {
      let headingLevel = 0;
      const styleMatch = pContent.match(/<w:pStyle\b[^>]*\bw:val=["']Heading(\d+)["']/i);
      if (styleMatch) {
        headingLevel = parseInt(styleMatch[1], 10);
      }

      const isList = pContent.includes("<w:numPr>");

      const rPattern = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<w:noBreakHyphen\b[^>]*\/>/gi;
      let rMatch;
      const pTextParts = [];

      while ((rMatch = rPattern.exec(pContent))) {
        const token = rMatch[0];
        if (token.startsWith("<w:r")) {
          const rContent = rMatch[1];
          const isBold = rContent.includes("<w:b/>") || rContent.includes("<w:b ");
          const isItalic = rContent.includes("<w:i/>") || rContent.includes("<w:i ");

          const tPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
          let tMatch;
          let rText = "";
          while ((tMatch = tPattern.exec(rContent))) {
            rText += decodeHtml(tMatch[1]);
          }

          if (rText) {
            if (isBold && isItalic) rText = `***${rText}***`;
            else if (isBold) rText = `**${rText}**`;
            else if (isItalic) rText = `*${rText}*`;
            pTextParts.push(rText);
          }
        } else if (token.includes("tab")) {
          pTextParts.push("\t");
        } else if (token.includes("br") || token.includes("cr")) {
          pTextParts.push("\n");
        } else if (token.includes("noBreakHyphen")) {
          pTextParts.push("-");
        }
      }

      const pText = pTextParts.join("").trim();
      if (pText) {
        if (headingLevel >= 1 && headingLevel <= 6) {
          parts.push(`${"#".repeat(headingLevel)} ${pText}`);
        } else if (isList) {
          parts.push(`- ${pText}`);
        } else {
          parts.push(pText);
        }
      }
    } else if (tblContent !== undefined) {
      const trPattern = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi;
      const rows = [];
      let trMatch;
      let maxCols = 0;

      while ((trMatch = trPattern.exec(tblContent))) {
        const trContent = trMatch[1];
        const tcPattern = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi;
        const cells = [];
        let tcMatch;

        while ((tcMatch = tcPattern.exec(trContent))) {
          const tcContent = tcMatch[1];
          const cellPPattern = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
          const cellPTexts = [];
          let cellPMatch;
          while ((cellPMatch = cellPPattern.exec(tcContent))) {
            const cellPContent = cellPMatch[1];
            const tPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
            let tMatch;
            let pText = "";
            while ((tMatch = tPattern.exec(cellPContent))) {
              pText += decodeHtml(tMatch[1]);
            }
            pText = pText.trim();
            if (pText) cellPTexts.push(pText);
          }
          cells.push(cellPTexts.join(" ").replace(/\|/g, "\\|").trim());
        }
        if (cells.length) {
          rows.push(cells);
          maxCols = Math.max(maxCols, cells.length);
        }
      }

      if (rows.length) {
        const mdRows = [];
        const header = rows[0];
        while (header.length < maxCols) header.push("");
        mdRows.push(`| ${header.join(" | ")} |`);
        mdRows.push(`| ${Array(maxCols).fill("---").join(" | ")} |`);

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          while (row.length < maxCols) row.push("");
          mdRows.push(`| ${row.join(" | ")} |`);
        }
        parts.push(mdRows.join("\n"));
      }
    }
  }

  if (!parts.length) {
    const tPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
    let tMatch;
    const fallbackParts = [];
    while ((tMatch = tPattern.exec(xml))) {
      fallbackParts.push(decodeHtml(tMatch[1]));
    }
    return cleanImportedText(fallbackParts.join(""));
  }

  return cleanImportedText(parts.join("\n\n"));
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractDocxText(buffer) {
  const entries = readZipEntries(buffer);
  const names = [
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
    ...[...entries.keys()].filter((name) => /^word\/(header|footer)\d+\.xml$/i.test(name)),
  ];
  const text = names
    .map((name) => entries.get(name))
    .filter(Boolean)
    .map((entry) => extractWordXmlText(entry.toString("utf8")))
    .filter(Boolean)
    .join("\n\n");

  if (!text.trim()) throw new Error("Could not find readable text in DOCX.");
  return text;
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractPptxText(buffer) {
  const entries = readZipEntries(buffer);
  const slideNames = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  const notesNames = [...entries.keys()]
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));

  const slides = [];

  slideNames.forEach((name, slideIndex) => {
    const xml = entries.get(name).toString("utf8");
    const pPattern = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
    const pTexts = [];
    let pMatch;
    while ((pMatch = pPattern.exec(xml))) {
      const pContent = pMatch[1];
      const tPattern = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi;
      let tMatch;
      let pText = "";
      while ((tMatch = tPattern.exec(pContent))) {
        pText += decodeHtml(tMatch[1]);
      }
      pText = pText.trim();
      if (pText) {
        pTexts.push(`- ${pText}`);
      }
    }
    if (pTexts.length) {
      slides.push(`## Slide ${slideIndex + 1}\n\n${pTexts.join("\n")}`);
    }
  });

  notesNames.forEach((name, noteIndex) => {
    const xml = entries.get(name).toString("utf8");
    const pPattern = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi;
    const pTexts = [];
    let pMatch;
    while ((pMatch = pPattern.exec(xml))) {
      const pContent = pMatch[1];
      const tPattern = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi;
      let tMatch;
      let pText = "";
      while ((tMatch = tPattern.exec(pContent))) {
        pText += decodeHtml(tMatch[1]);
      }
      pText = pText.trim();
      if (pText) {
        pTexts.push(pText);
      }
    }
    if (pTexts.length) {
      slides.push(`### Slide ${noteIndex + 1} Notes\n\n${pTexts.join("\n\n")}`);
    }
  });

  const text = slides.join("\n\n");
  if (!text.trim()) throw new Error("Could not find readable text in PPTX.");
  return text;
}

/**
 * @param {Map<string, Buffer>} entries
 * @returns {string[]}
 */
function extractSharedStrings(entries) {
  const shared = entries.get("xl/sharedStrings.xml");
  if (!shared) return [];
  const xml = shared.toString("utf8");
  const values = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let match;
  while ((match = itemPattern.exec(xml))) {
    values.push(stripXml(match[1]));
  }
  return values;
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractXlsxText(buffer) {
  function colRefToIndex(ref) {
    const letters = ref.toUpperCase().match(/^[A-Z]+/)?.[0];
    if (!letters) return -1;
    let index = 0;
    for (let i = 0; i < letters.length; i++) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  const entries = readZipEntries(buffer);
  const sharedStrings = extractSharedStrings(entries);
  const sheetNames = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  const sheets = [];

  sheetNames.forEach((name, sheetIndex) => {
    const xml = entries.get(name).toString("utf8");
    const rows = [];
    const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
    let rowMatch;
    let maxCols = 0;

    while ((rowMatch = rowPattern.exec(xml))) {
      const cells = [];
      const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
        const attrs = cellMatch[1] || "";
        const body = cellMatch[2] || "";

        const refMatch = attrs.match(/r=["']([A-Z]+)\d+["']/i);
        const colIndex = refMatch ? colRefToIndex(refMatch[1]) : -1;

        const valueMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/i);
        const inlineMatch = body.match(/<is[^>]*>([\s\S]*?)<\/is>/i);
        let value = valueMatch ? stripXml(valueMatch[1]) : inlineMatch ? stripXml(inlineMatch[1]) : "";
        const sharedStringIndex = Number(value);
        if (/t\s*=\s*["']s["']/.test(attrs) || (Number.isInteger(sharedStringIndex) && sharedStrings[sharedStringIndex])) {
          value = sharedStrings[Number(value)] || value;
        }

        const cleanedValue = value.replace(/\|/g, "\\|").trim();
        if (colIndex >= 0) {
          cells[colIndex] = cleanedValue;
        } else {
          cells.push(cleanedValue);
        }
      }

      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === undefined) cells[i] = "";
      }

      if (cells.length) {
        rows.push(cells);
        maxCols = Math.max(maxCols, cells.length);
      }
    }

    if (rows.length) {
      const mdRows = [];
      const header = rows[0];
      while (header.length < maxCols) header.push("");
      mdRows.push(`| ${header.join(" | ")} |`);
      mdRows.push(`| ${Array(maxCols).fill("---").join(" | ")} |`);

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        while (row.length < maxCols) row.push("");
        mdRows.push(`| ${row.join(" | ")} |`);
      }
      sheets.push(`### Sheet ${sheetIndex + 1}\n\n${mdRows.join("\n")}`);
    }
  });

  const text = sheets.join("\n\n");
  if (!text.trim()) throw new Error("Could not find readable text in XLSX.");
  return text;
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractEpubText(buffer) {
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()]
    .filter((name) => /\.(xhtml|html|htm|xml)$/i.test(name) && !/^(META-INF|mimetype)/i.test(name))
    .sort();
  const text = names
    .map((name) => extractHtmlText(entries.get(name)))
    .filter(Boolean)
    .join("\n\n");
  if (!text.trim()) throw new Error("Could not find readable text in EPUB.");
  return text;
}

module.exports = {
  extractWordXmlText,
  extractDocxText,
  extractPptxText,
  extractSharedStrings,
  extractXlsxText,
  extractEpubText,
};
