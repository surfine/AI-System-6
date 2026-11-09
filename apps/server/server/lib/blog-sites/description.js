// Site descriptions (站点描述文件, format v1 — lane contracts G11).
//
// One JSON file describes one blog site; the desk builds its whole 文思泉涌
// surface from it. Two descriptions are built into the source tree
// (server/site-descriptions/*.json — the writer's own two sites); sites a
// user adds at run time live in agent/paths.js's site-descriptions directory,
// beside folders.json. Every description is validated here before it is
// served: a broken file is skipped and reported, never half-served.
//
// The field vocabulary is the contract's closed set for P1: string, text,
// date, time, slug, tags, number, readonly, verbatim-quotes, facts,
// predictions. Types the desk does not render yet are registered, not
// implemented.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const paths = require("../../agent/paths.js");
// The parser vocabulary the shared rule runtime owns (apps/desktop/app/shared/
// rule-packages.js). A site may only name a parser that exists there.
const { PARSER_IDS } = require("../../../../desktop/app/shared/rule-packages.js");
const PARSER_ID_SET = new Set(PARSER_IDS);

const SCHEMA_VERSION = 1;
const CHANNEL_KINDS = ["git-static"];
const STORAGE_KINDS = ["file-per", "json-collection"];
// The Micropub extensions the desk knows how to use. A site may only declare
// these; a typo must fail loudly rather than be sent as an unknown property.
const MICROPUB_FEATURES = ["slug-check", "series", "mediaEndpoint", "source-list"];
const MICROPUB_FEATURE_SET = new Set(MICROPUB_FEATURES);
// The property a site wants the slug written as. Micro.blog and app-scope
// take mp-slug; a site that only reads slug names that instead. Anything else
// is a typo and must fail here, not be sent.
const MICROPUB_SLUG_PROPERTIES = ["mp-slug", "slug"];
const MICROPUB_SLUG_PROPERTY_SET = new Set(MICROPUB_SLUG_PROPERTIES);
const MICROPUB_POLL_MAX_SECONDS = 600;
const FIELD_TYPES = [
  "string", "text", "date", "time", "slug", "tags", "number",
  "readonly", "verbatim-quotes", "facts", "predictions",
];
const EDITOR_KINDS = ["markdown", "collection"];
const DRAFT_RULE_KINDS = ["front-matter", "draft-dir"];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TYPE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A site's own checks: one entry per script, each naming the parser that turns
 * its stdout into findings. argv stays an array (never a shell string) and the
 * parser id must be one the shared runtime knows.
 * @param {unknown} value
 */
function isScriptPackage(value) {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.label)) return false;
  if (!Array.isArray(value.scripts) || value.scripts.length === 0) return false;
  return value.scripts.every((script) => isPlainObject(script)
    && isNonEmptyString(script.id)
    && PARSER_ID_SET.has(script.parserId)
    && Array.isArray(script.argv)
    && script.argv.length > 0
    && script.argv.every((part) => typeof part === "string"));
}

/** @param {unknown} value */
function isAbsolutePath(value) {
  return typeof value === "string" && path.isAbsolute(value) && !value.includes("\0");
}

/**
 * A Micropub endpoint is an outward address, so it is https by default. The
 * one exception is the loopback host a local stub runs on: http there never
 * leaves the machine. A hostname that merely contains "localhost" is refused.
 * @param {unknown} value
 */
