// Native importers for text-like formats: plain text, markdown,
// HTML/XHTML, and RTF.

"use strict";

const {
  importExtension,
  cleanImportedText,
  stripTags,
  decodeTextBuffer,
  decodePlainTextBuffer,
} = require("./shared.js");

const rtfDestinationControls = new Set([
  "annotation",
  "author",
  "category",
  "colortbl",
  "colorschememapping",
  "comment",
  "company",
  "datastore",
  "doccomm",
  "fonttbl",
  "footer",
  "footerf",
  "footerl",
  "footerr",
  "footnote",
  "generator",
  "header",
  "headerf",
  "headerl",
  "headerr",
  "info",
  "keywords",
  "latentstyles",
  "listoverridetable",
  "listtable",
  "manager",
  "nonshppict",
  "object",
  "operator",
  "pict",
  "revtbl",
  "rsidtbl",
  "shp",
  "shpinst",
  "shprslt",
  "stylesheet",
  "subject",
  "themedata",
  "title",
  "xmlnstbl",
]);

const rtfControlText = {
  bullet: "*",
  cell: "\t",
  emdash: "--",
  endash: "-",
  ldblquote: "\"",
  line: "\n",
  lquote: "'",
  par: "\n",
  rdblquote: "\"",
  row: "\n",
  rquote: "'",
  sect: "\n",
  tab: "\t",
};

/**
 * @param {number} codePage
 * @returns {string}
 */
function rtfEncodingFromCodePage(codePage) {
  switch (Number(codePage)) {
    case 65001: return "utf-8";
    case 936: return "gb18030";
    case 950: return "big5";
    case 932: return "shift_jis";
    case 949: return "euc-kr";
    case 1250: return "windows-1250";
    case 1251: return "windows-1251";
    case 1252: return "windows-1252";
    case 1253: return "windows-1253";
    case 1254: return "windows-1254";
    case 1255: return "windows-1255";
    case 1256: return "windows-1256";
    case 1257: return "windows-1257";
    case 1258: return "windows-1258";
    default: return "windows-1252";
  }
}

/**
 * @param {number[]} bytes
 * @param {number} codePage
 * @returns {string}
 */
function decodeRtfByteRun(bytes, codePage) {
  if (!bytes.length) return "";
  return decodeTextBuffer(Buffer.from(bytes), rtfEncodingFromCodePage(codePage));
}

/**
 * @param {number} value
 * @returns {string}
 */
function rtfUnicodeChar(value) {
  let code = Number(value);
  if (!Number.isFinite(code)) return "";
  if (code < 0) code += 65536;
  return String.fromCharCode(code);
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function extractRtfText(buffer) {
  const source = buffer.toString("latin1");
  const output = [];
  const stack = [{ skip: false, ucSkip: 1, destinationCandidate: false, starred: false }];
  let byteRun = [];
  let codePage = 1252;
  let fallbackCharsToSkip = 0;

  const flushBytes = () => {
    if (!byteRun.length) return;
    if (!stack[stack.length - 1].skip) output.push(decodeRtfByteRun(byteRun, codePage));
    byteRun = [];
  };

  const pushText = (text) => {
    if (!text || stack[stack.length - 1].skip) return;
    flushBytes();
    output.push(text);
  };

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const current = stack[stack.length - 1];

    if (fallbackCharsToSkip > 0) {
      if (ch === "\\") {
        const next = source[i + 1];
        if (next === "'") {
          i += 3;
        } else if (next && /[a-zA-Z]/.test(next)) {
          i++;
          while (i < source.length && /[a-zA-Z]/.test(source[i])) i++;
          if (source[i] === "-") i++;
          while (i < source.length && /\d/.test(source[i])) i++;
          if (source[i] !== " ") i--;
        }
      }
      fallbackCharsToSkip--;
      continue;
    }

    if (ch === "{") {
      flushBytes();
      stack.push({ ...current, destinationCandidate: true, starred: false });
      continue;
    }

    if (ch === "}") {
      flushBytes();
      if (stack.length > 1) stack.pop();
      fallbackCharsToSkip = 0;
      continue;
    }

    if (ch === "\\") {
      flushBytes();
      const next = source[++i];
      if (next === undefined) break;

      if (next === "\\" || next === "{" || next === "}") {
        pushText(next);
        current.destinationCandidate = false;
        continue;
      }

      if (next === "~") {
        pushText(" ");
        current.destinationCandidate = false;
        continue;
      }

      if (next === "-") {
        pushText("");
        current.destinationCandidate = false;
        continue;
      }

      if (next === "_") {
        pushText("-");
        current.destinationCandidate = false;
        continue;
      }

      if (next === "*") {
        current.starred = true;
        current.destinationCandidate = false;
        continue;
      }

      if (next === "'") {
        const hex = source.slice(i + 1, i + 3);
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          if (!current.skip) byteRun.push(Number.parseInt(hex, 16));
          i += 2;
        }
        current.destinationCandidate = false;
        continue;
      }

      if (!/[a-zA-Z]/.test(next)) {
        current.destinationCandidate = false;
        continue;
      }

      let word = next;
      while (i + 1 < source.length && /[a-zA-Z]/.test(source[i + 1])) {
        word += source[++i];
      }

      let negative = false;
      if (source[i + 1] === "-") {
        negative = true;
        i++;
      }
      let numberText = "";
      while (i + 1 < source.length && /\d/.test(source[i + 1])) {
        numberText += source[++i];
      }
      if (negative) numberText = `-${numberText}`;
      if (source[i + 1] === " ") i++;

      if (current.destinationCandidate) {
        if (current.starred || rtfDestinationControls.has(word)) {
          current.skip = true;
        }
        current.destinationCandidate = false;
      }

      if (word === "ansicpg" && numberText) {
        codePage = Number(numberText) || codePage;
      } else if (word === "uc" && numberText) {
        current.ucSkip = Math.max(0, Number(numberText) || 0);
      } else if (word === "u" && numberText) {
        const numericValue = Number(numberText);
        pushText(rtfUnicodeChar(numericValue));
        fallbackCharsToSkip = current.ucSkip || 0;
      } else if (Object.prototype.hasOwnProperty.call(rtfControlText, word)) {
        pushText(rtfControlText[word]);
      }
      continue;
    }

    current.destinationCandidate = false;
    if (!current.skip) byteRun.push(source.charCodeAt(i) & 0xff);
  }

  flushBytes();
  return cleanImportedText(output.join(""));
}

