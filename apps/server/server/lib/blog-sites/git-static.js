// The git-static site adapter (git 静态站适配器, lane C P1).
//
// Everything here works on directories named by a site description, never on
// a caller-typed path: the route resolves the content type first, checks the
// folder grant, and only then calls in. Paths that arrive from the desk are
// article-relative names; resolveArticleLocation turns one into an absolute
// path that must land inside the type's own directory (or the draft
// directory), with symlinks resolved the way agent/folders.js treats grants —
// realpath the file and its root, then require containment of the real paths
// (real/ino thinking, spelled out with realOrSelf + isInside).
//
// git runs as fixed argv arrays, never a shell string. A directory outside
// any repository (aaronlau's daily raw drafts under chat_history_new) is not
// an error: lastCommit comes back null and gitDirty false.

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const frontMatter = require("./front-matter.js");
const paths = require("../../agent/paths.js");

const GIT_TIMEOUT_MS = 15_000;
const GIT_LOG_LIMIT = 10;
// Per-file `git log -1` runs in a small pool so listing 790 notes does not
// take 790 sequential process starts.
const GIT_CONCURRENCY = 8;

const MAX_ARTICLE_BYTES = 4 * 1024 * 1024;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function adapterError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The content type definition, or a typed 404.
 * @param {Record<string, any>} site
 * @param {string} typeId
 */
function contentType(site, typeId) {
  const type = site?.contentTypes?.[String(typeId || "")];
  if (!type) {
    throw adapterError("unknown_content_type", `站点没有内容类型 ${String(typeId || "")}。`, 404);
  }
  return type;
}

/** The absolute root an article path is relative to. @param {Record<string, any>} type */
function storageDir(type) {
  return String(type.storage.dir);
}

/** The draft root when the draft rule is a directory, else null. @param {Record<string, any>} type */
function draftDir(type) {
  return type.draftRule?.kind === "draft-dir" ? String(type.draftRule.dir) : null;
}

/**
 * Every directory a read or write of this type touches: the storage root and,
 * for a draft-dir rule, the draft root. The route asks a folder grant to
 * cover each of them.
 * @param {Record<string, any>} type
 * @returns {string[]}
 */
function contentRoots(type) {
  const roots = [storageDir(type)];
  const drafts = draftDir(type);
  if (drafts) roots.push(drafts);
  return roots;
}

/**
 * Resolve an article-relative path onto its absolute location.
 *
 * "drafts/<name>" names a file in the type's draft directory (appscope's
 * _drafts); anything else is relative to the storage root. `..` segments,
 * absolute forms and symlinks that lead outside the root are refused — the
 * real path must stay inside the real root even when the directory itself is
 * reached through a symlink.
 * @param {Record<string, any>} type
 * @param {string} relPath
 * @returns {{ dir: string, rel: string, resolved: string, isDraft: boolean }}
 */
function resolveArticleLocation(type, relPath) {
  const clean = String(relPath || "").replace(/^\/+/, "");
  if (!clean || clean.includes("\0") || clean.split("/").includes("..")) {
    throw adapterError("bad_article_path", "文章路径必须是内容目录内的相对路径。");
  }
  const isDraft = clean.startsWith("drafts/");
  const dir = isDraft ? draftDir(type) : storageDir(type);
  if (isDraft && !dir) {
    throw adapterError("bad_article_path", "该内容类型没有草稿目录。");
  }
  const rel = isDraft ? clean.slice("drafts/".length) : clean;
  if (!rel) throw adapterError("bad_article_path", "文章路径不能为空。");
  const base = path.resolve(dir);
  const rootReal = paths.realOrSelf(dir);
  const resolved = path.resolve(dir, rel);
  if (!resolved.startsWith(base.endsWith(path.sep) ? base : base + path.sep)) {
    throw adapterError("path_escape", "文章路径逃出了内容目录。", 403);
  }
  // The file may not exist yet (a new article): its parent must still be a
  // real directory inside the root, so a symlinked parent cannot smuggle the
  // write somewhere else.
  const existing = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
  const real = paths.realOrSelf(existing);
  if (!paths.isInside(real, rootReal)) {
    throw adapterError("path_escape", "文章路径经符号链接逃出了内容目录。", 403);
  }
  return { dir, rel, resolved, isDraft };
}