function isSecureEndpoint(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Validate one parsed description. All problems are collected, not fail-fast,
 * so a site author sees everything at once.
 * @param {unknown} value
 * @returns {{ ok: boolean, description?: Record<string, any>, errors: string[] }}
 */
function validateSiteDescription(value) {
  /** @type {string[]} */
  const errors = [];
  if (!isPlainObject(value)) {
    return { ok: false, errors: ["站点描述必须是一个 JSON 对象"] };
  }
  const raw = /** @type {Record<string, any>} */ (value);
  if (raw.schema !== SCHEMA_VERSION) {
    errors.push(`schema 必须是 ${SCHEMA_VERSION}（现在是 ${JSON.stringify(raw.schema)}）`);
  }
  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    errors.push('id 必须是小写字母/数字/连字符（如 "aaronlau"）');
  }
  if (!isNonEmptyString(raw.label)) errors.push("label 不能为空");
  if (raw.builtin !== undefined && typeof raw.builtin !== "boolean") {
    errors.push("builtin 必须是布尔值");
  }
  if (!isPlainObject(raw.channel)) {
    errors.push("channel 段缺失");
  } else {
    if (!CHANNEL_KINDS.includes(raw.channel.kind)) {
      errors.push(`channel.kind 只支持 ${CHANNEL_KINDS.join("、")}（本版）`);
    }
    if (raw.channel.root !== undefined && !isAbsolutePath(raw.channel.root)) {
      errors.push("channel.root 必须是绝对路径");
    }
    if (raw.channel.commands !== undefined) {
      if (!Array.isArray(raw.channel.commands)) {
        errors.push("channel.commands 必须是数组");
      } else {
        raw.channel.commands.forEach((command, index) => {
          const where = `channel.commands[${index}]`;
          if (!isPlainObject(command)) {
            errors.push(`${where} 必须是对象`);
            return;
          }
          if (typeof command.id !== "string" || !ID_PATTERN.test(command.id)) {
            errors.push(`${where}.id 必须是小写字母/数字/连字符`);
          }
          if (!isNonEmptyString(command.purpose)) errors.push(`${where}.purpose 不能为空`);
          if (!Array.isArray(command.argv) || command.argv.length === 0
            || !command.argv.every((part) => isNonEmptyString(part))) {
            errors.push(`${where}.argv 必须是非空字符串数组（spawn 不走 shell）`);
          }
          if (command.cwd !== undefined && !isAbsolutePath(command.cwd)) {
            errors.push(`${where}.cwd 必须是绝对路径`);
          }
        });
      }
    }
    if (raw.channel.checkUrl !== undefined && !isNonEmptyString(raw.channel.checkUrl)) {
      errors.push("channel.checkUrl 必须是非空字符串");
    }
    // The publish side (P7): Micropub is write-only, so it lives beside the
    // content channel rather than replacing it. No token is ever described.
    if (raw.channel.micropub !== undefined) {
      const micropub = raw.channel.micropub;
      if (!isPlainObject(micropub)) {
        errors.push("channel.micropub 必须是对象");
      } else {
        if (!isSecureEndpoint(micropub.endpoint)) {
          errors.push("channel.micropub.endpoint 必须是 https:// 地址（本地桩可用 http://127.0.0.1 或 http://localhost）");
        }
        if (micropub.mediaEndpoint !== undefined && !isSecureEndpoint(micropub.mediaEndpoint)) {
          errors.push("channel.micropub.mediaEndpoint 必须是 https:// 地址（本地桩可用回环 http）");
        }
        if (micropub.features !== undefined) {
          if (!Array.isArray(micropub.features)
            || !micropub.features.every((feature) => typeof feature === "string")) {
            errors.push("channel.micropub.features 必须是字符串数组");
          } else {
            for (const feature of micropub.features) {
              if (!MICROPUB_FEATURE_SET.has(feature)) {
                errors.push(`channel.micropub.features 不支持「${feature}」（只支持 ${MICROPUB_FEATURES.join("、")}）`);
              }
            }
          }
        }
        if (micropub.pollSeconds !== undefined
          && !(typeof micropub.pollSeconds === "number"
            && micropub.pollSeconds > 0
            && micropub.pollSeconds <= MICROPUB_POLL_MAX_SECONDS)) {
          errors.push(`channel.micropub.pollSeconds 必须是 1–${MICROPUB_POLL_MAX_SECONDS} 秒`);
        }
        if (micropub.slugProperty !== undefined && !MICROPUB_SLUG_PROPERTY_SET.has(micropub.slugProperty)) {
          errors.push(`channel.micropub.slugProperty 只支持 ${MICROPUB_SLUG_PROPERTIES.join("、")}`);
        }
      }
    }
  }
  if (!isPlainObject(raw.contentTypes) || Object.keys(raw.contentTypes).length === 0) {
    errors.push("contentTypes 不能为空");
  } else {
    for (const [typeId, type] of Object.entries(raw.contentTypes)) {
      const where = `contentTypes.${typeId}`;
      if (!TYPE_KEY_PATTERN.test(typeId)) {
        errors.push(`${where} 的键必须是小写字母开头的小写/数字/连字符`);
      }
      if (!isPlainObject(type)) {
        errors.push(`${where} 必须是对象`);
        continue;
      }
      if (!isNonEmptyString(type.label)) errors.push(`${where}.label 不能为空`);
      const storage = type.storage;
      if (!isPlainObject(storage)) {
        errors.push(`${where}.storage 段缺失`);
      } else {
        if (!STORAGE_KINDS.includes(storage.kind)) {
          errors.push(`${where}.storage.kind 只支持 ${STORAGE_KINDS.join("、")}`);
        }
        if (!isAbsolutePath(storage.dir)) errors.push(`${where}.storage.dir 必须是绝对路径`);
        if (storage.kind === "file-per" && !isNonEmptyString(storage.filename)) {
          errors.push(`${where}.storage.filename 不能为空`);
        }
        if (storage.kind === "json-collection" && !isNonEmptyString(storage.file)) {
          errors.push(`${where}.storage.file 不能为空（如 photos.json）`);
        }
      }
      if (!Array.isArray(type.fields) || type.fields.length === 0) {
        errors.push(`${where}.fields 必须是非空数组`);
      } else {
        type.fields.forEach((field, index) => {
          const fieldWhere = `${where}.fields[${index}]`;
          if (!isPlainObject(field)) {
            errors.push(`${fieldWhere} 必须是对象`);
            return;
          }
          if (!isNonEmptyString(field.key)) errors.push(`${fieldWhere}.key 不能为空`);
          if (!FIELD_TYPES.includes(field.type)) {
            errors.push(`${fieldWhere}.type 必须是 ${FIELD_TYPES.join("、")} 之一`);
          }
          if (field.required !== undefined && typeof field.required !== "boolean") {
            errors.push(`${fieldWhere}.required 必须是布尔值`);
          }
          if (field.maxLength !== undefined
            && !(typeof field.maxLength === "number" && field.maxLength > 0)) {
            errors.push(`${fieldWhere}.maxLength 必须是正数`);
          }
          if (field.optionsSource !== undefined && !isNonEmptyString(field.optionsSource)) {
            errors.push(`${fieldWhere}.optionsSource 必须是非空字符串`);
          }
        });
      }
      if (type.url !== undefined && !isPlainObject(type.url)) {
        errors.push(`${where}.url 必须是对象`);
      }
      if (type.editor !== undefined && !EDITOR_KINDS.includes(type.editor)) {
        errors.push(`${where}.editor 只支持 ${EDITOR_KINDS.join("、")}`);
      }
      if (type.draftRule !== undefined) {
        const rule = type.draftRule;
        if (!isPlainObject(rule) || !DRAFT_RULE_KINDS.includes(rule.kind)) {
          errors.push(`${where}.draftRule.kind 只支持 ${DRAFT_RULE_KINDS.join("、")}`);
        } else if (rule.kind === "front-matter") {
          if (!Array.isArray(rule.keys) || rule.keys.length === 0
            || !rule.keys.every((key) => isNonEmptyString(key))) {
            errors.push(`${where}.draftRule.keys 必须是非空字符串数组`);
          }
          if (rule.approvedValue !== undefined && !isNonEmptyString(rule.approvedValue)) {
            errors.push(`${where}.draftRule.approvedValue 必须是非空字符串`);
          }
        } else if (!isAbsolutePath(rule.dir)) {
          errors.push(`${where}.draftRule.dir 必须是绝对路径`);
        }
      }
      if (type.note !== undefined && !isNonEmptyString(type.note)) {
        errors.push(`${where}.note 必须是非空字符串`);
      }
    }
  }
  if (raw.taxonomy !== undefined && raw.taxonomy !== null && !isPlainObject(raw.taxonomy)) {
    errors.push("taxonomy 必须是对象或 null");
  }
  if (raw.media !== undefined && raw.media !== null && !isPlainObject(raw.media)) {
    errors.push("media 必须是对象或 null");
  }
  if (raw.rulePackages !== undefined
    && (!Array.isArray(raw.rulePackages) || !raw.rulePackages.every((entry) => isNonEmptyString(entry) || isScriptPackage(entry)))) {
    errors.push("rulePackages 必须是包 id，或 { id, label, scripts } 形式的脚本包");
  }
  if (raw.maintenance !== undefined
    && (!Array.isArray(raw.maintenance) || !raw.maintenance.every(isNonEmptyString))) {
    errors.push("maintenance 必须是非空字符串数组");
  }
  // The weekly routine (P5): where the corpus lives, which declared command
  // syncs it, which brief the drafting reads, and what the writer agreed to
  // spend. Paths are absolute and the command is an id the table must carry —
  // this section never names a program of its own.
  if (raw.routine !== undefined) {
    const routine = raw.routine;
    if (!isPlainObject(routine)) {
      errors.push("routine 必须是对象");
    } else {
      const sync = routine.sync;
      if (sync !== undefined) {
        if (!isPlainObject(sync)) {
          errors.push("routine.sync 必须是对象");
        } else {
          if (sync.command !== undefined && (typeof sync.command !== "string" || !ID_PATTERN.test(sync.command))) {
            errors.push("routine.sync.command 必须是小写字母/数字/连字符");
          }
          for (const key of ["corpusDir", "logsDir"]) {
            if (sync[key] !== undefined && !isAbsolutePath(sync[key])) errors.push(`routine.sync.${key} 必须是绝对路径`);
          }
        }
      }
      const drafting = routine.drafting;
      if (drafting !== undefined) {
        if (!isPlainObject(drafting)) {
          errors.push("routine.drafting 必须是对象");
        } else {
          if (drafting.brief !== undefined && !isAbsolutePath(drafting.brief)) errors.push("routine.drafting.brief 必须是绝对路径");
          if (drafting.channel !== undefined && !isNonEmptyString(drafting.channel)) errors.push("routine.drafting.channel 必须是非空字符串");
          if (drafting.longformBrief !== undefined && !isAbsolutePath(drafting.longformBrief)) {
            errors.push("routine.drafting.longformBrief 必须是绝对路径");
          }
          if (drafting.maxSpendUsd !== undefined
            && !(typeof drafting.maxSpendUsd === "number" && drafting.maxSpendUsd >= 0)) {
            errors.push("routine.drafting.maxSpendUsd 必须是非负数");
          }
          if (drafting.models !== undefined) {
            if (!isPlainObject(drafting.models)) {
              errors.push("routine.drafting.models 必须是对象");
            } else {
              for (const [key, value] of Object.entries(drafting.models)) {
                if (!isNonEmptyString(value)) errors.push(`routine.drafting.models.${key} 必须是非空字符串`);
              }
            }
          }
        }
      }
      const contacts = routine.contacts;
      if (contacts !== undefined) {
        if (!isPlainObject(contacts)) {
          errors.push("routine.contacts 必须是对象");
        } else if (contacts.path !== undefined && !isAbsolutePath(contacts.path)) {
          errors.push("routine.contacts.path 必须是绝对路径");
        }
      }
      const rescan = routine.rescan;
      if (rescan !== undefined) {
        if (!isPlainObject(rescan)) {
          errors.push("routine.rescan 必须是对象");
        } else {
          if (rescan.command !== undefined && (typeof rescan.command !== "string" || !ID_PATTERN.test(rescan.command))) {
            errors.push("routine.rescan.command 必须是小写字母/数字/连字符");
          }
          for (const key of ["packetsDir", "postPacketsDir", "brief"]) {
            if (rescan[key] !== undefined && !isAbsolutePath(rescan[key])) errors.push(`routine.rescan.${key} 必须是绝对路径`);
          }
        }
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, description: raw, errors };
}

/**
 * Read and validate every *.json in a directory.
 * @param {string} dir
 * @param {boolean} builtin
 * @returns {{ sites: Record<string, any>[], errors: { source: string, errors: string[] }[] }}
 */
function readDescriptionDirectory(dir, builtin) {
  /** @type {Record<string, any>[]} */
  const sites = [];
  /** @type {{ source: string, errors: string[] }[]} */
  const errors = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return { sites, errors };
  }
  for (const name of names) {
    const file = path.join(dir, name);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      errors.push({ source: file, errors: [`JSON 解析失败：${String(/** @type {any} */ (error)?.message || error)}`] });
      continue;
    }
    if (isPlainObject(parsed) && parsed.builtin === undefined) parsed.builtin = builtin;
    const verdict = validateSiteDescription(parsed);
    if (!verdict.ok) {
      errors.push({ source: file, errors: verdict.errors });
      continue;
    }
    sites.push(verdict.description);
  }
  return { sites, errors };
}

