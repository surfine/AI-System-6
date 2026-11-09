"use strict";
// 联络人 (P5): which conversations and which people feed the corpus.
//
// The list used to live inside `sync_all.sh`. It now lives in
// `<tools>/contacts.json`, next to a tiny `contacts_shell.py` that turns it into
// the shell lines the sync script evals — so the desk edits the list and the
// script keeps its own control flow. Only QQ has such a list today: WeChat
// exports existing sessions, iMessage appends everything, and Telegram reads
// `~/.telegram-export/targets.json`. The ledger says so rather than implying
// this file governs all four platforms.
//
// A change is a toggle, never a rewrite: `enabled: false` and
// `disabledSenders` keep the entry (and its reason) visible, so turning someone
// back on is one click, not a re-typed id.
//
// Contract: tests/features/wensi-d-contacts.test.mjs

const fs = require("node:fs");
const path = require("node:path");

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function contactsError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The list's path: `routine.contacts.path`, else `contacts.json` in the tools
 * folder (which is where `sync_all.sh` looks).
 * @param {Record<string, any>} site
 */
function contactsPath(site) {
  const configured = String(site?.routine?.contacts?.path || "");
  if (configured) return configured;
  const toolsDir = String(site?.tools?.dir || "");
  if (!toolsDir) throw contactsError("contacts_not_configured", "站点描述没有登记工具目录，找不到联络人名单。", 409);
  return path.join(toolsDir, "contacts.json");
}

/**
 * @param {Record<string, any>} site
 */
function readContacts(site) {
  const file = contactsPath(site);
  if (!fs.existsSync(file)) {
    throw contactsError("contacts_missing", `联络人名单不存在：${file}`, 409);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw contactsError("contacts_unreadable", `联络人名单读不了（JSON 有错）：${String(/** @type {any} */ (error)?.message || error)}`, 409);
  }
  if (!data || typeof data !== "object" || !data.qq || typeof data.qq !== "object") {
    throw contactsError("contacts_unreadable", "联络人名单缺少 qq 段。", 409);
  }
  const senders = Array.isArray(data.qq.senders) ? data.qq.senders.map(String) : [];
  const disabledSenders = Array.isArray(data.qq.disabledSenders) ? data.qq.disabledSenders.map(String) : [];
  const conversations = (Array.isArray(data.qq.conversations) ? data.qq.conversations : []).map((entry) => ({
    prefix: String(entry?.prefix || ""),
    kind: String(entry?.kind || "c2c") === "group" ? "group" : "c2c",
    id: String(entry?.id || ""),
    senders: Array.isArray(entry?.senders) ? entry.senders.map(String) : [],
    enabled: entry?.enabled !== false,
    note: String(entry?.note || ""),
  }));
  return {
    ok: true,
    file,
    qq: { senders, disabledSenders, conversations },
    summary: {
      senders: senders.length,
      sendersOff: disabledSenders.length,
      conversations: conversations.length,
      conversationsOff: conversations.filter((entry) => !entry.enabled).length,
    },
    note: "QQ 的会话与人在这里；微信按既有会话、iMessage 全量、Telegram 用自己的 targets.json。",
  };
}

/**
 * Apply a toggle plan and write the file. Only the three keys this owns are
 * touched; everything else in the file is copied through.
 * @param {Record<string, any>} site
 * @param {{ conversations?: { id?: string, kind?: string, enabled?: boolean }[], senders?: { id?: string, enabled?: boolean }[] }} change
 */
function updateContacts(site, { conversations = [], senders = [] } = {}) {
  const file = contactsPath(site);
  if (!fs.existsSync(file)) throw contactsError("contacts_missing", `联络人名单不存在：${file}`, 409);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw contactsError("contacts_unreadable", `联络人名单读不了（JSON 有错）：${String(/** @type {any} */ (error)?.message || error)}`, 409);
  }
  if (!data?.qq || !Array.isArray(data.qq.conversations)) {
    throw contactsError("contacts_unreadable", "联络人名单缺少 qq.conversations。", 409);
  }
  const changed = [];

  for (const change of Array.isArray(conversations) ? conversations : []) {
    const id = String(change?.id || "");
    const kind = change?.kind ? String(change.kind) : "";
    const entry = data.qq.conversations.find((row) => String(row?.id || "") === id && (!kind || String(row?.kind || "c2c") === kind));
    if (!entry) throw contactsError("conversation_missing", `名单里没有这个会话：${id}${kind ? `（${kind}）` : ""}`, 404);
    const enabled = change.enabled !== false;
    if ((entry.enabled !== false) !== enabled) {
      entry.enabled = enabled;
      changed.push({ id, kind: String(entry.kind || "c2c"), enabled });
    }
  }

  if (Array.isArray(senders) && senders.length) {
    const known = new Set(Array.isArray(data.qq.senders) ? data.qq.senders.map(String) : []);
    const disabled = new Set(Array.isArray(data.qq.disabledSenders) ? data.qq.disabledSenders.map(String) : []);
    for (const change of senders) {
      const id = String(change?.id || "");
      if (!known.has(id)) throw contactsError("sender_missing", `名单里没有这个发送者：${id}`, 404);
      const enabled = change.enabled !== false;
      if (enabled && disabled.delete(id)) changed.push({ id, enabled });
      if (!enabled && !disabled.has(id)) { disabled.add(id); changed.push({ id, enabled }); }
    }
    data.qq.disabledSenders = [...disabled];
  }

  if (!changed.length) {
    return { ok: true, changed: [], note: "没有要改的（这些条目已经是这个状态）。", file };
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return {
    ok: true,
    file,
    changed,
    note: `改了 ${changed.length} 条：${changed.map((entry) => `${entry.id}${entry.enabled ? " 开" : " 停"}`).join("、")}。下一次同步起生效。`,
  };
}

module.exports = Object.freeze({ contactsPath, readContacts, updateContacts });
