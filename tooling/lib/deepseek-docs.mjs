// DeepSeek publishes its API manual as a Docusaurus site. This module is the
// fetch-free half of tooling/deepseek-docs-watch.mjs: page extraction, the
// snapshot shape, and the comparison that says whether the manual moved. It is
// split out so a feature test can exercise all of it without the network.
//
// The Chinese tree is the one captured as text, because that is the manual the
// product was audited against. The English tree is captured as hashes so an
// English-first edit still shows up in the weekly report.

import { createHash } from "node:crypto";

export const DOCS_ORIGIN = "https://api-docs.deepseek.com";
export const DOCS_ZH_SITEMAP = `${DOCS_ORIGIN}/zh-cn/sitemap.xml`;
export const DOCS_EN_SITEMAP = `${DOCS_ORIGIN}/sitemap.xml`;
export const SNAPSHOT_SCHEMA = "ai-system-6-deepseek-docs-snapshot-v1";
export const SNAPSHOT_DIR = "internal/references/deepseek-docs";

const ZH_PREFIX = "/zh-cn/";

/**
 * Every absolute URL in a sitemap, in a stable order.
 *
 * @param {string} xml
 * @returns {string[]}
 */
export function sitemapUrls(xml) {
  const matches = String(xml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

/**
 * @param {string[]} urls
 * @param {"zh" | "en"} locale
 * @returns {string[]}
 */
export function urlsForLocale(urls, locale) {
  return (Array.isArray(urls) ? urls : []).filter((url) => {
    const parsed = safePath(url);
    if (!parsed) return false;
    return locale === "zh" ? parsed.startsWith(ZH_PREFIX) : !parsed.startsWith(ZH_PREFIX);
  });
}

/**
 * A filesystem-safe name for one page, derived only from its path so the same
 * page keeps the same name across captures.
 *
 * @param {string} url
 * @returns {string}
 */
export function slugForUrl(url) {
  const path = safePath(url);
  if (!path) return "";
  const trimmed = (path.startsWith(ZH_PREFIX) ? path.slice(ZH_PREFIX.length) : path.replace(/^\//, ""))
    .replace(/\/+$/, "");
  const slug = trimmed.replace(/\//g, "__") || "index";
  return slug.replace(/[^A-Za-z0-9_.-]/g, "-");
}

/**
 * @param {string} url
 * @returns {string}
 */
function safePath(url) {
  try {
    return new URL(String(url || "")).pathname;
  } catch {
    return "";
  }
}

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  times: "×",
  rarr: "→",
  larr: "←",
  copy: "©",
  reg: "®",
  trade: "™",
});

/**
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return String(text || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/**
 * The readable text of a Docusaurus article, normalized so the same page
 * always produces the same bytes.
 *
 * @param {string} html
 * @returns {string}
 */
export function extractArticleText(html) {
  const source = String(html || "");
  const article = source.match(/<article[\s\S]*?<\/article>/);
  const body = article ? article[0] : source;
  const stripped = body
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(?:p|div|li|h1|h2|h3|h4|h5|tr|pre|blockquote)>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(stripped)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
export function sha256Hex(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

/**
 * @param {Array<{ slug: string, sha256: string }>} previous
 * @param {Array<{ slug: string, sha256: string }>} current
 * @returns {{ added: string[], removed: string[], changed: string[] }}
 */
export function compareSnapshots(previous, current) {
  const before = new Map((Array.isArray(previous) ? previous : []).map((page) => [page.slug, page.sha256]));
  const after = new Map((Array.isArray(current) ? current : []).map((page) => [page.slug, page.sha256]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [slug, hash] of after) {
    if (!before.has(slug)) added.push(slug);
    else if (before.get(slug) !== hash) changed.push(slug);
  }
  for (const slug of before.keys()) {
    if (!after.has(slug)) removed.push(slug);
  }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

/**
 * Which lines are new and which are gone. This is a hint, not a patch: it
 * exists so the weekly reader knows which part of a long page to open first,
 * and it never claims an edit that is not there.
 *
 * @param {string} before
 * @param {string} after
 * @param {{ limit?: number }} [options]
 * @returns {{ removed: string[], added: string[] }}
 */
export function diffHints(before, after, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 20;
  const beforeLines = String(before || "").split("\n");
  const afterLines = String(after || "").split("\n");
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const removed = [];
  const added = [];
  beforeLines.forEach((line, index) => {
    if (line.trim() && !afterSet.has(line) && removed.length < limit) removed.push(`${index + 1}: ${line}`);
  });
  afterLines.forEach((line, index) => {
    if (line.trim() && !beforeSet.has(line) && added.length < limit) added.push(`${index + 1}: ${line}`);
  });
  return { removed, added };
}

/**
 * The snapshot document that ships with the repository.
 *
 * @param {{
 *   captured: string,
 *   sitemaps: Record<string, { url: string, sha256: string }>,
 *   pages: Array<{ slug: string, url: string, sha256: string, bytes: number }>,
 *   english: Array<{ url: string, sha256: string }>,
 * }} input
 * @returns {Record<string, unknown>}
 */
export function buildSnapshotIndex(input) {
  const pages = [...(input.pages || [])].sort((a, b) => a.slug.localeCompare(b.slug));
  const english = [...(input.english || [])].sort((a, b) => a.url.localeCompare(b.url));
  return {
    schema: SNAPSHOT_SCHEMA,
    origin: DOCS_ORIGIN,
    captured: input.captured,
    sitemaps: input.sitemaps,
    pageCount: pages.length,
    englishCount: english.length,
    pages,
    english,
  };
}

/**
 * @param {any} index
 * @returns {Array<{ slug: string, sha256: string }>}
 */
export function snapshotPages(index) {
  return Array.isArray(index?.pages) ? index.pages : [];
}

/**
 * Compare two index documents, so a weekly run speaks about the manual rather
 * than about files.
 *
 * @param {any} previous
 * @param {any} current
 * @returns {{ added: string[], removed: string[], changed: string[], englishAdded: string[], englishRemoved: string[], englishChanged: string[] }}
 */
export function compareIndexes(previous, current) {
  const pageDrift = compareSnapshots(snapshotPages(previous), snapshotPages(current));
  const beforeEnglish = new Map(
    (Array.isArray(previous?.english) ? previous.english : []).map((entry) => [entry.url, entry.sha256])
  );
  const afterEnglish = new Map(
    (Array.isArray(current?.english) ? current.english : []).map((entry) => [entry.url, entry.sha256])
  );
  const englishAdded = [];
  const englishRemoved = [];
  const englishChanged = [];
  for (const [url, hash] of afterEnglish) {
    if (!beforeEnglish.has(url)) englishAdded.push(url);
    else if (beforeEnglish.get(url) !== hash) englishChanged.push(url);
  }
  for (const url of beforeEnglish.keys()) {
    if (!afterEnglish.has(url)) englishRemoved.push(url);
  }
  return {
    ...pageDrift,
    englishAdded: englishAdded.sort(),
    englishRemoved: englishRemoved.sort(),
    englishChanged: englishChanged.sort(),
  };
}

/**
 * @param {ReturnType<typeof compareIndexes>} drift
 * @returns {boolean}
 */
export function hasDrift(drift) {
  if (!drift) return false;
  return ["added", "removed", "changed", "englishAdded", "englishRemoved", "englishChanged"]
    .some((key) => Array.isArray(drift[key]) && drift[key].length > 0);
}
