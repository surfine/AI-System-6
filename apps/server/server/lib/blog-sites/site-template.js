"use strict";
// Site templates (P7): a starting description for a site layout the desk does
// not ship a description for. A template is data — a description whose values
// carry `{{placeholders}}` for the wizard's questions — and this module only
// fills them in and validates the result.
//
// This is deliberately not a channel kind. A filled Hexo description is an
// ordinary git-static site; nothing downstream branches on "template". The
// files live in site-descriptions/templates/, a subdirectory the description
// loader never reads as a site (it reads *.json files directly in
// site-descriptions/ only).

const fs = require("node:fs");
const path = require("node:path");

const { validateSiteDescription } = require("./description.js");

const TEMPLATES_DIR = path.join(__dirname, "..", "..", "site-descriptions", "templates");
const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const SITE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MISSING = Symbol("drop");

/**
 * @param {string} code
 * @param {string} message
 * @param {string[]} [errors]
 * @returns {{ ok: false, code: string, error: string, errors?: string[] }}
 */
function failure(code, message, errors = []) {
  return { ok: false, code, error: message, errors };
}

/** @param {unknown} value */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Substitute every {{name}} in a value. A string that becomes empty is
 * removed by its parent: a template may place an optional answer (checkUrl)
 * and the filled description must not keep an empty required field.
 * @param {unknown} value
 * @param {Record<string, string>} answers
 * @returns {unknown | typeof MISSING}
 */
function substitute(value, answers) {
  if (typeof value === "string") {
    const next = value.replace(/\{\{([A-Za-z][A-Za-z0-9-]*)\}\}/g, (whole, name) => {
      if (!Object.prototype.hasOwnProperty.call(answers, name)) {
        throw Object.assign(new Error(`模板占位符 {{${name}}} 没有对应的答案。`), {
          code: "template_placeholder_unknown",
        });
      }
      return answers[name];
    });
    return next === "" ? MISSING : next;
  }
  if (Array.isArray(value)) {
    const items = [];
    value.forEach((item) => {
      const next = substitute(item, answers);
      if (next !== MISSING) items.push(next);
    });
    return items;
  }
  if (isPlainObject(value)) {
    /** @type {Record<string, unknown>} */
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      const filled = substitute(item, answers);
      if (filled !== MISSING) next[key] = filled;
    }
    return next;
  }
  return value;
}

/**
 * Read every template's metadata. A broken template file is reported, never
 * half-served, exactly like a broken site description.
 * @returns {{ templates: Record<string, any>[], errors: { source: string, errors: string[] }[] }}
 */
function listTemplates() {
  /** @type {Record<string, any>[]} */
  const templates = [];
  /** @type {{ source: string, errors: string[] }[]} */
  const errors = [];
  let names = [];
  try {
    names = fs.readdirSync(TEMPLATES_DIR).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return { templates, errors };
  }
  for (const name of names) {
    const file = path.join(TEMPLATES_DIR, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push({ source: file, errors: [`JSON 解析失败：${String(/** @type {any} */ (error)?.message || error)}`] });
      continue;
    }
    const meta = isPlainObject(parsed) ? parsed._template : null;
    if (!isPlainObject(meta) || typeof meta.id !== "string" || meta.id !== path.basename(name, ".json")) {
      errors.push({ source: file, errors: ["模板缺少 _template 段，或 _template.id 与文件名不一致"] });
      continue;
    }
    templates.push({
      id: meta.id,
      label: String(meta.label || meta.id),
      note: String(meta.note || ""),
      answers: Array.isArray(meta.answers) ? meta.answers : [],
    });
  }
  return { templates, errors };
}

/**
 * One template by id. The id is the file name and is checked against a closed
 * pattern, so a caller cannot walk out of the templates directory.
 * @param {string} id
 * @returns {{ ok: true, template: Record<string, any> } | { ok: false, code: string, error: string }}
 */
function loadTemplate(id) {
  const wanted = String(id || "");
  if (!TEMPLATE_ID_PATTERN.test(wanted)) {
    return failure("template_unknown", `没有这个站点模板：${wanted || "(空)"}`);
  }
  const file = path.join(TEMPLATES_DIR, `${wanted}.json`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return failure("template_unknown", `没有这个站点模板：${wanted}`);
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed._template) || parsed._template.id !== wanted) {
    return failure("template_unreadable", `模板文件不可用：${wanted}`);
  }
  return { ok: true, template: parsed };
}

/**
 * Fill one template with the wizard's answers and validate the result. Nothing
 * is written here; the caller writes only when `ok` is true.
 * @param {string} id
 * @param {Record<string, unknown>} answers
 * @returns {{ ok: true, description: Record<string, any>, template: Record<string, any> }
 *   | { ok: false, code: string, error: string, errors?: string[] }}
 */
function instantiateTemplate(id, answers) {
  const loaded = loadTemplate(id);
  if (loaded.ok === false) return failure(loaded.code, loaded.error);
  const template = loaded.template;
  const meta = template._template;
  const given = isPlainObject(answers) ? answers : {};
  /** @type {Record<string, string>} */
  const clean = {};
  for (const answer of Array.isArray(meta.answers) ? meta.answers : []) {
    const key = String(answer?.key || "");
    if (!key) continue;
    const value = given[key] === undefined || given[key] === null ? "" : String(given[key]).trim();
    if (!value && answer.required === true) {
      return failure("template_answer_missing", `站点模板 ${id} 需要「${answer.label || key}」。`);
    }
    clean[key] = value;
  }
  if (clean.id && !SITE_ID_PATTERN.test(clean.id)) {
    return failure("template_id_invalid", "站点 id 必须是小写字母/数字/连字符（如 \"my-hexo\"）。");
  }
  if (clean.root) {
    if (!path.isAbsolute(clean.root) || clean.root.includes("\0")) {
      return failure("template_root_not_absolute", `站点根目录必须是绝对路径：${clean.root}`);
    }
    clean.root = path.normalize(clean.root);
    // normalize keeps a trailing separator; a root is a path, not a prefix, so
    // drop it (except for the filesystem root itself) before joining children.
    while (clean.root.length > 1 && clean.root.endsWith(path.sep)) {
      clean.root = clean.root.slice(0, -1);
    }
  }
  if (clean.siteUrl) {
    let url = null;
    try {
      url = new URL(clean.siteUrl);
    } catch {
      url = null;
    }
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return failure("template_site_url_invalid", `站点网址必须是 http(s) 地址：${clean.siteUrl}`);
    }
  }
  let filled;
  try {
    filled = substitute(template, clean);
  } catch (error) {
    const code = String(/** @type {any} */ (error)?.code || "template_invalid");
    return failure(code, String(/** @type {any} */ (error)?.message || error));
  }
  if (!isPlainObject(filled)) {
    return failure("template_invalid", `模板 ${id} 填充后不是一个对象。`);
  }
  delete filled._template;
  const verdict = validateSiteDescription(filled);
  if (!verdict.ok) {
    return failure("description_invalid", `模板 ${id} 生成的描述没有通过校验。`, verdict.errors);
  }
  return { ok: true, description: filled, template: { id: meta.id, label: String(meta.label || meta.id) } };
}

module.exports = {
  TEMPLATES_DIR,
  instantiateTemplate,
  listTemplates,
  loadTemplate,
  substitute,
};
