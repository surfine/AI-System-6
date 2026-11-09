// /api/wensi-quanyong/* — 文思泉涌's server door (P1: the four contract
// endpoints). Local only: router.js never lists this prefix in
// publicPrefixRouteKeys, so a public deployment answers 404 for the whole
// group. The risk behind that is the point — these routes read and write the
// writer's own site folders and (from P3) run the site's fixed publish
// commands, none of which a public page may reach.
//
// Authorization reuses the Chooser grants (agent/folders.js), unchanged: a
// description's directory is only reachable once the writer shared a folder
// covering it through the system dialog (read for a list or a read, change
// for a write). The route never accepts a caller-typed directory — every
// absolute path comes from a validated site description.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const description = require("../lib/blog-sites/description.js");
const adapter = require("../lib/blog-sites/git-static.js");
const checks = require("../lib/blog-sites/checks.js");
const publish = require("../lib/blog-sites/publish.js");
const markdownRenderer = require("../lib/blog-sites/markdown.js");
const media = require("../lib/blog-sites/media.js");
const taxonomy = require("../lib/blog-sites/taxonomy.js");
const predictions = require("../lib/blog-sites/predictions.js");
const routine = require("../lib/blog-sites/routine.js");
const drafting = require("../lib/blog-sites/drafting.js");
const contacts = require("../lib/blog-sites/contacts.js");
const frontMatter = require("../lib/blog-sites/front-matter.js");
const rescan = require("../lib/blog-sites/rescan.js");
const micropub = require("../lib/blog-sites/micropub.js");
const fieldSuggestions = require("../lib/blog-sites/field-suggestions.js");
const publishLedger = require("../lib/blog-sites/publish-ledger.js");
const siteTemplate = require("../lib/blog-sites/site-template.js");
const credentialVault = require("../credential-vault.js");
const agentPaths = require("../agent/paths.js");
const { runSubscriptionCli } = require("../subscription-cli.js");
const photos = require("../lib/blog-sites/photos.js");
const folders = require("../agent/folders.js");
const { readJsonBody, send, sendJson } = require("../lib/http.js");

const PUT_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
// Photos arrive base64-encoded (4/3 of the bytes); a few phone photos per drop
// fit, and the per-file cap inside photos.js is the smaller limit.
const PHOTO_IMPORT_BODY_LIMIT_BYTES = 48 * 1024 * 1024;
// The raster types the thumbnail route will hand back. SVG is not here: it is a
// document that can carry script, and thumbnails do not need it.
const MEDIA_CONTENT_TYPES = Object.freeze({
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
});

/**
 * @param {import("node:http").IncomingMessage} req
 * @returns {URL}
 */
function requestUrl(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  } catch {
    return new URL(String(req.url || "/").split("?")[0] || "/", "http://localhost");
  }
}

/**
 * The site description by id, or a typed 404.
 * @param {string} id
 */
function requireSite(id) {
  const site = description.getSiteDescription(id);
  if (!site) throw Object.assign(new Error(`没有 id 为「${String(id)}」的站点描述。`), { statusCode: 404, code: "site_unknown" });
  return site;
}

/**
 * Every directory the route will touch for one content type must sit inside
 * a shared folder with at least `level`. Each root is checked on its own, so
 * a grant over one content type never unlocks another.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} level
 */
function requireGrants(site, typeId, level) {
  const typeDef = site.contentTypes[String(typeId || "")];
  if (!typeDef) throw Object.assign(new Error(`站点没有内容类型 ${String(typeId || "")}。`), { statusCode: 404, code: "unknown_content_type" });
  const roots = adapter.contentRoots(typeDef);
  for (const root of roots) folders.findGrantForPath(root, level);
  return typeDef;
}

/**
 * GET /api/wensi-quanyong/sites
 * @param {import("node:http").ServerResponse} res
 */
function handleSites(res) {
  const { sites } = description.loadSiteDescriptions();
  sendJson(res, 200, { sites }, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/templates — what the wizard can start from.
 * @param {import("node:http").ServerResponse} res
 */
function handleSiteTemplates(res) {
  const listed = siteTemplate.listTemplates();
  sendJson(res, 200, { templates: listed.templates, errors: listed.errors }, { "Cache-Control": "no-store" });
}

/**
 * The grants a new description depends on, one line per directory. A missing
 * grant is a fact to report, not a reason to refuse the description: sharing
 * happens in the system Chooser, and the writer may do it after naming the
 * folder here.
 * @param {Record<string, any>} site
 */
function grantReport(site) {
  const wanted = new Set();
  if (site.channel?.root) wanted.add(String(site.channel.root));
  for (const type of Object.values(site.contentTypes || {})) {
    if (type?.storage?.dir) wanted.add(String(type.storage.dir));
    if (type?.draftRule?.kind === "draft-dir" && type.draftRule.dir) wanted.add(String(type.draftRule.dir));
  }
  if (site.media?.dir) wanted.add(String(site.media.dir));
  return [...wanted].map((dir) => {
    /** @type {{ path: string, read: boolean, change: boolean }} */
    const report = { path: dir, read: false, change: false };
    for (const level of ["read", "change"]) {
      try {
        folders.findGrantForPath(dir, level);
        if (level === "read") report.read = true;
        else report.change = true;
      } catch {
        // The report keeps false; the caller turns it into a next step.
      }
    }
    return report;
  });
}

/**
 * Merge the wizard's overrides into a filled template. Only the keys the
 * wizard shows are ever sent; validation runs again after the merge, so a
 * hand-crafted request cannot smuggle an unvalidated shape past it.
 * @param {Record<string, any>} base
 * @param {Record<string, any>} overrides
 * @returns {Record<string, any>}
 */
function mergeDescription(base, overrides) {
  const plain = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  if (!plain(overrides)) return base;
  /** @type {Record<string, any>} */
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) {
      merged[key] = null;
      continue;
    }
    merged[key] = plain(value) && plain(merged[key]) ? mergeDescription(merged[key], value) : value;
  }
  return merged;
}