/**
 * All descriptions the server serves: the built-ins first, then user-added
 * ones from the agent data directory. A user file may not shadow a built-in
 * id — the built-ins are the writer's own two sites, and a dropped-in file
 * with the same id is a mistake, not an override.
 * @returns {{ sites: Record<string, any>[], errors: { source: string, errors: string[] }[] }}
 */
function loadSiteDescriptions() {
  const builtin = readDescriptionDirectory(path.join(__dirname, "..", "..", "site-descriptions"), true);
  const user = readDescriptionDirectory(paths.siteDescriptionsDir(), false);
  const seen = new Set(builtin.sites.map((site) => /** @type {any} */ (site).id));
  const sites = [...builtin.sites];
  const errors = [...builtin.errors, ...user.errors];
  for (const site of user.sites) {
    if (seen.has(/** @type {any} */ (site).id)) {
      errors.push({
        source: `site-descriptions/${/** @type {any} */ (site).id}`,
        errors: ["用户站点描述与内置描述的 id 重复，已跳过"],
      });
      continue;
    }
    seen.add(/** @type {any} */ (site).id);
    sites.push(site);
  }
  return { sites, errors };
}

/**
 * One description by id, or null.
 * @param {string} id
 * @returns {Record<string, any> | null}
 */
function getSiteDescription(id) {
  const wanted = String(id || "");
  return loadSiteDescriptions().sites.find((site) => /** @type {any} */ (site).id === wanted) || null;
}

module.exports = {
  SCHEMA_VERSION,
  FIELD_TYPES,
  CHANNEL_KINDS,
  STORAGE_KINDS,
  DRAFT_RULE_KINDS,
  MICROPUB_FEATURES,
  MICROPUB_SLUG_PROPERTIES,
  validateSiteDescription,
  loadSiteDescriptions,
  getSiteDescription,
};
