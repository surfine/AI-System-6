"use strict";
// The site's Markdown subset, ported from aaronlau.me's build.mjs (the renderer
// that produces the published pages). A preview is only honest if it renders
// what the site will render, so this file keeps build.mjs's behaviour rather
// than a general Markdown library's: headings start at h3, CJK lines join
// without a space, images refuse to render without alt text, and links to
// external hosts gain rel="noopener".
//
// build.mjs owns the truth. When it changes, change this file with it and let
// the wensi-c2-preview-render contract (its cases were recorded from the site's
// own output) keep the two honest.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline spans. Slots keep already-rendered HTML away from the escaping pass. */
function inline(s) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => {
    if (!a.trim()) throw new Error(`图片缺少 alt：${u}`);
    return keep(`<img src="${esc(u)}" alt="${esc(a)}" loading="lazy">`);
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => keep(`<a href="${esc(u)}"${/^https?:/.test(u) ? ' rel="noopener"' : ""}>${inline(t)}</a>`));
  s = s.replace(/(^|[\s(（])(https?:\/\/[^\s<）)，。、；]+)/g, (_, p, u) => p + keep(`<a href="${esc(u)}" rel="noopener">${esc(u)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
}

const joinLines = (lines) => lines.map((l) => l.trim()).reduce((acc, l) => {
  if (!acc) return l;
  const cjk = /[\u3000-\u9fff\uff00-\uffef]$/.test(acc) && /^[\u3000-\u9fff\uff00-\uffef]/.test(l);
  return acc + (cjk ? "" : " ") + l;
}, "");

/**
 * @param {string} src markdown body (no front matter)
 * @param {number} h the heading level the page's h1 sits at; body headings start one deeper
 */
function markdown(src, h = 3) {
  const lines = String(src ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6}\s|```|>\s?|\s*[-*+]\s|\s*\d+\.\s|---+\s*$|\||<small>)/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^```(\w*)/))) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${m[1] ? ` class="lang-${esc(m[1])}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
    } else if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const lvl = Math.min(6, h + m[1].length - 1);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); i++;
    } else if (/^(---+|\*\*\*+)\s*$/.test(l)) {
      out.push("<hr>"); i++;
    } else if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(buf.join("\n"), h)}</blockquote>`);
    } else if (/^\s*[-*+]\s/.test(l) || /^\s*\d+\.\s/.test(l)) {
      const ordered = /^\s*\d+\.\s/.test(l);
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i])) {
        const buf = [lines[i++].replace(re, "")];
        while (i < lines.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !re.test(lines[i])) buf.push(lines[i++]);
        items.push(`<li>${inline(joinLines(buf))}</li>`);
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
    } else if ((m = l.match(/^<small>(.*?)<\/small>\s*$/))) {
      out.push(`<p class="note"><small>${inline(m[1])}</small></p>`); i++;
    } else if (/^\|/.test(l) && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${inline(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++]);
      out.push(`<p>${inline(joinLines(buf))}</p>`);
    }
  }
  return out.join("\n");
}

/** Body headings get stable ids, so a preview anchor matches the published one. */
function withHeadingIds(html, prefix) {
  let n = 0;
  return String(html).replace(/<h([3-5])>(.*?)<\/h\1>/gs, (_, lvl, inner) => {
    n++;
    return `<h${lvl} id="${prefix}-h-${n}">${inner}</h${lvl}>`;
  });
}

/** Every top-level block gets id="pN"; the RAG index and paragraph anchors share it. */
const RAG_VOID = new Set(["img", "br", "hr", "input", "wbr", "source"]);
const topBlocks = (html) => {
  const blocks = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let depth = 0, start = -1, tag = "", m;
  while ((m = re.exec(html))) {
    const name = m[2].toLowerCase();
    if (!m[1] && (RAG_VOID.has(name) || m[3])) { if (depth === 0) blocks.push({ tag: name, html: m[0], at: m.index }); continue; }
    if (!m[1]) { if (depth === 0) { start = m.index; tag = name; } depth++; continue; }
    depth = Math.max(0, depth - 1);
    if (depth === 0 && start >= 0) { blocks.push({ tag, html: html.slice(start, re.lastIndex), at: start }); start = -1; }
  }
  return blocks;
};

/** The block's number is its index among top-level blocks; an existing id wins. */
const anchorBlocks = (html) => {
  const src = String(html ?? "");
  const blocks = topBlocks(src);
  let out = src;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const at = blocks[i].at;
    const open = /^<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/.exec(out.slice(at));
    if (!open || /\sid\s*=/.test(open[2])) continue;
    const pos = at + 1 + open[1].length;
    out = out.slice(0, pos) + ` id="p${i}"` + out.slice(pos);
  }
  return out;
};

/** Plain text for reading time and the RAG chunker. */
const strip = (h) => String(h ?? "")
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
  .replace(/<br\s*\/?>/g, "\n")
  .replace(/<\/(p|li|h\d|pre|blockquote)>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const charCount = (text) => (text.match(/[\u3400-\u9fff]/g) || []).length + (text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+/g) || []).length;

module.exports = Object.freeze({ esc, inline, joinLines, markdown, withHeadingIds, anchorBlocks, topBlocks, strip, charCount });