/**
 * POST /api/wensi-quanyong/sites — the wizard's one write.
 * Body: { template, answers, dryRun? } or { description, dryRun? }.
 * The description is validated before anything is written; a dry run returns
 * the same grants and next steps without touching disk.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleSiteCreate(req, res) {
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 512 * 1024 })) || {};
  const dryRun = body.dryRun === true;
  let site = null;
  if (body.template) {
    const built = siteTemplate.instantiateTemplate(String(body.template), body.answers || {});
    if (built.ok === false) {
      sendJson(res, 400, { error: built.error, code: built.code, errors: built.errors || [] });
      return;
    }
    site = built.description;
    if (body.overrides) {
      site = mergeDescription(site, body.overrides);
      const verdict = description.validateSiteDescription(site);
      if (!verdict.ok) {
        sendJson(res, 400, { error: "站点描述没有通过校验，未写盘。", code: "description_invalid", errors: verdict.errors });
        return;
      }
      site = verdict.description;
    }
  } else if (body.description) {
    const verdict = description.validateSiteDescription(body.description);
    if (!verdict.ok) {
      sendJson(res, 400, { error: "站点描述没有通过校验，未写盘。", code: "description_invalid", errors: verdict.errors });
      return;
    }
    site = verdict.description;
  } else {
    sendJson(res, 400, { error: "请求要带 template+answers 或 description。", code: "description_required" });
    return;
  }
  const id = String(site.id);
  const file = path.join(agentPaths.siteDescriptionsDir(), `${id}.json`);
  const { sites } = description.loadSiteDescriptions();
  if (sites.some((entry) => entry.id === id) || fs.existsSync(file)) {
    sendJson(res, 409, {
      error: `已经有 id 为「${id}」的站点。换一个 id，或在选择器里先处理已有的那份。`,
      code: "site_exists",
      file,
    });
    return;
  }
  const grants = grantReport(site);
  const next = [];
  const missing = grants.filter((grant) => !grant.change);
  if (missing.length) {
    next.push(`在选择器里共享这些目录（read 才能列出，change 才能改）：${missing.map((grant) => grant.path).join("、")}`);
  }
  const micropubConfig = micropub.micropubConfig(site);
  if (micropubConfig) {
    const token = await credentialVault.resolveMicropubToken(id, micropubConfig.endpoint);
    if (!token) {
      next.push(`用 POST /api/wensi-quanyong/sites/${id}/micropub/token 交一次 token；token 只进钥匙串，不进描述文件。`);
    }
  }
  if (!dryRun) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(temporary, `${JSON.stringify(site, null, 2)}\n`, "utf8");
      fs.renameSync(temporary, file);
    } catch (error) {
      sendJson(res, 500, {
        error: `站点描述写不了：${file}（${String(/** @type {any} */ (error)?.message || error)}）`,
        code: "site_description_unwritable",
      });
      return;
    }
  }
  sendJson(res, 200, {
    ok: true,
    dryRun,
    id,
    file: dryRun ? "" : file,
    description: site,
    grants,
    next,
  }, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/micropub — endpoint, features, and whether
 * a token is stored. The token itself is never returned.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
/**
 * Suggest slug, category, series and tags. The response is held: this route
 * does not write the draft.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleSuggest(req, res, id) {
  const site = requireSite(id);
  const body = await readJsonBody(req, { limitBytes: 64 * 1024 });
  const suggestion = fieldSuggestions.suggestFields(body || {}, site.taxonomy?.categories || []);
  sendJson(res, 200, { ok: true, held: true, suggestion });
}

async function handleMicropubStatus(res, id) {
  const site = requireSite(id);
  const config = micropub.micropubConfig(site);
  if (!config) {
    sendJson(res, 409, { error: "这个站点没有 Micropub 发布通道。", code: "micropub_not_configured" });
    return;
  }
  const token = await credentialVault.resolveMicropubToken(id, config.endpoint);
  const ledger = publishLedger.readLedger(id);
  const ledgerStatus = ledger.ok === false
    ? { ok: false, code: ledger.code, error: ledger.error }
    : { ok: true, file: ledger.file, entries: Object.keys(ledger.entries).length };
  sendJson(res, 200, {
    endpoint: String(config.endpoint || ""),
    mediaEndpoint: String(config.mediaEndpoint || ""),
    features: Array.isArray(config.features) ? config.features : [],
    tokenConfigured: Boolean(token),
    ledger: ledgerStatus,
  }, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/micropub/token — { token }.
 * The token goes to the Keychain and nowhere else.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleMicropubToken(req, res, id) {
  const site = requireSite(id);
  const config = micropub.micropubConfig(site);
  if (!config) {
    sendJson(res, 409, { error: "这个站点没有 Micropub 发布通道。", code: "micropub_not_configured" });
    return;
  }
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 64 * 1024 })) || {};
  const result = await credentialVault.persistMicropubToken(id, config.endpoint, body.token);
  sendJson(res, 200, { ok: true, configured: true, credentialId: result.credentialId, persistence: result.persistence });
}

/**
 * DELETE /api/wensi-quanyong/sites/:id/micropub/token
 * Removes the Keychain entry. The token is never in the response.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleMicropubTokenDelete(res, id) {
  const site = requireSite(id);
  const config = micropub.micropubConfig(site);
  if (!config) {
    sendJson(res, 409, { error: "这个站点没有 Micropub 发布通道。", code: "micropub_not_configured" });
    return;
  }
  const result = await credentialVault.deleteMicropubToken(id, config.endpoint);
  sendJson(res, 200, { ok: true, configured: false, deleted: result.deleted });
}

/**
 * POST /api/wensi-quanyong/sites/:id/micropub/media
 * Body: { filename, contentType, dataBase64 }. The server sends multipart to
 * the site's media endpoint and returns the Location URL. No token comes back.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleMicropubMedia(req, res, id) {
  const site = requireSite(id);
  const config = micropub.micropubConfig(site);
  if (!config) {
    sendJson(res, 409, { error: "这个站点没有 Micropub 发布通道。", code: "micropub_not_configured" });
    return;
  }
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 12 * 1024 * 1024 })) || {};
  const token = await credentialVault.resolveMicropubToken(id, config.endpoint);
  const uploaded = await micropub.uploadMedia(site, {
    filename: body.filename,
    contentType: body.contentType,
    dataBase64: body.dataBase64,
  }, { token });
  sendJson(res, 200, { ok: true, url: uploaded.url, filename: uploaded.filename });
}

/**
 * GET /api/wensi-quanyong/sites/:id/articles?type=
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {string} id
 */
async function handleArticles(req, res, url, id) {
  const site = requireSite(id);
  const typeId = String(url.searchParams.get("type") || "");
  requireGrants(site, typeId, "read");
  const articles = await adapter.listArticles(site, typeId);
  sendJson(res, 200, { type: typeId, articles }, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/article?type=&path=
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {URL} url
 * @param {string} id
 */
async function handleArticleRead(req, res, url, id) {
  const site = requireSite(id);
  const typeId = String(url.searchParams.get("type") || "");
  const relPath = String(url.searchParams.get("path") || "");
  requireGrants(site, typeId, "read");
  const article = await adapter.readArticle(site, typeId, relPath);
  sendJson(res, 200, article, { "Cache-Control": "no-store" });
}

/**
 * PUT /api/wensi-quanyong/sites/:id/article  { type, path, frontMatter, body }
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleArticleWrite(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: PUT_BODY_LIMIT_BYTES })) || {};
  const typeId = String(body.type || "");
  const relPath = String(body.path || "");
  requireGrants(site, typeId, "change");
  const written = await adapter.writeArticle(site, typeId, relPath, {
    frontMatter: body.frontMatter,
    body: body.body,
  });
  sendJson(res, 200, { ok: true, path: written.path, warnings: written.warnings }, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/taxonomy
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleTaxonomy(req, res, id) {
  const site = requireSite(id);
  // The table reads files under the site root (appscope's tags.json), so the
  // site root itself needs a covering read grant.
  const root = String(site.channel?.root || "");
  if (root) folders.findGrantForPath(root, "read");
  const taxonomy = await adapter.readTaxonomy(site);
  sendJson(res, 200, taxonomy, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/preview
 * Renders an unsaved draft exactly the way the site's own generator will:
 * the same Markdown subset, printed ids, and paragraph anchors. The desk drops
 * the result into a page that links the site's own stylesheet, so the writer
 * sees the article as the site will show it, not as a generic preview.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handlePreview(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: PUT_BODY_LIMIT_BYTES })) || {};
  const typeId = String(body.type || "");
  if (!site.contentTypes?.[typeId]) {
    sendJson(res, 404, { error: `Unknown content type: ${typeId}`, code: "unknown_content_type" });
    return;
  }
  const slug = typeof body?.slug === "string" && body.slug ? body.slug : "preview";
  const html = markdownRenderer.anchorBlocks(
    markdownRenderer.withHeadingIds(markdownRenderer.markdown(String(body?.body || ""), 3), `doc`),
  );
  sendJson(res, 200, {
    html,
    plain: markdownRenderer.strip(html),
    chars: markdownRenderer.charCount(markdownRenderer.strip(html)),
    slug,
  }, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/check
 * Runs every rule package the site declares on an unsaved draft. Findings keep
 * D4's severities; a package that could not run is reported as such instead of
 * quietly contributing nothing.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleCheck(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: PUT_BODY_LIMIT_BYTES })) || {};
  const typeId = String(body.type || "");
  if (!site.contentTypes?.[typeId]) {
    sendJson(res, 404, { error: `Unknown content type: ${typeId}`, code: "unknown_content_type" });
    return;
  }
  // Site scripts live in the tools directory the description names; reading
  // the articles they judge already needs a grant, and so does the tools tree.
  const toolsDir = site.tools?.dir;
  if (toolsDir) folders.findGrantForPath(toolsDir, "read");
  const taxonomy = await adapter.readTaxonomy(site).catch(() => ({ tags: { canon: [], alias: {} }, categories: [], series: [] }));
  const result = await checks.runChecks({
    site,
    typeId,
    article: {
      filename: typeof body?.filename === "string" ? body.filename : `${typeId}.md`,
      frontMatter: body?.frontMatter && typeof body.frontMatter === "object" ? body.frontMatter : {},
      body: String(body?.body || ""),
    },
    taxonomy: taxonomy?.tags
      ? { canon: /** @type {string[]} */ (taxonomy.tags.canon || []), alias: /** @type {Record<string, string>} */ (taxonomy.tags.alias || {}) }
      : undefined,
    siteRoot: String(site.channel?.root || ""),
  });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/photos
 * The photo collection as the desk draws it: stacks in order, frames per stack,
 * loose frames, rolls. Read-only.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handlePhotos(res, id) {
  const site = requireSite(id);
  const file = photos.collectionPath(site);
  if (!folders.findGrantForPath(file, "read")) {
    sendJson(res, 403, { error: `影像集合不在已共享的目录里：${file}`, code: "folder_grant_required" });
    return;
  }
  sendJson(res, 200, photos.photoView(site), { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/photos/update — one frame's words.
 * POST /api/wensi-quanyong/sites/:id/photos/reorder — one stack's order.
 * Both write the collection file, so both need the "change" grant.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 * @param {"update" | "reorder"} action
 */
async function handlePhotoWrite(req, res, id, action) {
  const site = requireSite(id);
  const file = photos.collectionPath(site);
  if (!folders.findGrantForPath(file, "change")) {
    sendJson(res, 403, { error: `影像集合不在已共享（可写）的目录里：${file}`, code: "folder_grant_required" });
    return;
  }
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 512 * 1024 })) || {};
  const result = action === "reorder"
    ? photos.reorderStack(site, { slug: body.slug, ids: body.ids })
    : photos.updateFrame(site, { id: body.id, patch: body.patch });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/taxonomy/rename
 * A tag rename or merge. Plan by default; `confirm: "rename"` applies it.
 * The plan lists every article the rename would touch, so nothing is rewritten
 * before the writer has seen the list.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleTaxonomyRename(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
  const confirm = String(body.confirm || "") === "rename";
  // The tag table and every article directory are written: both need the
  // "change" level, and both are checked before a single byte moves.
  const table = taxonomy.tagTablePath(site);
  if (!folders.findGrantForPath(table, "change")) {
    sendJson(res, 403, { error: `标签表不在已共享（可写）的目录里：${table}`, code: "folder_grant_required" });
    return;
  }
  for (const [typeId, type] of Object.entries(site.contentTypes || {})) {
    if (type?.storage?.kind !== "file-per" || !type.storage.dir) continue;
    if (!folders.findGrantForPath(String(type.storage.dir), "change")) {
      sendJson(res, 403, { error: `内容类型「${typeId}」的目录不在已共享（可写）的目录里：${type.storage.dir}`, code: "folder_grant_required" });
      return;
    }
  }
  const result = taxonomy.renameTag(site, { from: body.from, to: body.to, dryRun: !confirm });
  sendJson(res, 200, confirm ? { ...result, planned: result.dryRun === false } : result, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/media
 * The site's image directory, audited: what has no alternative text, what
 * nothing uses, and which frames point at files that are not there. Read-only.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handleMedia(res, id) {
  const site = requireSite(id);
  const dir = String(site.media?.dir || "");
  if (!dir) {
    sendJson(res, 404, { error: "这个站点没有登记图片目录（media.dir）。", code: "media_not_configured" });
    return;
  }
  // Reading the directory and the articles that use it needs a read grant.
  const grant = folders.findGrantForPath(dir, "read");
  if (!grant) {
    sendJson(res, 403, { error: `图片目录不在已共享的目录里：${dir}`, code: "folder_grant_required" });
    return;
  }
  sendJson(res, 200, media.scanMedia(site), { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/preview.css
 * The site's own stylesheet, so a preview looks like the published page rather
 * than like the desk. Read-only, and only from the path the description names.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handlePreviewCss(res, id) {
  const site = requireSite(id);
  const cssPath = String(site.preview?.css || "");
  if (!cssPath) {
    sendJson(res, 404, { error: "这个站点没有登记预览样式表（preview.css）。", code: "preview_css_missing" });
    return;
  }
  // The stylesheet is a file in the site tree: reading it needs the same grant
  // a list does, and nothing outside that tree is reachable.
  const grant = folders.findGrantForPath(cssPath, "read");
  if (!grant) {
    sendJson(res, 403, { error: `站点样式表不在已共享的目录里：${cssPath}`, code: "folder_grant_required" });
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`/* ${cssPath} */\n${require("node:fs").readFileSync(cssPath, "utf8")}`);
}

/**
 * The Micropub half of POST …/publish. The article is read from the site tree
 * (the local tree is the source); the only write is the local publish ledger.
 * The token is resolved here and passed straight to the adapter; it never
 * appears in a response.
 * @param {import("node:http").ServerResponse} res
 * @param {Record<string, any>} site
 * @param {string} id
 * @param {Record<string, any>} body
 * @param {{ typeId: string, relPath: string, stage: string, config: Record<string, any> }} context
 */
async function handleMicropubPublish(res, site, id, body, context) {
  const { typeId, relPath, stage, config } = context;
  requireGrants(site, typeId, "read");
  const token = await credentialVault.resolveMicropubToken(id, config.endpoint);
  let article = null;
  if (relPath) {
    try {
      article = await adapter.readArticle(site, typeId, relPath);
    } catch (error) {
      if (String(/** @type {any} */ (error)?.code || "") !== "article_missing") throw error;
    }
  }
  const ledgerRead = relPath
    ? publishLedger.entryFor(id, typeId, relPath)
    : { ok: true, entry: null };
  const planOptions = {
    article,
    tokenConfigured: Boolean(token),
    ledgerEntry: ledgerRead.ok ? ledgerRead.entry : null,
    ledgerFailure: ledgerRead.ok ? null : ledgerRead,
  };

  if (stage === "plan") {
    const plan = await micropub.planPublish(site, typeId, relPath, planOptions);
    sendJson(res, 200, plan, { "Cache-Control": "no-store" });
    return;
  }
  if (stage === "prepare") {
    // Nothing to normalise or build: Micropub sends the saved article itself.
    sendJson(res, 200, {
      ok: true,
      stage: "prepare",
      channel: "micropub",
      changed: false,
      note: "Micropub 发送的是已保存的这篇；这一步不写站点文件。",
    }, { "Cache-Control": "no-store" });
    return;
  }
  if (stage === "deploy") {
    const plan = await micropub.planPublish(site, typeId, relPath, planOptions);
    if (String(body.confirm || "") !== "deploy") {
      sendJson(res, 409, {
        error: "部署要在确认后才跑：请求里带 confirm: \"deploy\" 再来一次。",
        code: "deploy_not_confirmed",
        plan,
      });
      return;
    }
    if (plan.blockers.length > 0 || !article) {
      sendJson(res, 409, {
        error: plan.blockers.map((blocker) => blocker.message).join("\n") || "发布被挡住了。",
        code: "publish_blocked",
        plan,
      });
      return;
    }
    const result = await micropub.deploy(site, typeId, relPath, article, { token });
    sendJson(res, result.ok ? 200 : 202, result, { "Cache-Control": "no-store" });
    return;
  }
  sendJson(res, 400, { error: `未知的发布阶段：${stage}`, code: "unknown_stage" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/publish
 * The three stages of a git-static publish, each asked for by name:
 *   { stage: "plan" }    nothing runs, nothing is written — the plan only;
 *   { stage: "prepare" } normalise into staging, copy this one article, build;
 *   { stage: "deploy", confirm: "deploy" } run the deploy command and wait for
 *                        the URL. The confirm string is the writer's own word:
 *                        a request that omits it gets a refusal, not a deploy.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handlePublish(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
  const typeId = String(body.type || "");
  const relPath = String(body.path || "");
  const stage = String(body.stage || "plan");
  if (!site.contentTypes?.[typeId]) {
    sendJson(res, 404, { error: `Unknown content type: ${typeId}`, code: "unknown_content_type" });
    return;
  }
  // A site may carry both a Micropub publish channel and the git command
  // table (D2's fallback). Micropub is chosen when described; asking for git
  // is explicit, and nothing falls back on its own after an outward action.
  const micropubConfig = micropub.micropubConfig(site);
  if (micropubConfig && String(body.channel || "") !== "git") {
    await handleMicropubPublish(res, site, id, body, { typeId, relPath, stage, config: micropubConfig });
    return;
  }
  if (stage === "plan") {
    sendJson(res, 200, publish.planPublish(site, typeId, relPath), { "Cache-Control": "no-store" });
    return;
  }
  // Everything past the plan writes the writer's files: the same "change" level
  // a save needs, checked on the trees the publish will touch.
  requireGrants(site, typeId, "change");
  if (stage === "prepare") {
    const prepared = await publish.preparePublish(site, typeId, relPath);
    const built = prepared.changed ? await publish.buildSite(site) : null;
    sendJson(res, 200, { ok: true, stage: "prepare", prepared, build: built }, { "Cache-Control": "no-store" });
    return;
  }
  if (stage === "deploy") {
    if (String(body.confirm || "") !== "deploy") {
      sendJson(res, 409, {
        error: "部署要在确认后才跑：请求里带 confirm: \"deploy\" 再来一次。",
        code: "deploy_not_confirmed",
        plan: publish.planPublish(site, typeId, relPath),
      });
      return;
    }
    const result = await publish.deploySite(site, {
      url: String(body.url || ""),
      expectText: String(body.expectText || ""),
      timeoutMs: Number(body.timeoutMs) || undefined,
    });
    sendJson(res, result.ok ? 200 : 202, result, { "Cache-Control": "no-store" });
    return;
  }
  sendJson(res, 400, { error: `未知的发布阶段：${stage}`, code: "unknown_stage" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/photos/import — photographs in.
 * The bytes travel as base64 in JSON (this server has no multipart parser), and
 * both the collection file and the image directory are written, so both need
 * the "change" grant.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handlePhotoImport(req, res, id) {
  const site = requireSite(id);
  const file = photos.collectionPath(site);
  if (!folders.findGrantForPath(file, "change")) {
    sendJson(res, 403, { error: `影像集合不在已共享（可写）的目录里：${file}`, code: "folder_grant_required" });
    return;
  }
  const dir = photos.mediaDir(site);
  if (!folders.findGrantForPath(dir, "change")) {
    sendJson(res, 403, { error: `图片目录不在已共享（可写）的目录里：${dir}`, code: "folder_grant_required" });
    return;
  }
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: PHOTO_IMPORT_BODY_LIMIT_BYTES })) || {};
  const result = photos.importFrames(site, {
    files: Array.isArray(body.files) ? body.files : [],
    stack: typeof body.stack === "string" ? body.stack : "",
    city: typeof body.city === "string" ? body.city : "",
    medium: typeof body.medium === "string" ? body.medium : "",
    taken: typeof body.taken === "string" ? body.taken : "",
  });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/photos/move — a frame changes stack.
 * POST /api/wensi-quanyong/sites/:id/photos/stack — a new stack appears.
 * POST /api/wensi-quanyong/sites/:id/photos/roll — a batch goes up as one roll.
 * All three write the collection file, so all three need "change".
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 * @param {"move" | "stack" | "roll"} action
 */
async function handlePhotoArrange(req, res, id, action) {
  const site = requireSite(id);
  const file = photos.collectionPath(site);
  if (!folders.findGrantForPath(file, "change")) {
    sendJson(res, 403, { error: `影像集合不在已共享（可写）的目录里：${file}`, code: "folder_grant_required" });
    return;
  }
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 512 * 1024 })) || {};
  const result = action === "move"
    ? photos.moveFrame(site, { id: body.id, to: body.to, index: Number.isInteger(body.index) ? body.index : null })
    : action === "stack"
      ? photos.createStack(site, { title: body.title, slug: body.slug, meta: body.meta, intro: body.intro })
      : photos.createRoll(site, { ids: body.ids, date: body.date, cap: body.cap, stack: body.stack });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/media/:file — one image's bytes, so the
 * photo grid can show the photograph it is arranging.
 *
 * Only names inside `media.dir`, one path segment, and only the raster types
 * the site's image directory holds. SVG is deliberately absent: it is a
 * document that can carry script, and this route's job is thumbnails.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 * @param {string} rawName
 */
function handleMediaFile(res, id, rawName) {
  const site = requireSite(id);
  const dir = photos.mediaDir(site);
  if (!folders.findGrantForPath(dir, "read")) {
    sendJson(res, 403, { error: `图片目录不在已共享的目录里：${dir}`, code: "folder_grant_required" });
    return;
  }
  let name = "";
  try {
    name = decodeURIComponent(rawName);
  } catch {
    sendJson(res, 400, { error: "文件名解码失败。", code: "bad_media_name" });
    return;
  }
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    sendJson(res, 400, { error: "文件名只能是图片目录里的一个文件名。", code: "bad_media_name" });
    return;
  }
  const type = MEDIA_CONTENT_TYPES[path.extname(name).toLowerCase()];
  if (!type) {
    sendJson(res, 404, { error: "这个类型不在这里提供（缩略图只给位图）。", code: "media_type_not_served" });
    return;
  }
  const full = path.join(dir, name);
  if (!fs.existsSync(full)) {
    sendJson(res, 404, { error: `图片不在目录里：${name}`, code: "media_file_missing" });
    return;
  }
  send(res, 200, fs.readFileSync(full), {
    "Content-Type": type,
    "Content-Length": fs.statSync(full).size,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

/**
 * A folder grant, or the typed refusal the desk already speaks for every other
 * path. Used by the P5 routes, which touch several named directories.
 * @param {string} dir
 * @param {"read" | "change"} level
 * @param {string} label
 */
function requireGrant(dir, level, label) {
  try {
    folders.findGrantForPath(dir, level);
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== "folder_grant_required") throw error;
    const refusal = new Error(`${label}不在已共享${level === "change" ? "（可写）" : ""}的目录里：${dir}`);
    /** @type {any} */ (refusal).code = "folder_grant_required";
    /** @type {any} */ (refusal).statusCode = 403;
    throw refusal;
  }
}

/**
 * GET /api/wensi-quanyong/sites/:id/predictions
 * 预言账本: every prediction the site's articles carry. Read-only.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handlePredictions(res, id) {
  const site = requireSite(id);
  for (const type of Object.values(site.contentTypes || {})) {
    if (type?.storage?.kind === "file-per" && type.storage.dir) requireGrant(String(type.storage.dir), "read", "稿件目录");
  }
  sendJson(res, 200, predictions.ledger(site), { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/predictions/settle — the verdict.
 * One `status:` line changes; the manuscript around it does not.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handlePredictionSettle(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 64 * 1024 })) || {};
  const file = String(body.file || "");
  const target = Object.values(site.contentTypes || {})
    .filter((type) => type?.storage?.kind === "file-per" && type.storage.dir)
    .map((type) => String(type.storage.dir))
    .find((dir) => file && !file.includes("/") && fs.existsSync(path.join(dir, file)));
  if (!target) {
    sendJson(res, 404, { error: `找不到这篇稿件：${file || "（没有给文件名）"}`, code: "article_missing" });
    return;
  }
  requireGrant(target, "change", "稿件目录");
  const result = predictions.settle(site, {
    file,
    index: Number.isInteger(body.index) ? body.index : null,
    id: typeof body.id === "string" ? body.id : "",
    status: body.status,
  });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/routine
 * What the weekly routine can do here: the sync command and the corpus, plus
 * any run in flight.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handleRoutine(res, id) {
  const site = requireSite(id);
  const corpusDir = String(site.routine?.sync?.corpusDir || "");
  if (corpusDir) requireGrant(corpusDir, "read", "语料目录");
  sendJson(res, 200, routine.syncStatus(site), { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/routine/sync — start or stop the corpus
 * sync. The script writes logs and the corpus, so the tools folder is needed at
 * the "change" level.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleRoutineSync(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 16 * 1024 })) || {};
  const action = String(body.action || "start");
  const toolsDir = String(site.tools?.dir || "");
  if (toolsDir) requireGrant(toolsDir, "change", "工具目录");
  const corpusDir = String(site.routine?.sync?.corpusDir || "");
  if (corpusDir) requireGrant(corpusDir, "change", "语料目录");
  const result = action === "stop"
    ? routine.stopSync(site)
    : routine.startSync(site, { since: typeof body.since === "string" ? body.since : "" });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/routine/plan — what a drafting / longform
 * / rescan step would read and cost. No model is called.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleRoutinePlan(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 64 * 1024 })) || {};
  const kind = String(body.kind || "draft");
  for (const type of Object.values(site.contentTypes || {})) {
    if (type?.storage?.kind === "file-per" && type.storage.dir) requireGrant(String(type.storage.dir), "read", "稿件目录");
  }
  const result = kind === "longform"
    ? routine.longformPlan(site, { posts: Array.isArray(body.posts) ? body.posts : [] })
    : kind === "rescan"
      ? routine.rescanPlan(site, { month: typeof body.month === "string" ? body.month : "" })
      : routine.draftPlan(site, {
        type: typeof body.type === "string" ? body.type : "daily",
        from: typeof body.from === "string" ? body.from : "",
        to: typeof body.to === "string" ? body.to : "",
      });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/draft/run — ask the model for the week's
 * missing days. Bounded before anything is sent: the prompt is measured against
 * the token ceiling and the channel is the desk's own subscription CLI, so no
 * key and no new network capability is involved. Nothing is written here.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleDraftRun(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 64 * 1024 })) || {};
  const type = typeof body.type === "string" && body.type ? body.type : "daily";
  const contentType = site.contentTypes?.[type];
  if (!contentType || contentType.storage?.kind !== "file-per") {
    sendJson(res, 404, { error: `站点没有可起草的稿件类型「${type}」。`, code: "unknown_content_type" });
    return;
  }
  requireGrant(String(contentType.storage.dir || ""), "read", "稿件目录");
  const channel = String(site.routine?.drafting?.channel || "");
  if (channel !== "claude-subscription") {
    sendJson(res, 409, {
      error: "站点描述没有登记起草通道（routine.drafting.channel = \"claude-subscription\"）。",
      code: "provider_not_configured",
    });
    return;
  }
  const briefPath = String(site.routine?.drafting?.brief || "");
  if (!briefPath) {
    sendJson(res, 409, { error: "站点描述没有登记例行文档（routine.drafting.brief）。", code: "brief_missing" });
    return;
  }
  requireGrant(path.dirname(briefPath), "read", "例行文档目录");
  const corpusDir = String(site.routine?.sync?.corpusDir || "");
  if (corpusDir) requireGrant(corpusDir, "read", "语料目录");

  const plan = routine.draftPlan(site, {
    type,
    from: typeof body.from === "string" ? body.from : "",
    to: typeof body.to === "string" ? body.to : "",
  });
  if (!plan.missing.length) {
    sendJson(res, 409, { error: "这几天都已经有稿，没有可起草的日子。", code: "nothing_missing", plan });
    return;
  }
  const corpusFile = routine.corpusFiles(site).slice(-1)[0] || "";
  const corpusText = corpusFile ? drafting.corpusForDates(fs.readFileSync(corpusFile, "utf8"), plan.missing) : "";
  const requestedModel = String(body.model || site.routine?.drafting?.models?.write || "");
  const taxonomy = await adapter.readTaxonomy(site).catch(() => ({ tags: { canon: [], alias: {} } }));
  const siteRoot = String(site.channel?.root || "");

  const result = await drafting.runDraft({
    site,
    type,
    dates: plan.missing,
    brief: briefPath,
    corpus: corpusText,
    instruction: typeof body.instruction === "string" ? body.instruction : "",
    model: requestedModel,
    // 订阅通道按订阅计费，没有 USD 价目表；上限用 token 硬顶，回执里说清楚。
    pricing: null,
    complete: async (messages, options) => {
      const answer = await runSubscriptionCli("claude", {
        messages,
        model: options.model,
        max_tokens: options.maxTokens,
      }, {});
      return { text: answer.text, model: answer.model };
    },
    check: async (post) => {
      const verdicts = await checks.runChecks({
        site,
        typeId: type,
        article: { filename: `${post.date}-draft.md`, frontMatter: { title: post.title, date: post.date }, body: post.body },
        taxonomy: taxonomy?.tags
          ? { canon: /** @type {string[]} */ (taxonomy.tags.canon || []), alias: /** @type {Record<string, string>} */ (taxonomy.tags.alias || {}) }
          : undefined,
        siteRoot,
      });
      return verdicts?.findings || [];
    },
  });

  sendJson(res, 200, {
    ...result,
    plan,
    requestedModel,
    channel: {
      id: "claude-subscription",
      note: "用这台机器上已登录的 Claude Code 跑一轮；实际模型以回执的 model 为准（订阅通道按它自己的配置选模型）。",
    },
  }, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/draft/accept — put chosen candidates into
 * the drafts folder. A separate click from the run, because a draft is a file.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleDraftAccept(req, res, id) {
  const site = requireSite(id);
  const dir = String(site.tools?.draftsDir || "");
  if (!dir) {
    sendJson(res, 409, { error: "站点描述没有登记草稿目录（tools.draftsDir）。", code: "drafts_dir_missing" });
    return;
  }
  requireGrant(dir, "change", "草稿目录");
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
  const result = drafting.acceptDrafts(site, { posts: Array.isArray(body.posts) ? body.posts : [] });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/routine/rescan — build one month's packet
 * with the declared command. The script writes packets/<month>.md and .json, so
 * both the tools folder and the packets folder need "change".
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleRoutineRescan(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 16 * 1024 })) || {};
  const toolsDir = String(site.tools?.dir || "");
  if (toolsDir) requireGrant(toolsDir, "change", "工具目录");
  const packetsDir = routine.rescanPacketsDir(site);
  // The first run creates the folder; grant the folder it will be created in,
  // rather than refusing because the leaf does not exist yet.
  if (packetsDir) requireGrant(fs.existsSync(packetsDir) ? packetsDir : path.dirname(packetsDir), "change", "核对包目录");
  const result = await routine.runRescan(site, { month: typeof body.month === "string" ? body.month : "" });
  sendJson(res, result.ok ? 200 : 202, result, { "Cache-Control": "no-store" });
}

/**
 * GET /api/wensi-quanyong/sites/:id/contacts
 * Which QQ conversations and which senders feed the corpus, and their state.
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
function handleContacts(res, id) {
  const site = requireSite(id);
  requireGrant(path.dirname(contacts.contactsPath(site)), "read", "工具目录");
  sendJson(res, 200, contacts.readContacts(site), { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/contacts — toggle entries. The list is
 * edited, never rewritten: turning something off keeps it visible.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleContactsWrite(req, res, id) {
  const site = requireSite(id);
  requireGrant(path.dirname(contacts.contactsPath(site)), "change", "工具目录");
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 64 * 1024 })) || {};
  const result = contacts.updateContacts(site, {
    conversations: Array.isArray(body.conversations) ? body.conversations : [],
    senders: Array.isArray(body.senders) ? body.senders : [],
  });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/longform — draft one longform piece from
 * chosen daily posts (action "run"), or write the approved candidate into the
 * longform folder (action "accept"). The site's own builder checks `related`,
 * `slug` and `description`, so both stages check them first.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleLongform(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 256 * 1024 })) || {};
  const action = String(body.action || "run");
  const channel = String(site.routine?.drafting?.channel || "");
  if (channel !== "claude-subscription") {
    sendJson(res, 409, {
      error: "站点描述没有登记起草通道（routine.drafting.channel = \"claude-subscription\"）。",
      code: "provider_not_configured",
    });
    return;
  }

  if (action === "accept") {
    const longformDir = String(site.contentTypes?.longform?.storage?.dir || "");
    if (longformDir) requireGrant(longformDir, "change", "长文目录");
    const result = drafting.acceptLongform(site, {
      candidate: body.candidate && typeof body.candidate === "object" ? body.candidate : {},
      date: typeof body.date === "string" ? body.date : "",
    });
    sendJson(res, 200, result, { "Cache-Control": "no-store" });
    return;
  }

  const dailyDir = String(site.contentTypes?.daily?.storage?.dir || "");
  requireGrant(dailyDir, "read", "日更目录");
  const plan = routine.longformPlan(site, { posts: Array.isArray(body.posts) ? body.posts : [] });
  if (!plan.briefs.length) {
    sendJson(res, 409, { error: "长文简报一份都读不到（routine.drafting.longformBrief / brief）。", code: "brief_missing" });
    return;
  }
  for (const brief of plan.briefs) requireGrant(path.dirname(brief), "read", "简报目录");

  const posts = [];
  for (const file of plan.posts) {
    const full = path.join(dailyDir, file);
    const text = fs.readFileSync(full, "utf8");
    const parsed = frontMatter.parseFrontMatter(text);
    posts.push({
      file,
      title: String(parsed.fields?.title || ""),
      date: String(parsed.fields?.date || ""),
      body: parsed.body,
      tags: Array.isArray(parsed.fields?.tags) ? parsed.fields.tags.map(String) : [],
    });
  }
  const taxonomy = await adapter.readTaxonomy(site).catch(() => ({ tags: { canon: [], alias: {} } }));
  const result = await drafting.runLongform({
    site,
    posts,
    briefs: plan.briefs,
    instruction: typeof body.instruction === "string" ? body.instruction : "",
    model: String(body.model || site.routine?.drafting?.models?.write || ""),
    pricing: null,
    complete: async (messages, options) => {
      const answer = await runSubscriptionCli("claude", { messages, model: options.model, max_tokens: options.maxTokens }, {});
      return { text: answer.text, model: answer.model };
    },
    check: async (candidate) => {
      const verdicts = await checks.runChecks({
        site,
        typeId: "longform",
        article: {
          filename: `${candidate.slug}.md`,
          frontMatter: { title: candidate.title, date: new Date().toISOString().slice(0, 10), slug: candidate.slug, description: candidate.description, tags: candidate.tags },
          body: candidate.body,
        },
        taxonomy: taxonomy?.tags
          ? { canon: /** @type {string[]} */ (taxonomy.tags.canon || []), alias: /** @type {Record<string, string>} */ (taxonomy.tags.alias || {}) }
          : undefined,
        siteRoot: String(site.channel?.root || ""),
      });
      return verdicts?.findings || [];
    },
  });
  sendJson(res, 200, { ...result, plan }, { "Cache-Control": "no-store" });
}

/**
 * POST /api/wensi-quanyong/sites/:id/rescan — 回扫改稿, one post at a time.
 *   action "snapshot" — the rollback point (a commit, or a copy when the corpus
 *                       is not in a repository);
 *   action "rewrite"  — one post through the channel, candidate only;
 *   action "apply"    — write the approved body, front matter untouched.
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} id
 */
async function handleRescan(req, res, id) {
  const site = requireSite(id);
  const body = /** @type {any} */ (await readJsonBody(req, { limitBytes: 512 * 1024 })) || {};
  const action = String(body.action || "snapshot");
  const month = typeof body.month === "string" ? body.month : "";
  const postsDir = String(site.contentTypes?.daily?.storage?.dir || "");
  requireGrant(postsDir, action === "apply" || action === "snapshot" ? "change" : "read", "日更目录");

  if (action === "snapshot") {
    sendJson(res, 200, rescan.snapshot(site, { label: month || "rescan" }), { "Cache-Control": "no-store" });
    return;
  }
  if (action === "apply") {
    const snapshot = rescan.snapshot(site, { label: month || "rescan" });
    const result = rescan.applyRewrite(site, { file: body.file, body: body.body });
    sendJson(res, 200, { ...result, snapshot }, { "Cache-Control": "no-store" });
    return;
  }

  const channel = String(site.routine?.drafting?.channel || "");
  if (channel !== "claude-subscription") {
    sendJson(res, 409, {
      error: "站点描述没有登记起草通道（routine.drafting.channel = \"claude-subscription\"）。",
      code: "provider_not_configured",
    });
    return;
  }
  const brief = String(site.routine?.rescan?.brief || "");
  if (brief) requireGrant(path.dirname(brief), "read", "回扫简报目录");
  const taxonomy = await adapter.readTaxonomy(site).catch(() => ({ tags: { canon: [], alias: {} } }));
  const result = await rescan.rewritePost({
    site,
    month,
    file: body.file,
    brief,
    model: String(body.model || site.routine?.drafting?.models?.write || ""),
    instruction: typeof body.instruction === "string" ? body.instruction : "",
    complete: async (messages, options) => {
      const answer = await runSubscriptionCli("claude", { messages, model: options.model, max_tokens: options.maxTokens }, {});
      return { text: answer.text, model: answer.model };
    },
    check: async (candidate) => {
      const verdicts = await checks.runChecks({
        site,
        typeId: "daily",
        article: { filename: String(body.file || "draft.md"), frontMatter: { date: month ? `${month}-01` : "" }, body: candidate.body },
        taxonomy: taxonomy?.tags
          ? { canon: /** @type {string[]} */ (taxonomy.tags.canon || []), alias: /** @type {Record<string, string>} */ (taxonomy.tags.alias || {}) }
          : undefined,
        siteRoot: String(site.channel?.root || ""),
      });
      return verdicts?.findings || [];
    },
  });
  sendJson(res, 200, result, { "Cache-Control": "no-store" });
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
async function handleWensiQuanyong(req, res) {
  const url = requestUrl(req);
  const parts = url.pathname.replace(/^\/api\/wensi-quanyong\/?/, "").split("/").filter(Boolean);
  try {
    // GET /api/wensi-quanyong/sites — the whole description list.
    if (req.method === "GET" && parts.length === 1 && parts[0] === "sites") {
      handleSites(res);
      return;
    }
    // POST /api/wensi-quanyong/sites — the 添加站点 wizard's one write.
    if (req.method === "POST" && parts.length === 1 && parts[0] === "sites") {
      await handleSiteCreate(req, res);
      return;
    }
    // GET /api/wensi-quanyong/sites/templates — before "templates" can be read
    // as a site id.
    if (req.method === "GET" && parts.length === 2 && parts[0] === "sites" && parts[1] === "templates") {
      handleSiteTemplates(res);
      return;
    }
    if (parts[0] !== "sites" || parts.length < 2 || parts.length > 4) {
      sendJson(res, 404, { error: "Not found", code: "not_found" });
      return;
    }
    const id = decodeURIComponent(parts[1]);
    const leaf = parts[2] || "";
    // GET /api/wensi-quanyong/sites/:id/micropub — endpoint and token status
    // (never the token); POST …/micropub/token stores the token in Keychain.
    if (req.method === "GET" && leaf === "micropub" && parts.length === 3) {
      await handleMicropubStatus(res, id);
      return;
    }
    if (req.method === "POST" && leaf === "micropub" && parts[3] === "token" && parts.length === 4) {
      await handleMicropubToken(req, res, id);
      return;
    }
    if (req.method === "DELETE" && leaf === "micropub" && parts[3] === "token" && parts.length === 4) {
      await handleMicropubTokenDelete(res, id);
      return;
    }
    if (req.method === "POST" && leaf === "micropub" && parts[3] === "media" && parts.length === 4) {
      await handleMicropubMedia(req, res, id);
      return;
    }
    if (req.method === "POST" && leaf === "suggest" && parts.length === 3) {
      await handleSuggest(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "articles") {
      await handleArticles(req, res, url, id);
      return;
    }
    if (req.method === "GET" && leaf === "article") {
      await handleArticleRead(req, res, url, id);
      return;
    }
    if (req.method === "PUT" && leaf === "article" && parts.length === 3) {
      await handleArticleWrite(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "taxonomy") {
      await handleTaxonomy(req, res, id);
      return;
    }
    if (req.method === "POST" && leaf === "preview" && parts.length === 3) {
      await handlePreview(req, res, id);
      return;
    }
    if (req.method === "POST" && leaf === "check" && parts.length === 3) {
      await handleCheck(req, res, id);
      return;
    }
    if (req.method === "GET" && parts.length === 3 && parts[2] === "photos") {
      handlePhotos(res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "photos" && (parts[3] === "update" || parts[3] === "reorder")) {
      await handlePhotoWrite(req, res, id, parts[3]);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "photos" && parts[3] === "import") {
      await handlePhotoImport(req, res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "photos"
      && (parts[3] === "move" || parts[3] === "stack" || parts[3] === "roll")) {
      await handlePhotoArrange(req, res, id, parts[3]);
      return;
    }
    // GET /sites/:id/media/:file — a photograph's bytes for the grid's thumbnails.
    if (req.method === "GET" && parts.length === 4 && parts[2] === "media") {
      handleMediaFile(res, id, parts[3]);
      return;
    }
    // POST /sites/:id/taxonomy/rename — another four-segment route.
    if (req.method === "POST" && parts.length === 4 && parts[2] === "taxonomy" && parts[3] === "rename") {
      await handleTaxonomyRename(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "predictions" && parts.length === 3) {
      handlePredictions(res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "predictions" && parts[3] === "settle") {
      await handlePredictionSettle(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "routine" && parts.length === 3) {
      handleRoutine(res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "routine" && parts[3] === "sync") {
      await handleRoutineSync(req, res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "routine" && parts[3] === "rescan") {
      await handleRoutineRescan(req, res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "routine" && parts[3] === "plan") {
      await handleRoutinePlan(req, res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "draft" && parts[3] === "run") {
      await handleDraftRun(req, res, id);
      return;
    }
    if (req.method === "POST" && parts.length === 4 && parts[2] === "draft" && parts[3] === "accept") {
      await handleDraftAccept(req, res, id);
      return;
    }
    if (req.method === "POST" && leaf === "rescan" && parts.length === 3) {
      await handleRescan(req, res, id);
      return;
    }
    if (req.method === "POST" && leaf === "longform" && parts.length === 3) {
      await handleLongform(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "contacts" && parts.length === 3) {
      handleContacts(res, id);
      return;
    }
    if (req.method === "POST" && leaf === "contacts" && parts.length === 3) {
      await handleContactsWrite(req, res, id);
      return;
    }
    if (req.method === "GET" && leaf === "media" && parts.length === 3) {
      handleMedia(res, id);
      return;
    }
    if (req.method === "GET" && leaf === "preview.css" && parts.length === 3) {
      handlePreviewCss(res, id);
      return;
    }
    if (req.method === "POST" && leaf === "publish" && parts.length === 3) {
      await handlePublish(req, res, id);
      return;
    }
    sendJson(res, 404, { error: "Not found", code: "not_found" });
  } catch (error) {
    const status = Number(/** @type {any} */ (error)?.statusCode);
    if (Number.isInteger(status) && status >= 400 && status < 600) {
      sendJson(res, status, {
        error: String(/** @type {any} */ (error)?.message || error),
        code: String(/** @type {any} */ (error)?.code || "wensi_quanyong_rejected"),
      });
      return;
    }
    sendJson(res, 500, {
      error: "文思泉涌服务端出错。",
      detail: String(/** @type {any} */ (error)?.message || error),
      code: "wensi_quanyong_failed",
    });
  }
}

module.exports = {
  handleWensiQuanyong,
};
