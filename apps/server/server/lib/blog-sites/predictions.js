"use strict";
// 预言账本 (P5): every prediction a post carries, and the one edit the writer
// makes on it — the verdict.
//
// Predictions live in the front-matter as a block list:
//
//   predictions:
//     - made: 2026-09-20
//       claim: macOS 28 是最后一个支持 M1 芯片 Mac 的版本
//       status: 待定
//
// The desk's general front-matter parser cannot round-trip that shape, so it
// marks `predictions` opaque and the adapter refuses to overwrite it. That is
// right — and it means the ledger needs its own reader, and its writer must be
// a line edit: the verdict changes one `status:` line and nothing else.
//
// The site builder accepts hit/miss/pending and their Chinese names; the ledger
// keeps whichever spelling the file already uses.
//
// Contract: tests/features/wensi-d-predictions.test.mjs

const fs = require("node:fs");
const path = require("node:path");

const STATUS = Object.freeze({
  hit: { en: "hit", zh: "应验" },
  miss: { en: "miss", zh: "落空" },
  pending: { en: "pending", zh: "待定" },
});

const STATUS_ALIASES = new Map([
  ["hit", "hit"], ["应验", "hit"],
  ["miss", "miss"], ["落空", "miss"],
  ["pending", "pending"], ["待定", "pending"], ["待查", "pending"],
]);

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function predictionError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * @param {unknown} value
 * @returns {"hit" | "miss" | "pending" | ""}
 */
function canonicalStatus(value) {
  return /** @type {any} */ (STATUS_ALIASES.get(String(value ?? "").trim().toLowerCase())) || "";
}

/**
 * The front-matter block's line range: the opening `---` line and the closing
 * one. A file without a block has none.
 * @param {string[]} lines
 * @returns {{ start: number, end: number } | null}
 */
function blockRange(lines) {
  if (!lines.length || lines[0].trim() !== "---") return null;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") return { start: 0, end: index };
  }
  return null;
}

/**
 * @param {string} raw
 */
function unquote(raw) {
  const text = String(raw || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Read the block-list under `predictions:`. Each item remembers its line span
 * and the line that carries its status, because the verdict is a line edit.
 * @param {string} text
 */
function parsePredictions(text) {
  const lines = String(text || "").split("\n");
  const block = blockRange(lines);
  if (!block) return { items: [], lines };
  let start = -1;
  let itemIndent = -1;
  for (let index = 1; index < block.end; index += 1) {
    if (/^predictions\s*:\s*$/.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start < 0) return { items: [], lines };

  /** @type {{ lines: number[], keys: Map<string, { line: number, value: string, indent: string }> }[]} */
  const items = [];
  let current = null;
  for (let index = start + 1; index < block.end; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (current) current.lines.push(index);
      continue;
    }
    const dash = line.match(/^(\s*)-\s*(.*)$/);
    if (dash && (itemIndent < 0 || dash[1].length === itemIndent)) {
      itemIndent = dash[1].length;
      current = { lines: [index], keys: new Map() };
      items.push(current);
      const inline = dash[2].match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
      if (inline) current.keys.set(inline[1], { line: index, value: inline[2], indent: `${dash[1]}  ` });
      continue;
    }
    if (!current) continue;
    // A key line inside the item: `key: value`, deeper than the dash.
    const entry = line.match(/^(\s+)([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (entry && entry[1].length > itemIndent) {
      current.keys.set(entry[2], { line: index, value: entry[3], indent: entry[1] });
      current.lines.push(index);
      continue;
    }
    // Anything shallower ends the list.
    if (line.trim() && (line.match(/^\s*/) || [""])[0].length <= itemIndent) break;
    current.lines.push(index);
  }

  return {
    items: items.map((item, index) => {
      const read = (key) => (item.keys.get(key) ? unquote(item.keys.get(key).value) : "");
      const rawStatus = read("status");
      return {
        index,
        line: item.lines[0],
        lines: item.lines,
        statusLine: item.keys.get("status")?.line ?? -1,
        id: read("id"),
        made: read("made") || read("said_on"),
        claim: read("claim"),
        rawStatus,
        status: canonicalStatus(rawStatus),
        due: read("due"),
        confidence: read("confidence"),
      };
    }),
    lines,
  };
}

/**
 * Every article directory the ledger reads: the site's `file-per` types.
 * @param {Record<string, any>} site
 */
function articleDirs(site) {
  return Object.entries(site.contentTypes || {})
    .filter(([, type]) => type?.storage?.kind === "file-per" && type.storage.dir)
    .map(([id, type]) => ({ type: id, dir: String(type.storage.dir) }));
}

/**
 * The ledger: every prediction the site's articles carry, newest first, plus
 * the counts the writer watches. Read-only.
 * @param {Record<string, any>} site
 */
function ledger(site) {
  const entries = [];
  const errors = [];
  for (const { type, dir } of articleDirs(site)) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      let text;
      try {
        text = fs.readFileSync(path.join(dir, name), "utf8");
      } catch {
        continue;
      }
      if (!/^predictions\s*:/m.test(text)) continue;
      const parsed = parsePredictions(text);
      if (!parsed.items.length) {
        errors.push({ file: name, reason: "predictions_block_unreadable" });
        continue;
      }
      const title = (text.match(/^title\s*:\s*(.+)$/m) || [])[1] || "";
      const date = (text.match(/^date\s*:\s*(.+)$/m) || [])[1] || "";
      for (const item of parsed.items) {
        if (!item.claim) {
          errors.push({ file: name, reason: "claim_missing", index: item.index });
          continue;
        }
        if (!item.status) {
          errors.push({ file: name, reason: "status_unrecognised", index: item.index, rawStatus: item.rawStatus });
          continue;
        }
        entries.push({
          type,
          file: name,
          date: unquote(date),
          title: unquote(title),
          index: item.index,
          id: item.id || `${unquote(date).slice(2).replace(/-/g, "")}${item.index ? `-${item.index + 1}` : ""}`,
          made: item.made,
          due: item.due,
          claim: item.claim,
          confidence: item.confidence,
          status: item.status,
          rawStatus: item.rawStatus,
        });
      }
    }
  }
  // Oldest first among the undecided: those have waited longest for a verdict.
  entries.sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : b.status === "pending" ? 1 : 0;
    return String(a.made).localeCompare(String(b.made)) || a.file.localeCompare(b.file) || a.index - b.index;
  });
  const summary = { total: entries.length, pending: 0, hit: 0, miss: 0 };
  for (const entry of entries) summary[entry.status] += 1;
  return { ok: true, entries, errors, summary, note: summary.total
    ? `账本上有 ${summary.total} 条：待定 ${summary.pending}、应验 ${summary.hit}、落空 ${summary.miss}。`
    : "还没有任何预测。" };
}

/**
 * Find one article by file name inside the site's article directories. The name
 * is a single path segment; the directory comes from the description, never
 * from the caller.
 * @param {Record<string, any>} site
 * @param {string} file
 */
function resolveArticle(site, file) {
  const name = String(file || "");
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    throw predictionError("bad_file", "要给出稿件的文件名（不带路径）。", 400);
  }
  for (const { type, dir } of articleDirs(site)) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return { type, dir, full, name };
  }
  throw predictionError("article_missing", `找不到这篇稿件：${name}`, 404);
}