/**
 * Status inference. front-matter keys hold a draft back (aaronlau's
 * `held` / `review`, matching build.mjs's `data.held || data.review` gate,
 * with `review: approved` counting as passed); a draft-dir rule marks whole
 * files (appscope's _drafts). The contract's third status, "unpublished", has
 * no producer in either built-in site yet.
 * @param {Record<string, any>} type
 * @param {Record<string, unknown>} fields
 * @param {boolean} isDraft
 */
function deriveStatus(type, fields, isDraft) {
  const rule = type.draftRule;
  if (rule?.kind === "draft-dir" && isDraft) return "draft";
  if (rule?.kind === "front-matter") {
    for (const key of rule.keys || []) {
      const value = fields[key];
      if (value === undefined || value === false || value === "" || value === null) continue;
      if (rule.approvedValue !== undefined && value === rule.approvedValue) continue;
      return "draft";
    }
  }
  return "published";
}

/**
 * One fixed-argv git invocation. Resolves null on a clean failure (not a
 * repository, a file git has never seen) — callers decide what that means.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<string | null>}
 */
function gitCapture(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn("git", ["-C", cwd, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), GIT_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.length > 1024 * 1024) child.kill("SIGKILL");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? out : null);
    });
  });
}

/**
 * Is this directory inside a git work tree? Cached per adapter call site by
 * the caller; a non-repository returns false quietly.
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
async function isGitWorkTree(dir) {
  const out = await gitCapture(dir, ["rev-parse", "--is-inside-work-tree"]);
  return String(out || "").trim() === "true";
}

/** @param {string} hash @param {string} date @param {string} subject */
function commitOf(hash, date, subject) {
  return { hash, date, subject };
}

/**
 * The most recent commits that touched one file, newest first. Fixed argv,
 * %x1f-separated so a subject containing any other byte stays parseable.
 * @param {string} dir the directory the relative path is relative to
 * @param {string} rel
 * @returns {Promise<{ hash: string, date: string, subject: string }[]>}
 */
async function gitFileLog(dir, rel) {
  const out = await gitCapture(dir, [
    "log",
    `-n${GIT_LOG_LIMIT}`,
    "--date=iso-strict",
    "--format=%H%x1f%aI%x1f%s",
    "--",
    rel.split(path.sep).join("/"),
  ]);
  if (out === null) return [];
  return out.split("\n").filter(Boolean).map((line) => {
    const [hash, date, subject] = line.split("\x1f");
    return commitOf(hash || "", date || "", subject || "");
  }).filter((commit) => commit.hash);
}

/**
 * The repository-relative paths with uncommitted changes under one directory.
 * @param {string} dir
 * @param {string} absDir the directory to limit the status query to
 * @returns {Promise<Set<string>>}
 */
async function gitDirtyPaths(dir, absDir) {
  const out = await gitCapture(dir, [
    "-c", "core.quotepath=off",
    "status", "--porcelain", "--",
    absDir,
  ]);
  const dirty = new Set();
  if (out === null) return dirty;
  const top = await gitCapture(dir, ["rev-parse", "--show-toplevel"]);
  const root = paths.realOrSelf(String(top || dir).trim());
  for (const line of out.split("\n")) {
    if (line.length < 4) continue;
    const file = line.slice(3).trim().replace(/^"|"$/g, "");
    if (!file) continue;
    // git answers repository-relative paths against the real (symlink-resolved)
    // root; the caller's paths may come through /var → /private/var. Compare
    // real paths on both sides.
    dirty.add(paths.realOrSelf(path.resolve(root, file)));
  }
  return dirty;
}

