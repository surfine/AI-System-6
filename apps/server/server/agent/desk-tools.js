// Desk tools: a few read-only desk tools for one run, granted by the writer
// for that run (owner ruling C4, 2026-10-30: 引擎接一组只读桌面工具（搜项目、
// 读剪贴簿、查字典），按任务授权 — A10 reopened, read-only).
//
// The engine still gets no MCP server and no loopback port. The desk's data
// lives in the page, so one call travels by files and the run's event stream:
//
//   engine  writes .ais6-desk/ask/<id>.json = {"tool": name, "args": {...}}
//           (work/.ais6-desk is a link to the run's tmp/.ais6-desk)
//   server  reads it — no link, no FIFO, one link count, at most 4 KiB —
//           removes it, checks the name against DESK_TOOLS and logs the call
//           in the run record (desk_request in events.jsonl)
//   page    runs the matching guest read tool on the project the writer
//           granted, and POSTs the result to /api/agent/runs/<run>/desk/<id>
//   server  cuts it to 16 KiB, writes .ais6-desk/answers/<id>.json and logs
//           the outcome (desk_result)
//
// A write-like or unknown tool name is refused here, before anything reaches
// the page, and the page maps the names onto its own read tools again. The
// sandbox profile keeps the channel's folders where the server made them and
// answers/ the server's alone (sandbox-profile.js), so nothing of the
// engine's can wait there for an answer to land on; answers are still written
// to a fresh temp name and renamed into place. Calls are capped per run, each
// waits at most DESK_LIMITS.timeoutMs for the page, and the channel exists only
// for a run whose start request carried the grant: the next run starts
// without it.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { DESK_NAME, openNoFollow } = require("./shadow.js");

/**
 * The tools a granted run may call, each with the arguments it may pass.
 * Every one is a read on the writer's open project; any other name is
 * refused, and arguments not named here are dropped.
 */
const DESK_TOOLS = Object.freeze({
  list_project_objects: Object.freeze([]),
  read_project_object: Object.freeze(["kind", "objectId", "offset", "limit"]),
  search_project_sources: Object.freeze(["query", "limit"]),
  read_file_floppy_item: Object.freeze(["name", "offset", "limit"]),
  list_scrapbook_clips: Object.freeze(["limit"]),
  list_dictionary_terms: Object.freeze([]),
  // 文思泉涌 (D7, read-only): the blog sites this desk serves. The page answers
  // them from the same local API the window uses, so the folder grants the
  // writer already shared are the only door; nothing here writes or publishes.
  read_blog_articles: Object.freeze(["site", "type", "limit"]),
  read_blog_article: Object.freeze(["site", "type", "path"]),
  // Held field suggestion. The page returns slug, category, series and tags
  // and writes nothing; the writer clicks them into the draft.
  propose_blog_fields: Object.freeze(["site", "title", "slug", "cats", "tags", "series", "filename"]),
});

const DESK_LIMITS = Object.freeze({
  /** One request file. */
  requestBytes: 4 * 1024,
  /** One answer's result; a longer one is cut and marked truncated. */
  resultBytes: 16 * 1024,
  /** Requests per run, refused ones included; the one past it closes the channel. */
  callsPerRun: 40,
  /** Calls waiting for the page at once. */
  pending: 4,
  /** How long a call waits for the page. */
  timeoutMs: 30_000,
  pollMs: 300,
  /** One string argument. */
  argText: 2000,
  /** One error line in an answer or the log. */
  errorText: 300,
  /** Entries in ask/ past which the channel closes. */
  entries: 256,
});

const REQUEST_NAME = /^([A-Za-z0-9_-]{1,40})\.json$/;
/** A request that does not parse yet and is younger than this is looked at again. */
const SETTLE_MS = 2000;

/** "dev:ino" of a channel folder, read with lstat; "" for anything but a real folder. @param {string} dir */
function folderIdentity(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() ? `${stat.dev}:${stat.ino}` : "";
  } catch {
    return "";
  }
}

/** @param {unknown} tool @returns {tool is keyof typeof DESK_TOOLS} */
function isDeskTool(tool) {
  return typeof tool === "string" && Object.prototype.hasOwnProperty.call(DESK_TOOLS, tool);
}

/** A tool name fit for the log: the engine's own, or "?". @param {unknown} value */
function loggedName(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : "?";
}

/**
 * The arguments a call passes on: only the names its tool takes, strings cut
 * to DESK_LIMITS.argText, finite numbers; nothing nested.
 * @param {keyof typeof DESK_TOOLS} tool
 * @param {unknown} args
 */
