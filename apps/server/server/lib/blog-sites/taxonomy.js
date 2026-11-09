"use strict";
// 标签与分类的改名/合并 (P4).
//
// A rename is three writes that must agree, so it runs in one place:
//   1. the tag table gains the alias (old → new) and a declared redirect, so the
//      old tag page's address keeps answering after the articles stop using it;
//   2. every article that carried the old name carries the new one — the file
//      bytes around it stay untouched, so `git diff` is just that line;
//   3. `to` joins the kept set when the rename introduces a new name.
//
// Dirty-run first (plan), then execute on the writer's confirm — the same shape
// as publishing, for the same reason.

const fs = require("node:fs");
const path = require("node:path");

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function taxonomyError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The tag table's path for a site: `taxonomy.tags.source`, relative to the
 * site root unless it is already absolute.
 * @param {Record<string, any>} site
 */
function tagTablePath(site) {
  const source = String(site?.taxonomy?.tags?.source || "");
  if (!source) throw taxonomyError("taxonomy_not_configured", "这个站点没有登记标签表（taxonomy.tags.source）。", 409);
  return path.isAbsolute(source) ? source : path.join(String(site.channel?.root || ""), source);
}

/**
 * @param {Record<string, any>} site
 */
function readTagTable(site) {
  const file = tagTablePath(site);
  if (!fs.existsSync(file)) throw taxonomyError("taxonomy_missing", `标签表不存在：${file}`, 409);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw taxonomyError("taxonomy_unreadable", `标签表读不了（JSON 有错）：${String(/** @type {any} */ (error)?.message || error)}`, 409);
  }
  if (!Array.isArray(data.canon)) throw taxonomyError("taxonomy_unreadable", "标签表缺少 canon 数组。", 409);
  return { file, data };
}

/**
 * The `tags: [a, b]` line of a file, rewritten in place. Only that line is
 * touched: everything else in the file is copied through byte for byte.
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @returns {{ text: string, changed: boolean }}
 */
function rewriteTagsLine(text, from, to) {
  const match = text.match(/^(tags:[ \t]*\[)([^\]]*)(\].*)$/m);
  if (!match) return { text, changed: false };
  const items = match[2].split(",").map((item) => item.trim());
  let changed = false;
  const next = items.map((item) => {
    const bare = item.replace(/^["']|["']$/g, "");
    if (bare !== from) return item;
    changed = true;
    return item.includes('"') || item.includes("'") ? `"${to}"` : to;
  });
  if (!changed) return { text, changed: false };
  // A merge can leave the same tag twice on the line; a tag list that repeats
  // itself is not what the writer meant.
  const unique = next.filter((item, index) => next.findIndex((other) => other.replace(/^["']|["']$/g, "") === item.replace(/^["']|["']$/g, "")) === index);
  // Replace by position: everything above and below the tags line is copied
  // through byte for byte, so a rename never rewrites a manuscript.
  const line = `${match[1]}${unique.join(", ")}${match[3]}`;
  const start = /** @type {number} */ (match.index);
  return { text: text.slice(0, start) + line + text.slice(start + match[0].length), changed: true };
}

/**
 * Every article directory the site edits in place.
 * @param {Record<string, any>} site
 */
function articleDirs(site) {
  return Object.entries(site.contentTypes || {})
    .filter(([, type]) => type?.storage?.kind === "file-per" && type.storage.dir)
    .map(([id, type]) => ({ id, dir: String(type.storage.dir) }));
}

/**
 * Plan or apply a rename/merge.
 * @param {Record<string, any>} site
 * @param {{ from?: string, to?: string, dryRun?: boolean }} options
 */
function renameTag(site, { from, to, dryRun = true } = {}) {
  const oldName = String(from || "").trim();
  const newName = String(to || "").trim();
  if (!oldName || !newName) throw taxonomyError("bad_request", "改名要给出 from 和 to。", 400);
  if (oldName === newName) throw taxonomyError("bad_request", "新名字和旧名字一样，没有可改的。", 400);

  const { file, data } = readTagTable(site);
  const canon = data.canon.map(String);
  const isMerge = canon.includes(newName);
  const affected = [];
  const files = [];

  for (const { id, dir } of articleDirs(site)) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const full = path.join(dir, name);
      let text;
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const rewritten = rewriteTagsLine(text, oldName, newName);
      if (!rewritten.changed) continue;
      affected.push({ type: id, file: name, path: full });
      if (!dryRun) fs.writeFileSync(full, rewritten.text);
      files.push(full);
    }
  }

  const alias = { ...(data.alias || {}) };
  // A merge re-points any alias that led to the old name, so one lookup still
  // lands on the surviving tag.
  for (const [key, value] of Object.entries(alias)) if (value === oldName) alias[key] = newName;
  alias[oldName] = newName;
  const tagRedirects = { ...(data.tagRedirects || {}), [oldName]: newName };
  const nextCanon = isMerge ? canon : [...canon, newName];
  const next = { ...data, canon: nextCanon, alias, tagRedirects };

  if (!dryRun) fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);

  return {
    ok: true,
    dryRun,
    from: oldName,
    to: newName,
    merge: isMerge,
    table: file,
    tagAdded: !isMerge,
    articles: affected,
    counts: { articles: affected.length },
    note: affected.length
      ? `${affected.length} 篇稿件的标签会从「${oldName}」改成「${newName}」；旧标签网址补一条跳转。`
      : `没有稿件用到「${oldName}」；只登记别名与跳转。`,
  };
}

module.exports = Object.freeze({ renameTag, rewriteTagsLine, readTagTable, tagTablePath });