/** Map a list of jobs over a small promise pool. */
async function pooled(jobs, worker) {
  const results = new Array(jobs.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(GIT_CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      results[index] = await worker(jobs[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * URL for one article. {year} {month} {day} come from the date, {slug} from
 * the slug, {compactDate} is the date without dashes (aaronlau's note
 * anchors), {category} is the first cats entry (appscope's permalink).
 * The daily multi/single choice mirrors build.mjs: within one date, the first
 * article keeps the bare day URL. build.mjs orders same-day posts by when
 * they entered the site repo, which the raw directory cannot know; here the
 * order falls back to filename.
 * @param {Record<string, any>} type
 * @param {Record<string, unknown>} fields
 * @param {{ rel: string, isDraft: boolean, status?: string, dayIndex: number }} where
 */
function articleUrl(type, fields, where) {
  if (where.isDraft || where.status === "draft") return "";
  const date = String(fields.date || "");
  const parts = { y: date.slice(0, 4), m: date.slice(5, 7), d: date.slice(8, 10) };
  const slug = articleSlug(fields, where.rel);
  const category = Array.isArray(fields.cats) && fields.cats.length ? String(fields.cats[0]) : "";
  const fill = (template) => String(template || "")
    .replace(/\{year\}/g, parts.y)
    .replace(/\{month\}/g, parts.m)
    .replace(/\{day\}/g, parts.d)
    .replace(/\{compactDate\}/g, `${parts.y}${parts.m}${parts.d}`)
    .replace(/\{slug\}/g, slug)
    .replace(/\{category\}/g, category);
  const url = type.url || {};
  const multi = where.dayIndex > 0 && url.multi;
  const template = multi ? url.multi : (url.single || url.multi || "");
  return fill(template);
}

/** @param {Record<string, unknown>} fields */
function articleTitle(fields) {
  const value = fields.title;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * The slug: the front-matter value when the article carries one, else the
 * filename with its date prefix stripped (aaronlau's YYYY-MM-DD-slug.md) or
 * the bare stem (appscope's <slug>.md).
 * @param {Record<string, unknown>} fields
 * @param {string} rel
 */
function articleSlug(fields, rel) {
  if (typeof fields.slug === "string" && fields.slug) return fields.slug;
  if (typeof fields.slug === "number") return String(fields.slug);
  const stem = path.basename(rel).replace(/\.md$/i, "");
  const dated = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(stem);
  return dated ? dated[1] : stem;
}

/**
 * List one content type: every article file, parsed, statused, with its git
 * facts. A missing directory lists empty (aaronlau's pages/ does not exist
 * until P4); a json-collection type is a P2 surface and is refused loudly.
 * @param {Record<string, any>} site
 * @param {string} typeId
 */
async function listArticles(site, typeId) {
  const type = contentType(site, typeId);
  if (type.storage.kind !== "file-per") {
    throw adapterError(
      "storage_unsupported",
      `「${type.label}」是集合存储（${type.storage.file}），P2 才实现；本版不提供列表。`,
      501
    );
  }
  const dir = storageDir(type);
  const drafts = draftDir(type);
  /** @type {{ rel: string, isDraft: boolean }[]} */
  const files = [];
  const collect = (root, isDraft) => {
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (!name.endsWith(".md")) continue;
      const full = path.join(root, name);
      try {
        if (!fs.statSync(full).isFile()) continue;
      } catch {
        continue;
      }
      files.push({ rel: path.relative(root, full), isDraft });
    }
  };
  collect(dir, false);
  if (drafts) collect(drafts, true);
  if (files.length === 0) return [];

  const gitReady = await isGitWorkTree(dir);
  const dirtyPaths = gitReady ? await gitDirtyPaths(dir, path.resolve(dir)) : new Set();

  // Parse first (cheap, needed for the day grouping), then git in a pool.
  const parsed = await pooled(files, async (file) => {
    const resolved = path.resolve(file.isDraft ? draftDir(type) : dir, file.rel);
    let text = "";
    try {
      text = fs.readFileSync(resolved, "utf8");
    } catch {
      return null;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_ARTICLE_BYTES) return null;
    const { fields } = frontMatter.parseFrontMatter(text);
    return { file, fields };
  });

  const perDay = new Map();
  const withIndex = parsed.map((one) => {
    if (!one) return null;
    const status = deriveStatus(type, one.fields, one.file.isDraft);
    const date = String(one.fields.date || "");
    let dayIndex = 0;
    // Only published articles count toward the same-day URL split; a draft
    // that shares a date must not push the live article onto the slug URL.
    if (date && status === "published") {
      dayIndex = perDay.get(date) || 0;
      perDay.set(date, dayIndex + 1);
    }
    return { ...one, status, dayIndex };
  });

  const articles = await pooled(withIndex.filter(Boolean), async (one) => {
    const { file, fields, status, dayIndex } = one;
    const resolved = paths.realOrSelf(path.resolve(file.isDraft ? draftDir(type) : dir, file.rel));
    const log = gitReady && !file.isDraft ? await gitFileLog(dir, file.rel) : [];
    return {
      path: file.isDraft ? `drafts/${file.rel.split(path.sep).join("/")}` : file.rel.split(path.sep).join("/"),
      filename: path.basename(file.rel),
      status,
      date: String(fields.date || ""),
      title: articleTitle(fields),
      slug: articleSlug(fields, file.rel),
      category: (Array.isArray(fields.cats) && fields.cats[0] && String(fields.cats[0]))
        || (Array.isArray(fields.categories) && fields.categories[0] && String(fields.categories[0]))
        || "",
      url: articleUrl(type, fields, { rel: file.rel, isDraft: file.isDraft, status, dayIndex }),
      updated: fields.updated === undefined ? "" : String(fields.updated),
      gitDirty: dirtyPaths.has(resolved),
      lastCommit: log[0] || null,
    };
  });
  // Newest first, like the site itself; filename breaks ties.
  articles.sort((a, b) => (a.date === b.date ? (a.path < b.path ? 1 : -1) : a.date < b.date ? 1 : -1));
  return articles;
}

/**
 * Read one article: front-matter, body, url and the recent git log. The
 * front-matter comes back as plain JSON-able values; an opaque value
 * (aaronlau's predictions flow mappings) surfaces as its raw text and is
 * protected on write.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 */
async function readArticle(site, typeId, relPath) {
  const type = contentType(site, typeId);
  if (type.storage.kind !== "file-per") {
    throw adapterError("storage_unsupported", "集合类型没有稿件列表：它在「影像」视图里按帧读写（/photos）。", 501);
  }
  const where = resolveArticleLocation(type, relPath);
  let text;
  try {
    text = fs.readFileSync(where.resolved, "utf8");
  } catch {
    throw adapterError("article_missing", `文章不存在：${String(relPath)}`, 404);
  }
  if (Buffer.byteLength(text, "utf8") > MAX_ARTICLE_BYTES) {
    throw adapterError("article_too_large", "文章超过 4 MiB，不在本适配器的读写范围内。", 413);
  }
  const parsed = frontMatter.parseFrontMatter(text);
  const fields = parsed.fields;
  const status = deriveStatus(type, fields, where.isDraft);
  const gitReady = await isGitWorkTree(where.dir);
  const log = gitReady ? await gitFileLog(where.dir, where.rel) : [];
  const dayIndex = 0;
  return {
    type: String(typeId),
    path: where.isDraft ? `drafts/${where.rel.split(path.sep).join("/")}` : where.rel.split(path.sep).join("/"),
    filename: path.basename(where.rel),
    status,
    frontMatter: fields,
    opaqueKeys: parsed.opaqueKeys,
    body: parsed.body,
    url: articleUrl(type, fields, { rel: where.rel, isDraft: where.isDraft, status, dayIndex }),
    git: {
      lastCommit: log[0] || null,
      log,
    },
  };
}

/**
 * Write one article (create or update). The front-matter block is composed by
 * mergeFrontMatter: untouched fields keep their exact source lines, readonly
 * fields and opaque values are restored from the file on disk, and the body
 * follows. The file is replaced atomically (temp file in the same directory,
 * then rename). Only `frontMatter` and `body` are taken from the client —
 * never a directory.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 * @param {{ frontMatter?: Record<string, unknown>, body?: string }} article
 */
async function writeArticle(site, typeId, relPath, article) {
  const type = contentType(site, typeId);
  if (type.storage.kind !== "file-per") {
    throw adapterError("storage_unsupported", "集合类型没有稿件列表：它在「影像」视图里按帧读写（/photos）。", 501);
  }
  const where = resolveArticleLocation(type, relPath);
  const updates = article?.frontMatter && typeof article.frontMatter === "object"
    ? article.frontMatter
    : {};
  const body = typeof article?.body === "string" ? article.body : "";
  const warnings = [];

  let existing = frontMatter.parseFrontMatter("");
  if (fs.existsSync(where.resolved)) {
    const text = fs.readFileSync(where.resolved, "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_ARTICLE_BYTES) {
      throw adapterError("article_too_large", "文章超过 4 MiB，不在本适配器的读写范围内。", 413);
    }
    existing = frontMatter.parseFrontMatter(text);
  } else {
    fs.mkdirSync(path.dirname(where.resolved), { recursive: true });
  }

  const readonlyKeys = (type.fields || [])
    .filter((field) => field.type === "readonly")
    .map((field) => String(field.key));
  const blockLines = frontMatter.mergeFrontMatter(existing, updates, {
    protectedKeys: readonlyKeys,
    warnings,
  });
  const text = frontMatter.serializeFrontMatter(blockLines, body);

  // Atomic replace: write beside the target, then rename over it.
  const temp = path.join(
    path.dirname(where.resolved),
    `.${path.basename(where.resolved)}.${process.pid}.${Date.now()}.tmp`
  );
  fs.writeFileSync(temp, text, "utf8");
  try {
    fs.renameSync(temp, where.resolved);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {}
    throw error;
  }
  return {
    path: where.isDraft ? `drafts/${where.rel.split(path.sep).join("/")}` : where.rel.split(path.sep).join("/"),
    warnings,
  };
}

/**
 * The taxonomy table. appscope's tags are a real file (alias → canon);
 * aaronlau's tags.json arrives with P4 and reads as an empty table that still
 * names its source, so the desk can say so. Categories come from the
 * description's fixed list.
 * @param {Record<string, any>} site
 */
async function readTaxonomy(site) {
  const taxonomy = site.taxonomy || {};
  /** @type {Record<string, unknown>} */
  const tags = { canon: [], alias: {} };
  const source = taxonomy?.tags?.source;
  if (source) {
    const root = String(site.channel?.root || "");
    if (!root) throw adapterError("bad_site_description", "taxonomy.tags.source 需要 channel.root。", 500);
    const file = path.resolve(root, String(source));
    tags.source = file;
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.canon) && parsed.alias && typeof parsed.alias === "object") {
        tags.canon = parsed.canon.map(String);
        tags.alias = { ...parsed.alias };
      } else {
        // A flat alias → canon map, like appscope's source/_data/tags.json.
        const alias = {};
        const canon = new Set();
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value !== "string") continue;
          alias[key] = value;
          canon.add(value);
        }
        tags.alias = alias;
        tags.canon = [...canon];
      }
    } else if (parsed !== null) {
      tags.note = "标签表格式不是对象，按空表处理。";
    }
  }
  const categories = Array.isArray(taxonomy?.categories) ? taxonomy.categories : [];
  const series = taxonomy?.series && typeof taxonomy.series === "object" ? taxonomy.series : [];
  return { tags, categories, series };
}

module.exports = {
  MAX_ARTICLE_BYTES,
  contentRoots,
  contentType,
  deriveStatus,
  gitFileLog,
  listArticles,
  readArticle,
  readTaxonomy,
  resolveArticleLocation,
  writeArticle,
};