/**
 * Settle one prediction. One line changes: its `status:` value, written in the
 * spelling the file already uses. Everything else is copied through byte for
 * byte — a verdict is not a reason to rewrite a manuscript.
 *
 * @param {Record<string, any>} site
 * @param {{ file?: string, index?: number, id?: string, status?: string }} options
 */
function settle(site, { file = "", index = null, id = "", status = "" } = {}) {
  const article = resolveArticle(site, file);
  const text = fs.readFileSync(article.full, "utf8");
  const parsed = parsePredictions(text);
  if (!parsed.items.length) throw predictionError("predictions_missing", "这篇稿件里没有可读的 predictions 块。", 409);
  const wanted = canonicalStatus(status);
  if (!wanted) {
    throw predictionError("bad_status", "判定只能是 应验 / 落空 / 待定（或 hit / miss / pending）。", 400);
  }
  const target = id
    ? parsed.items.find((item) => item.id === String(id))
    : parsed.items[Number.isInteger(index) ? Number(index) : 0];
  if (!target) throw predictionError("prediction_missing", `这篇稿件里没有${id ? ` id 为「${id}」的` : "这一条"}预测。`, 404);
  if (target.statusLine < 0) {
    throw predictionError("status_line_missing", "这一条没有 status 行，先在稿件里补上再判定。", 409);
  }
  const nextStatus = /[\u4e00-\u9fff]/.test(target.rawStatus) ? STATUS[wanted].zh : STATUS[wanted].en;
  const line = parsed.lines[target.statusLine];
  const entry = line.match(/^(\s*status\s*:\s*)(.*)$/);
  if (!entry) throw predictionError("status_line_missing", "这一条的 status 行读不出来。", 409);
  const quoted = /^["']/.test(entry[2].trim()) ? `"${nextStatus}"` : nextStatus;
  const rewritten = `${entry[1]}${quoted}`;
  const lines = [...parsed.lines];
  lines[target.statusLine] = rewritten;
  const next = lines.join("\n");
  if (next !== text) fs.writeFileSync(article.full, next);
  return {
    ok: true,
    file: article.name,
    index: target.index,
    id: target.id,
    claim: target.claim,
    from: target.rawStatus,
    to: nextStatus,
    changed: next !== text,
    note: `「${target.claim.slice(0, 24)}${target.claim.length > 24 ? "…" : ""}」记为 ${nextStatus}。只改了 status 这一行。`,
  };
}

module.exports = Object.freeze({
  ledger,
  parsePredictions,
  settle,
  canonicalStatus,
  STATUS,
});
