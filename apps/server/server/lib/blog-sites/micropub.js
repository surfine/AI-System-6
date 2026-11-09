// 文思泉涌 · Micropub publish channel (P7).
//
// Micropub is a write-only protocol: it creates and updates posts, and the desk
// still reads, lists and edits through the site's local tree. This module is
// therefore the publish half only: it never lists, never reads a post back
// except to confirm a URL, and never touches a site file.
//
// The token is passed in by the route (resolved from the Keychain) and is
// never written into a plan, a response body, a log line or an error message.

"use strict";

const path = require("node:path");

const ledger = require("./publish-ledger.js");

const DEFAULT_POLL_SECONDS = 30;
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 1_500;
const MAX_RESPONSE_EXCERPT = 500;
const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
const SLUG_PROPERTIES = new Set(["mp-slug", "slug"]);

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function micropubError(code, message, statusCode = 502) {
  const error = /** @type {Error & { code?: string, statusCode?: number }} */ (new Error(message));
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/** @param {Record<string, any>} site */
function micropubConfig(site) {
  const config = site?.channel?.micropub;
  return config && typeof config === "object" ? config : null;
}

/** @param {Record<string, any>} site */
function micropubFeatures(site) {
  const config = micropubConfig(site);
  return new Set(Array.isArray(config?.features) ? config.features.map(String) : []);
}

/**
 * Remove the token from any text before it can reach a response, a log or an
 * error. Servers should never echo it; this is the belt for the one that does.
 * @param {string} text
 * @param {string} token
 */
function redact(text, token) {
  const secret = String(token || "");
  if (!secret) return String(text || "");
  const encoded = encodeURIComponent(secret);
  return String(text || "")
    .split(secret).join("[redacted]")
    .split(encoded).join("[redacted]");
}

/** @param {unknown} value */
function asList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

/**
 * The article's categories/tags, read from the content type's own `tags`
 * fields rather than from fixed key names. aaronlau has `tags`; appscope has
 * `cats` and `tags`; a generic Hexo site has `categories` and `tags`. All of
 * them are Micropub `category` values.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {Record<string, any>} frontMatter
 */
function categoriesOf(site, typeId, frontMatter) {
  const fields = site?.contentTypes?.[typeId]?.fields;
  const keys = Array.isArray(fields)
    ? fields.filter((field) => field?.type === "tags").map((field) => field.key)
    : ["tags", "categories", "cats"];
  const seen = new Set();
  const values = [];
  for (const key of keys) {
    for (const value of asList(frontMatter?.[key])) {
      if (seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

/**
 * The slug the desk would use: the front-matter value, else the filename with
 * its date prefix stripped (the same rule the git adapter applies).
 * @param {string} filename
 * @param {Record<string, any>} frontMatter
 */
function slugOf(filename, frontMatter) {
  const declared = frontMatter?.slug;
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  const stem = path.basename(String(filename || "")).replace(/\.[^.]+$/, "");
  const dated = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(stem);
  return dated ? dated[1] : stem;
}

/**
 * Which form field carries the slug. Omitted means mp-slug, the value
 * Micro.blog and app-scope accept. `slug` is the other closed choice.
 * @param {Record<string, any>} site
 */
function slugPropertyName(site) {
  const name = String(micropubConfig(site)?.slugProperty || "mp-slug");
  return SLUG_PROPERTIES.has(name) ? name : "mp-slug";
}

/**
 * A filename safe to put inside a multipart header. Path pieces and quotes
 * are stripped; the site receives a single file name, not a path.
 * @param {unknown} value
 */
function mediaFilename(value) {
  const base = path.basename(String(value || "")).replace(/[\\/\r\n"]/g, "");
  if (!base || base === "." || base === "..") return "";
  return base.slice(0, 120);
}

/** @param {unknown} value */
function mediaContentType(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^image\/[a-z0-9.+-]+$/.test(text) ? text : "application/octet-stream";
}

/**
 * @param {unknown} value
 * @returns {Buffer | null}
 */
function bytesFromBase64(value) {
  const text = String(value || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!text || !/^[A-Za-z0-9+/=]+$/.test(text)) return null;
  const bytes = Buffer.from(text, "base64");
  return bytes.length ? bytes : null;
}

/**
 * One multipart body. The media endpoint sees a file part named `file`.
 * @param {{ filename: string, contentType: string, bytes: Buffer }} file
 */
function multipartFile(file) {
  const boundary = `----wensi${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`
    + `Content-Type: ${file.contentType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([head, file.bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Micropub's `published` is ISO 8601. Hexo writes `YYYY-MM-DD HH:mm:ss` and
 * aaronlau already writes an offset; the only normalization applied is the
 * space Hexo uses. A missing offset is left as written rather than guessed.
 * @param {unknown} value
 */
function publishedOf(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.includes(" ") ? text.replace(" ", "T") : text;
}

/**
 * The form body for create (h=entry + properties) or update
 * (action=update&url=… + replace[property][]).
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {Record<string, any>} article
 * @param {"create" | "update"} action
 * @param {string} [url]
 */
function buildForm(site, typeId, article, action, url = "") {
  const features = micropubFeatures(site);
  const frontMatter = article?.frontMatter || {};
  const params = [];
  if (action === "update") {
    params.push(["action", "update"]);
    if (url) params.push(["url", url]);
  } else {
    params.push(["h", "entry"]);
  }
  const property = (name, value) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    params.push([action === "update" ? `replace[${name}][]` : name, String(value)]);
  };
  property("name", frontMatter.title);
  property("content", article?.body);
  property("published", publishedOf(frontMatter.date));
  property("post-status", article?.status === "published" ? "published" : "draft");
  property(slugPropertyName(site), slugOf(article?.filename, frontMatter));
  for (const category of categoriesOf(site, typeId, frontMatter)) {
    params.push([action === "update" ? "replace[category][]" : "category[]", category]);
  }
  if (features.has("series")) {
    property("series", frontMatter.series);
    property("series-no", frontMatter.seriesNo);
    property("series-order", frontMatter.seriesOrder);
  }
  return new URLSearchParams(params).toString();
}

/**
 * The text the live page must contain before a publish counts as confirmed.
 * The title is the honest choice; a body fragment is the fallback when the
 * article has no title.
 * @param {Record<string, any>} article
 */
function expectTextOf(article) {
  const title = String(article?.frontMatter?.title || "").trim();
  if (title) return title.slice(0, 24);
  const line = String(article?.body || "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean) || "";
  return line.slice(0, 24);
}

/**
 * @param {string} value
 * @param {string} base
 * @returns {string}
 */
function absoluteUrl(value, base) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Ask the site's slug check, but only when the description declares it. The
 * response shape is part of the app-scope contract: `{ available, conflicts }`.
 * An unknown shape is a warning, never a silent "no conflict".
 * @param {Record<string, any>} site
 * @param {Record<string, any>} article
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
async function checkSlug(site, typeId, article, options = {}) {
  const config = micropubConfig(site);
  if (!micropubFeatures(site).has("slug-check")) return { declared: false };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const slug = slugOf(article?.filename, article?.frontMatter || {});
  const category = categoriesOf(site, typeId, article?.frontMatter || {})[0] || "";
  let url;
  try {
    url = new URL(config.endpoint);
  } catch {
    return { declared: true, warning: "slug-check 的端点不是有效网址，未查询。" };
  }
  url.searchParams.set("q", "slug-check");
  url.searchParams.set("slug", slug);
  if (category) url.searchParams.set("category", category);
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs || REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { declared: true, warning: `slug-check 查询回 ${response.status}，未确认网址是否可用。` };
    }
    /** @type {any} */
    const data = await response.json().catch(() => null);
    if (!data || typeof data.available !== "boolean") {
      return { declared: true, warning: "slug-check 的返回里没有 available 布尔值，未确认网址是否可用。" };
    }
    if (data.available) return { declared: true, conflict: false, checked: true };
    return {
      declared: true,
      conflict: true,
      checked: true,
      conflicts: Array.isArray(data.conflicts) ? data.conflicts.map(String) : [],
    };
  } catch (error) {
    return {
      declared: true,
      warning: `slug-check 查询失败（${String(/** @type {any} */ (error)?.message || error)}），未确认网址是否可用。`,
    };
  }
}

/**
 * Upload one image to the site's media endpoint. The request is multipart;
 * the token rides in Authorization and is redacted from every error.
 * A 201 or 202 must carry Location. Nothing is written on the local disk.
 * @param {Record<string, any>} site
 * @param {{ filename?: string, contentType?: string, dataBase64?: string, bytes?: Buffer }} file
 * @param {{ token?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
async function uploadMedia(site, file, options = {}) {
  const config = micropubConfig(site);
  if (!config) throw micropubError("micropub_not_configured", "这个站点没有登记 Micropub 发布通道。", 409);
  const endpoint = String(config.mediaEndpoint || "");
  if (!endpoint) {
    throw micropubError("micropub_media_not_configured", "这个站点没有登记 mediaEndpoint，图片不能上传。", 409);
  }
  const token = String(options.token || "");
  if (!token) {
    throw micropubError("micropub_token_missing", "还没有 Micropub token。在站点面板里交一次 token，再上传图片。", 409);
  }
  const filename = mediaFilename(file?.filename);
  if (!filename) {
    throw micropubError("micropub_media_filename", "图片文件名是空的，或只含路径符号。", 400);
  }
  const bytes = Buffer.isBuffer(file?.bytes) ? file.bytes : bytesFromBase64(file?.dataBase64);
  if (!bytes) {
    throw micropubError("micropub_media_bytes", "图片内容不是有效的 base64。", 400);
  }
  if (bytes.length > MEDIA_MAX_BYTES) {
    throw micropubError("micropub_media_too_large", "这张图片超过 8 MB，没有上传。", 413);
  }
  const form = multipartFile({ filename, contentType: mediaContentType(file?.contentType), bytes });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": form.contentType,
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: form.body,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs || REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw micropubError(
      "micropub_media_network",
      `连不上媒体端点 ${endpoint}（${redact(String(/** @type {any} */ (error)?.message || error), token)}）。`,
      502
    );
  }
  if (response.status !== 201 && response.status !== 202) {
    const text = await response.text().catch(() => "");
    throw micropubError(
      `micropub_media_http_${response.status}`,
      `媒体端点 ${endpoint} 回 ${response.status}：`
        + `${redact(text, token).trim().slice(0, MAX_RESPONSE_EXCERPT) || "(没有正文)"}`,
      502
    );
  }
  const url = absoluteUrl(response.headers?.get?.("location") || "", endpoint);
  if (!url) {
    throw micropubError(
      "micropub_media_no_location",
      `媒体端点 ${endpoint} 回了 ${response.status}，但没有 Location 头，无法确认图片网址。`,
      502
    );
  }
  return { url, filename };
}

/**
 * Upload the article's pending images and rewrite their source strings in the
 * body that will be posted. The local file is left where it is.
 * @param {Record<string, any>} site
 * @param {Record<string, any>} article
 * @param {{ token?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 */
async function withUploadedMedia(site, article, options) {
  const pending = Array.isArray(article?.media) ? article.media : [];
  if (!pending.length) return article;
  let body = String(article.body || "");
  for (const item of pending) {
    const uploaded = await uploadMedia(site, item, options);
    const source = String(item?.source || "");
    if (source) body = body.split(source).join(uploaded.url);
  }
  return { ...article, body };
}

/**
 * The plan. Read-only apart from an optional slug-check GET. It answers what
 * would run, what would be written (the local ledger only), and every reason
 * not to publish — by name.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 * @param {{
 *   article?: Record<string, any>,
 *   tokenConfigured?: boolean,
 *   ledgerEntry?: Record<string, any> | null,
 *   ledgerFailure?: Record<string, any> | null,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} [options]
 */
async function planPublish(site, typeId, relPath, options = {}) {
  const config = micropubConfig(site);
  if (!config) throw micropubError("micropub_not_configured", "这个站点没有登记 Micropub 发布通道。", 409);
  const blockers = [];
  const warnings = [];
  if (!options.tokenConfigured) {
    blockers.push({
      code: "micropub_token_missing",
      message: "还没有 Micropub token。在站点面板里交一次 token（只进钥匙串，不进描述文件），再发布。",
    });
  }
  if (options.ledgerFailure) {
    blockers.push({
      code: "micropub_ledger_unreadable",
      message: String(options.ledgerFailure.error || "发布台账读不了；修复或删除它再发布。"),
    });
  }
  const article = options.article || null;
  if (!article) {
    blockers.push({
      code: "article_missing",
      message: "还没有可发的稿子。先存稿，再发；Micropub 发送的是已保存的这一篇。",
    });
  } else if (!String(article.body || "").trim() && !(Array.isArray(article.media) && article.media.length)) {
    blockers.push({
      code: "article_empty",
      message: "这篇正文是空的，发出去只是一条空记录；先写几句再发。",
    });
  }
  const pendingMedia = Array.isArray(article?.media) ? article.media : [];
  if (pendingMedia.length && !String(config.mediaEndpoint || "")) {
    blockers.push({
      code: "micropub_media_not_configured",
      message: "这篇带了要上传的图片，但站点没有登记 mediaEndpoint。",
    });
  }
  let slugCheck = null;
  if (article) {
    slugCheck = await checkSlug(site, typeId, article, options);
    if (slugCheck.conflict) {
      blockers.push({
        code: "micropub_slug_conflict",
        message: `网址 slug「${slugOf(article.filename, article.frontMatter || {})}」在站点上已存在`
          + `${slugCheck.conflicts?.length ? `（${slugCheck.conflicts.join("、")}）` : ""}，先换一个。`,
      });
    } else if (slugCheck.warning) {
      warnings.push({ code: "micropub_slug_check_unconfirmed", message: slugCheck.warning });
    }
  }
  const action = options.ledgerEntry?.url ? "update" : "create";
  const file = ledger.ledgerFile(site.id);
  return {
    ok: blockers.length === 0,
    stage: "plan",
    channel: "micropub",
    endpoint: String(config.endpoint || ""),
    action,
    article: article ? { type: typeId, path: String(relPath || ""), filename: article.filename || "" } : null,
    willRun: pendingMedia.length ? ["micropub-media", "micropub-post"] : ["micropub-post"],
    missingCommands: [],
    blockers,
    warnings,
    willWrite: [file],
    willUpload: pendingMedia.map((item) => mediaFilename(item?.filename)).filter(Boolean),
    mediaEndpoint: String(config.mediaEndpoint || ""),
    slugProperty: slugPropertyName(site),
    deployRequiresConfirm: true,
    features: [...micropubFeatures(site)],
    tokenConfigured: Boolean(options.tokenConfigured),
    slugCheck: slugCheck && slugCheck.declared ? { declared: true, conflict: Boolean(slugCheck.conflict), checked: Boolean(slugCheck.checked) } : null,
    note: blockers.length
      ? blockers.map((blocker) => blocker.message).join("\n")
      : action === "update"
        ? "这一篇已经在站点上；发布是更新那一条，不新建。"
        : "发布只发这一篇；部署要在确认后才跑。",
  };
}

/**
 * Send one publish and record it in the ledger. The ledger write happens
 * before confirmation polling: the post is already live, and losing the URL
 * would make the next publish a duplicate.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 * @param {Record<string, any>} article
 * @param {{
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>,
 *   requestTimeoutMs?: number,
 *   pollMs?: number,
 *   now?: number,
 * }} options
 */
async function deploy(site, typeId, relPath, article, options = {}) {
  const config = micropubConfig(site);
  if (!config) throw micropubError("micropub_not_configured", "这个站点没有登记 Micropub 发布通道。", 409);
  const token = String(options.token || "");
  if (!token) {
    throw micropubError("micropub_token_missing", "还没有 Micropub token。在站点面板里交一次 token，再发布。", 409);
  }
  const ledgerRead = ledger.entryFor(site.id, typeId, relPath);
  if (ledgerRead.ok === false) throw micropubError("micropub_ledger_unreadable", ledgerRead.error, 409);
  const action = ledgerRead.entry?.url ? "update" : "create";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleep = options.sleep || ((ms) => new Promise((done) => setTimeout(done, ms)));
  const payload = await withUploadedMedia(site, article, {
    token,
    fetchImpl,
    timeoutMs: options.requestTimeoutMs,
  });
  const form = buildForm(site, typeId, payload, action, ledgerRead.entry?.url || "");
  const endpoint = String(config.endpoint || "");

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: form,
      redirect: "manual",
      signal: AbortSignal.timeout(options.requestTimeoutMs || REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw micropubError(
      "micropub_network",
      `连不上 Micropub 端点 ${endpoint}（${redact(String(/** @type {any} */ (error)?.message || error), token)}）。`,
      502
    );
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw micropubError(
      `micropub_http_${response.status}`,
      `Micropub 端点 ${endpoint} 回 ${response.status}：`
        + `${redact(text, token).trim().slice(0, MAX_RESPONSE_EXCERPT) || "(没有正文)"}`,
      502
    );
  }
  /** @type {any} */
  let stored = null;
  if (text) {
    try { stored = JSON.parse(text); } catch { stored = null; }
  }

  const location = response.headers?.get?.("location") || "";
  const url = action === "update"
    ? (absoluteUrl(location, endpoint) || ledgerRead.entry?.url || "")
    : absoluteUrl(location, endpoint);
  if (action === "create" && !url) {
    throw micropubError(
      "micropub_no_location",
      `Micropub 端点 ${endpoint} 回了 ${response.status}，但没有 Location 头，无法确认文章网址。`
      + "这篇可能已经建在站点上——先看站点，再决定要不要重发。",
      502
    );
  }

  const recorded = ledger.recordPublish(site.id, typeId, relPath, {
    url,
    action,
    publishedAt: new Date(options.now || Date.now()).toISOString(),
  });
  if (recorded.ok === false) {
    // The post is live; the ledger is what failed. Say both, plainly.
    return {
      ok: false,
      stage: "deploy",
      channel: "micropub",
      action,
      url,
      deployed: true,
      verified: false,
      code: recorded.code,
      note: `文章已经发出（${url}），但发布台账没写成：${recorded.error} 下一次发布会因此被拒绝，先修台账。`,
    };
  }

  // A draft the endpoint stored in the repository is not a public page.
  // Hexo does not render source/_drafts, so polling Location would 404.
  if (stored && stored.stored === true) {
    return {
      ok: true,
      stage: "deploy",
      channel: "micropub",
      action,
      url,
      deployed: true,
      verified: true,
      stored: true,
      path: typeof stored.path === "string" ? stored.path : "",
      commit: typeof stored.commit === "string" ? stored.commit : "",
      status: response.status,
      ledger: recorded.file,
    };
  }

  const expectText = expectTextOf(payload);
  const pollMs = Number.isFinite(Number(options.pollMs))
    ? Number(options.pollMs)
    : Math.min(Number(config.pollSeconds) || DEFAULT_POLL_SECONDS, 600) * 1000;
  const deadline = Date.now() + pollMs;
  let last = null;
  while (url && Date.now() < deadline) {
    try {
      const page = await fetchImpl(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(options.requestTimeoutMs || REQUEST_TIMEOUT_MS),
      });
      const text = page.ok ? await page.text() : "";
      last = { status: page.status, matched: expectText ? text.includes(expectText) : page.ok };
      if (page.ok && (!expectText || last.matched)) {
        return {
          ok: true,
          stage: "deploy",
          channel: "micropub",
          action,
          url,
          deployed: true,
          verified: true,
          status: page.status,
          ledger: recorded.file,
        };
      }
    } catch (error) {
      last = { status: 0, error: String(/** @type {any} */ (error)?.message || error) };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return {
    ok: false,
    stage: "deploy",
    channel: "micropub",
    action,
    url,
    deployed: true,
    verified: false,
    ledger: recorded.file,
    last,
    note: "发布已经发出，但网址还没出现这篇的新内容。稍后重试确认；不要重发，重发会走更新（台账已经记下这条网址）。",
  };
}

module.exports = {
  buildForm,
  categoriesOf,
  checkSlug,
  deploy,
  expectTextOf,
  mediaFilename,
  micropubConfig,
  micropubError,
  micropubFeatures,
  planPublish,
  publishedOf,
  redact,
  slugOf,
  slugPropertyName,
  uploadMedia,
  withUploadedMedia,
};