/**
 * @param {string} input
 * @returns {string}
 */
function stripMarkdownSyntax(input) {
  return String(input || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+[\.)]\s+/gm, "")
    .replace(/^\s{0,3}([-*_]\s?){3,}$/gm, "")
    .replace(/<[^>]+>/g, " ");
}

/**
 * @param {string} value
 * @returns {string}
 */
function extractHtmlTextFromString(value) {
  let html = String(value || "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");

  html = html.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n");
  html = html.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  html = html.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  html = html.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");
  html = html.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, "\n\n##### $1\n\n");
  html = html.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, "\n\n###### $1\n\n");

  html = html.replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  html = html.replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
  html = html.replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
  html = html.replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");

  html = html.replace(/<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  html = html.replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*\bsrc=["']([^"']*)["'][^>]*>/gi, "![alt]($1)");
  html = html.replace(/<img\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi, "![]($1)");

  html = html.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  html = html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  html = html.replace(/<br\b[^>]*>/gi, "\n");

  return cleanImportedText(stripTags(html).replace(/<[^>]+>/g, " "));
}

/**
 * @param {Buffer} buffer
 * @param {string} [encoding]
 * @returns {string}
 */
function extractHtmlText(buffer, encoding = "utf-8") {
  return extractHtmlTextFromString(decodeTextBuffer(buffer, encoding));
}

/**
 * @param {string} name
 * @param {string} mimeType
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
async function extractSimpleImportedTextNative(name, mimeType, buffer) {
  const ext = importExtension(name);
  if ([".txt", ".text", ".csv", ".tsv", ".json", ".js", ".ts", ".css", ".xml", ".log"].includes(ext)) {
    return decodePlainTextBuffer(buffer);
  }
  if (ext === ".rtf" || mimeType === "application/rtf" || mimeType === "text/rtf" || mimeType === "application/x-rtf") {
    return extractRtfText(buffer);
  }
  if ([".md", ".mdx", ".markdown", ".mdown", ".mkd", ".mkdn"].includes(ext)) {
    return cleanImportedText(stripMarkdownSyntax(decodePlainTextBuffer(buffer)));
  }
  if ([".htm", ".html", ".xhtml"].includes(ext)) {
    return extractHtmlText(buffer);
  }
  throw new Error(`Unsupported file type: ${ext || mimeType || "unknown"}`);
}

module.exports = {
  extractRtfText,
  stripMarkdownSyntax,
  extractHtmlTextFromString,
  extractHtmlText,
  extractSimpleImportedTextNative,
};
