// 文思泉涌 · 发布台账 (P7).
//
// A Micropub publish returns the article's live URL; to edit that article
// later the desk must know which URL belongs to which local file. The site
// files are not the place for it (a generic Hexo site does not use a `url`
// front-matter key, and writing one would show up in every diff), so the
// mapping lives under the agent's own home:
//
//   <agentHome>/publish-ledger/<siteId>.json
//   { "entries": { "posts:2026-11-09-a-post.md": { url, action, publishedAt } } }
//
// A corrupt file must not be treated as "no entry": guessing would create a
// second copy of a published article. It refuses publishing until it is fixed
// or deleted, and says so.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const paths = require("../../agent/paths.js");

const MAX_ENTRIES = 2000;
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * @param {string} code
 * @param {string} message
 * @param {string} [file]
 * @returns {{ ok: false, code: string, error: string, file: string }}
 */
function ledgerFailure(code, message, file = "") {
  return { ok: false, code, error: message, file };
}

/**
 * One ledger file per site. The site id is already closed-pattern in the
 * description validator; the filter here is the second belt, because this
 * function decides a file name.
 * @param {string} siteId
 */
function ledgerFile(siteId) {
  const safe = String(siteId || "").replace(/[^a-z0-9-]/g, "");
  if (!safe) throw Object.assign(new Error("发布台账需要一个站点 id。"), { code: "site_unknown" });
  return path.join(paths.publishLedgerDir(), `${safe}.json`);
}

/**
 * The ledger key: content type plus the article's site-relative path. The path
 * separator is normalized so a Windows-style path and a POSIX one name one
 * entry.
 * @param {string} typeId
 * @param {string} relPath
 */
function ledgerKey(typeId, relPath) {
  return `${String(typeId || "")}:${String(relPath || "").replace(/\\/g, "/")}`;
}

/**
 * @param {string} siteId
 * @returns {{ ok: true, entries: Record<string, any>, file: string }
 *   | { ok: false, code: string, error: string, file: string }}
 */
function readLedger(siteId) {
  const file = ledgerFile(siteId);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { ok: true, entries: {}, file };
  }
  if (stat.size > MAX_BYTES) {
    return ledgerFailure("ledger_unreadable", `发布台账太大（${stat.size} 字节）：${file}。修复或删除它再发布。`, file);
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("顶层不是对象");
    }
    const entries = data.entries && typeof data.entries === "object" && !Array.isArray(data.entries)
      ? data.entries
      : {};
    return { ok: true, entries, file };
  } catch (error) {
    return ledgerFailure(
      "ledger_unreadable",
      `发布台账读不了：${file}（${String(/** @type {any} */ (error)?.message || error)}）。`
      + "修复或删除它再发布，否则无法判断这篇是不是已经发过。",
      file
    );
  }
}

/**
 * The entry for one article, or null. A broken ledger stays a failure, never
 * an empty answer.
 * @param {string} siteId
 * @param {string} typeId
 * @param {string} relPath
 * @returns {{ ok: true, entry: Record<string, any> | null, file: string }
 *   | { ok: false, code: string, error: string }}
 */
function entryFor(siteId, typeId, relPath) {
  const read = readLedger(siteId);
  if (read.ok === false) return { ok: false, code: read.code, error: read.error };
  const entry = read.entries[ledgerKey(typeId, relPath)];
  return {
    ok: true,
    entry: entry && typeof entry === "object" ? entry : null,
    file: read.file,
  };
}

/**
 * Record one publish. The whole file is rewritten atomically (temp file in the
 * same directory, then rename); the entry cap drops the oldest by
 * `publishedAt`, so a site published for years does not grow without bound.
 * @param {string} siteId
 * @param {string} typeId
 * @param {string} relPath
 * @param {{ url: string, action: "create" | "update", publishedAt?: string }} result
 * @returns {{ ok: true, file: string, key: string, entry: Record<string, any> }
 *   | { ok: false, code: string, error: string }}
 */
function recordPublish(siteId, typeId, relPath, result) {
  const read = readLedger(siteId);
  if (read.ok === false) return { ok: false, code: read.code, error: read.error };
  const key = ledgerKey(typeId, relPath);
  const entry = {
    url: String(result?.url || ""),
    action: result?.action === "update" ? "update" : "create",
    publishedAt: String(result?.publishedAt || new Date().toISOString()),
  };
  /** @type {Record<string, any>} */
  const entries = { ...read.entries, [key]: entry };
  const keys = Object.keys(entries);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => String(entries[a]?.publishedAt || "").localeCompare(String(entries[b]?.publishedAt || "")))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((old) => { delete entries[old]; });
  }
  const file = read.file;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, `${JSON.stringify({ entries }, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, file);
  } catch (error) {
    return ledgerFailure(
      "ledger_unwritable",
      `发布台账写不了：${file}（${String(/** @type {any} */ (error)?.message || error)}）。`
    );
  }
  return { ok: true, file, key, entry };
}

module.exports = {
  MAX_ENTRIES,
  entryFor,
  ledgerFile,
  ledgerKey,
  readLedger,
  recordPublish,
};
