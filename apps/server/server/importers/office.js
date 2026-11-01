// ZIP-backed document importers: DOCX, PPTX, XLSX, and EPUB. This
// mirrors the corresponding slice of server-importers.js.

"use strict";

const { decodeHtml } = require("../lib/text.js");
const { cleanImportedText, stripXml } = require("./shared.js");
const { extractHtmlText } = require("./text.js");
const { readZipEntries } = require("./zip.js");
const path = require("node:path");

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


module.exports = {
  extractWordXmlText,
  extractDocxText,
  extractPptxText,
  extractSharedStrings,
  extractXlsxText,
  extractEpubText,
};

// EPUB reading order lives in the OPF spine, not in the file names. Sorting
// chapter files alphabetically produced chapters in the wrong order whenever a
// publisher named them chapter-1.xhtml, chapter-10.xhtml, chapter-2.xhtml, so
// the spine is followed and nav/toc supplies the chapter titles.
/**
 * @param {string} tag
 * @param {string} name
 * @returns {string}
 */
function epubAttribute(tag, name) {
  const match = new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i").exec(tag);
  if (match === null) return "";
  return match[2] !== undefined ? match[2] : (match[3] || "");
}

/**
 * @param {string} baseDir
 * @param {string} href
 * @returns {string}
 */
function resolveEpubPath(baseDir, href) {
  const clean = String(href || "").split("#")[0].trim();
  if (clean === "") return "";
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  const joined = decoded.startsWith("/") ? decoded.slice(1) : baseDir + decoded;
  return path.posix.normalize(joined);
}

/**
 * @param {string} opfXml
 * @returns {Map<string, { href: string, mediaType: string, properties: string }>}
 */
function parseEpubManifest(opfXml) {
  const manifest = new Map();
  const itemPattern = /<item\b[^>]*\/?>/gi;
  let match;
  while ((match = itemPattern.exec(opfXml))) {
    const id = epubAttribute(match[0], "id");
    const href = epubAttribute(match[0], "href");
    if (id === "" || href === "") continue;
    manifest.set(id, {
      href,
      mediaType: epubAttribute(match[0], "media-type"),
      properties: epubAttribute(match[0], "properties"),
    });
  }
  return manifest;
}

/**
 * @param {string} opfXml
 * @returns {string[]}
 */
function parseEpubSpine(opfXml) {
  const spine = [];
  const itemRefPattern = /<itemref\b[^>]*\/?>/gi;
  let match;
  while ((match = itemRefPattern.exec(opfXml))) {
    const idref = epubAttribute(match[0], "idref");
    if (idref !== "") spine.push(idref);
  }
  return spine;
}

/**
 * @param {Map<string, Buffer>} entries
 * @param {Map<string, { href: string, mediaType: string, properties: string }>} manifest
 * @param {string} opfDir
 * @returns {Map<string, string>}
 */
function epubChapterTitles(entries, manifest, opfDir) {
  const titles = new Map();

  function record(href, markup, baseDir) {
    const title = stripXml(markup).replace(/\s+/g, " ").trim();
    if (title === "" || href === "") return;
    const resolved = resolveEpubPath(baseDir, href);
    if (resolved !== "") titles.set(resolved, title);
  }

  for (const item of manifest.values()) {
    if (/nav/i.test(item.properties) === false) continue;
    const navPath = resolveEpubPath(opfDir, item.href);
    const nav = entries.get(navPath) || entries.get(item.href);
    if (nav === undefined) break;
    const navDir = navPath.includes("/") ? navPath.slice(0, navPath.lastIndexOf("/") + 1) : "";
    const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let link;
    while ((link = linkPattern.exec(nav.toString("utf8")))) {
      record(link[1], link[2], navDir);
    }
    break;
  }
  if (titles.size > 0) return titles;

  for (const item of manifest.values()) {
    if (/dtbncx/i.test(item.mediaType) === false && /\.ncx$/i.test(item.href) === false) continue;
    const ncxPath = resolveEpubPath(opfDir, item.href);
    const ncx = entries.get(ncxPath) || entries.get(item.href);
    if (ncx === undefined) break;
    const ncxDir = ncxPath.includes("/") ? ncxPath.slice(0, ncxPath.lastIndexOf("/") + 1) : "";
    const pointPattern = /<navPoint\b[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src=["']([^"']+)["']/gi;
    let point;
    while ((point = pointPattern.exec(ncx.toString("utf8")))) {
      record(point[2], point[1], ncxDir);
    }
    break;
  }
  return titles;
}

/**
 * @param {Map<string, Buffer>} entries
 * @returns {string}
 */
function extractEpubBySpine(entries) {
  const container = entries.get("META-INF/container.xml");
  if (container === undefined) return "";
  const fullPath = /full-path\s*=\s*["']([^"']+)["']/i.exec(container.toString("utf8"));
  const opfPath = fullPath === null ? "" : resolveEpubPath("", fullPath[1]);
  const opf = opfPath === "" ? undefined : entries.get(opfPath);
  if (opf === undefined) return "";

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const opfXml = opf.toString("utf8");
  const manifest = parseEpubManifest(opfXml);
  const spine = parseEpubSpine(opfXml);
  const titles = epubChapterTitles(entries, manifest, opfDir);

  const parts = [];
  for (const idref of spine) {
    const item = manifest.get(idref);
    if (item === undefined) continue;
    const entryPath = resolveEpubPath(opfDir, item.href);
    const chapter = entries.get(entryPath) || entries.get(item.href);
    if (chapter === undefined) continue;
    const body = extractHtmlText(chapter).trim();
    if (body === "") continue;
    const title = titles.get(entryPath) || "";
    parts.push(title === "" ? body : "## " + title + "\n\n" + body);
  }
  return parts.join("\n\n");
}

/**
 * EPUBs declare their reading order in the OPF spine. Fall back to the older
 * alphabetical chapter sweep only when there is no usable container/OPF so
 * malformed books still import something.
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractEpubText(buffer) {
  const entries = readZipEntries(buffer);
  const bySpine = extractEpubBySpine(entries).trim();
  if (bySpine.length > 0) return bySpine;

  const names = [...entries.keys()]
    .filter((name) => /\.(xhtml|html|htm|xml)$/i.test(name) && /^(META-INF|mimetype)/i.test(name) === false)
    .sort();
  const text = names
    .map((name) => extractHtmlText(entries.get(name)))
    .filter(Boolean)
    .join("\n\n");
  if (text.trim().length === 0) throw new Error("Could not find readable text in EPUB.");
  return text;
}