function cleanArgs(tool, args) {
  /** @type {Record<string, string | number>} */
  const out = {};
  if (!args || typeof args !== "object" || Array.isArray(args)) return out;
  for (const key of DESK_TOOLS[tool]) {
    const value = /** @type {any} */ (args)[key];
    if (typeof value === "string") out[key] = value.slice(0, DESK_LIMITS.argText);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/** @param {unknown} value */
function cleanError(value) {
  return String(value || "desk_error").replace(/[\u0000-\u001f\u007f]+/g, " ").slice(0, DESK_LIMITS.errorText);
}

/**
 * An id folded for comparison: one Unicode normalization, then lower case.
 * On a case-insensitive volume two ids that differ only in case — or only in
 * how a character is composed — name one answer file, so the channel treats
 * ids that fold together as one id.
 * @param {string} id
 */
function foldId(id) {
  return id.normalize("NFC").toLowerCase();
}

/** UTF-8 text cut to at most `max` bytes on a character boundary. @param {string} text @param {number} max */
function cutUtf8(text, max) {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= max) return text;
  let end = max;
  // Back off a continuation byte so no character is split.
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

/**
 * Open a run's desk channel: tmp/.ais6-desk/{ask,answers}, reached by the
 * engine through the link work/.ais6-desk, and the poll that serves it. Made
 * before the engine starts, on a fresh shadow.
 * @param {{ tmp: string, work: string }} shadow
 * @param {{ emit: (type: string, data: Record<string, unknown>) => void, pollMs?: number, timeoutMs?: number }} options
 */
function openDeskChannel(shadow, options) {
  const dir = path.join(shadow.tmp, DESK_NAME);
  const askDir = path.join(dir, "ask");
  const answersDir = path.join(dir, "answers");
  for (const folder of [dir, askDir, answersDir]) fs.mkdirSync(folder);
  // A folder that carried its own entry of that name loses it in work/
  // (IGNORED_NAMES already hides it from diffs and put-back).
  const link = path.join(shadow.work, DESK_NAME);
  fs.rmSync(link, { recursive: true, force: true });
  fs.symlinkSync(path.relative(shadow.work, dir), link);
  const folders = [dir, askDir, answersDir];
  const identities = folders.map(folderIdentity);
  const timeoutMs = Number(options.timeoutMs) || DESK_LIMITS.timeoutMs;

  /** @type {Map<string, { tool: string, timer: NodeJS.Timeout }>} */
  const pending = new Map();
  /** Entries that could not be removed (a folder named like a request): never looked at twice. */
  const stuck = new Set();
  let calls = 0;
  let closed = false;
  const timer = setInterval(poll, Number(options.pollMs) || DESK_LIMITS.pollMs);
  timer.unref?.();

  /** The channel's folders are still the ones made here, and real folders. */
  function inPlace() {
    return folders.every((folder, index) => identities[index] && folderIdentity(folder) === identities[index]);
  }

  /** @param {string} [reason] said in the run's log when the channel closes early */
  function close(reason = "") {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    if (reason) {
      options.emit("notice", { code: "desk_channel_closed", reason, message: "The desk tools were closed for the rest of this run." });
    }
  }

  function poll() {
    if (closed) return;
    if (!inPlace()) {
      close("moved");
      return;
    }
    /** @type {string[]} */
    let names;
    try {
      names = fs.readdirSync(askDir);
    } catch {
      close("moved");
      return;
    }
    if (names.length > DESK_LIMITS.entries) {
      close("crowded");
      return;
    }
    for (const name of names.sort()) {
      if (closed) return;
      const match = REQUEST_NAME.exec(name);
      if (match && !stuck.has(name)) take(name, match[1]);
    }
  }

  /**
   * Read one request file, remove it and act on it. The file is the
   * engine's: it is opened without following a link at any level, without
   * blocking (a FIFO), and refused if it is not one regular file with one
   * link, or larger than a request may be.
   * @param {string} name
   * @param {string} id
   */
  function take(name, id) {
    let text = "";
    let fresh = false;
    let refused = "";
    let fd = -1;
    try {
      fd = openNoFollow(dir, `ask/${name}`, fs.constants.O_NONBLOCK || 0);
      const stat = fs.fstatSync(fd);
      const buffer = Buffer.alloc(DESK_LIMITS.requestBytes + 1);
      const length = stat.size > DESK_LIMITS.requestBytes ? buffer.length : fs.readSync(fd, buffer, 0, buffer.length, 0);
      if (length > DESK_LIMITS.requestBytes) refused = "too_large";
      text = refused ? "" : buffer.subarray(0, length).toString("utf8");
      fresh = Date.now() - stat.mtimeMs < SETTLE_MS;
    } catch (error) {
      // Gone since the listing: nothing to answer.
      if (/** @type {any} */ (error)?.code === "ENOENT") return;
      refused = "not_a_file";
    } finally {
      if (fd >= 0) fs.closeSync(fd);
    }
    /** @type {any} */
    let request = null;
    if (!refused) {
      try { request = JSON.parse(text); } catch { request = null; }
      if (!request || typeof request !== "object" || Array.isArray(request)) {
        // Still being written: look again at the next poll.
        if (fresh) return;
        refused = "bad_request";
      }
    }
    try {
      fs.unlinkSync(path.join(askDir, name));
    } catch (error) {
      if (/** @type {any} */ (error)?.code !== "ENOENT") stuck.add(name);
    }
    calls += 1;
    const tool = request && isDeskTool(request.tool) ? request.tool : "";
    if (calls > DESK_LIMITS.callsPerRun) {
      refuse(id, tool || loggedName(request?.tool), "limit");
      close("limit");
      return;
    }
    if (refused) return refuse(id, "?", refused);
    if (!tool) return refuse(id, loggedName(request.tool), "not_allowed");
    // Two calls under one id would share one answer file — and on a
    // case-insensitive volume so would ids that fold together — so the later
    // of the two is refused, unanswered.
    if (pending.has(foldId(id))) {
      options.emit("desk_result", { id, tool, ok: false, error: "id_in_use" });
      return;
    }
    if (pending.size >= DESK_LIMITS.pending) return refuse(id, tool, "busy");
    // An answer left from an earlier call of the same id must not pass for this one's.
    try { fs.unlinkSync(path.join(answersDir, `${id}.json`)); } catch {}
    const wait = setTimeout(() => { settle(id, { ok: false, error: "timeout" }); }, timeoutMs);
    wait.unref?.();
    pending.set(foldId(id), { tool, timer: wait });
    options.emit("desk_request", { id, tool, args: cleanArgs(tool, request.args), call: calls });
  }

  /** @param {string} id @param {string} tool @param {string} code */
  function refuse(id, tool, code) {
    writeAnswer(id, { v: 1, id, tool, ok: false, error: code });
    options.emit("desk_result", { id, tool, ok: false, error: code });
  }

  /**
   * Write one answer: a fresh temp name in answers/, then a rename over the
   * answer's name, so nothing at that name is ever followed or appended to.
   * @param {string} id
   * @param {Record<string, unknown>} doc
   */
  function writeAnswer(id, doc) {
    if (!inPlace()) {
      close("moved");
      return false;
    }
    const temp = path.join(answersDir, `.${id}.${crypto.randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, `${JSON.stringify(doc)}\n`, { flag: "wx", mode: 0o644 });
      fs.renameSync(temp, path.join(answersDir, `${id}.json`));
      return true;
    } catch {
      try { fs.unlinkSync(temp); } catch {}
      return false;
    }
  }

  /**
   * Settle a waiting call: answer the engine and log the outcome.
   * @param {string} id
   * @param {{ ok: boolean, result?: unknown, error?: unknown }} outcome
   */
  function settle(id, outcome) {
    const entry = pending.get(foldId(id));
    if (!entry) return null;
    const { tool } = entry;
    // The result is serialized while the call still waits: one that
    // JSON.stringify cannot make (a deeply nested one) must settle as an
    // error answer here, not throw after the call left pending — the engine
    // would then wait forever, with no answer file and no timeout.
    /** @type {{ ok: boolean, result?: unknown, serialized?: string, error?: unknown }} */
    let settled;
    if (outcome.ok) {
      try {
        const result = outcome.result === undefined ? null : outcome.result;
        const serialized = JSON.stringify(result);
        if (typeof serialized !== "string") throw new Error("a result that is not JSON text");
        settled = { ok: true, result, serialized };
      } catch {
        settled = { ok: false, error: "bad_result" };
      }
    } else {
      settled = { ok: false, error: outcome.error };
    }
    pending.delete(foldId(id));
    clearTimeout(entry.timer);
    if (!settled.ok) {
      const error = cleanError(settled.error);
      writeAnswer(id, { v: 1, id, tool, ok: false, error });
      options.emit("desk_result", { id, tool, ok: false, error });
      return { id, ok: false, bytes: 0, truncated: false };
    }
    const bytes = Buffer.byteLength(settled.serialized);
    const truncated = bytes > DESK_LIMITS.resultBytes;
    const delivered = writeAnswer(id, truncated
      ? { v: 1, id, tool, ok: true, truncated: true, text: cutUtf8(settled.serialized, DESK_LIMITS.resultBytes), note: "Cut at 16 KiB: ask for a smaller slice (offset, limit)." }
      : { v: 1, id, tool, ok: true, truncated: false, result: settled.result });
    // The log never says the engine got what it did not.
    if (!delivered) {
      options.emit("desk_result", { id, tool, ok: false, error: "not_delivered" });
      return { id, ok: false, bytes: 0, truncated: false };
    }
    options.emit("desk_result", { id, tool, ok: true, bytes: Math.min(bytes, DESK_LIMITS.resultBytes), truncated });
    return { id, ok: true, bytes: Math.min(bytes, DESK_LIMITS.resultBytes), truncated };
  }

  return {
    dir,
    poll,
    close,
    /**
     * The page's answer to a waiting call; null when none waits under that id
     * (ids fold together, as everywhere in the channel).
     * @param {string} id
     * @param {{ ok?: unknown, result?: unknown, error?: unknown }} body
     */
    answer(id, body) {
      if (closed || !pending.has(foldId(id))) return null;
      return settle(id, body?.ok === true ? { ok: true, result: body.result } : { ok: false, error: body?.error });
    },
    get closed() { return closed; },
    get calls() { return calls; },
    get pending() { return pending.size; },
  };
}

module.exports = { DESK_LIMITS, DESK_TOOLS, openDeskChannel };
