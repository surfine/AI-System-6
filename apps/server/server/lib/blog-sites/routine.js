"use strict";
// 例行维护 (P5 skeleton): the four things the weekly routine does, in the shape
// the desk can actually hold today.
//
//   sync    — run the site's declared corpus sync (sync_all.sh) in the
//             background, keep its log, and prove afterwards that the corpus
//             grew a line. It reads the owner's own databases, so it runs only
//             as a fixed command entry in the site description, inside the
//             shared tools folder — never a shell string from a caller.
//   draft   — say what a week's drafting would read and cost (which dates have
//             no post, the brief files, the models, the spend cap). The model
//             call itself is not wired: this returns the plan and refuses to
//             pretend it drafted anything.
//   longform— the same for one longform piece built from chosen daily posts.
//   rescan  — the month's posts and the corpus the packet would cover.
//
// Nothing here invents work it did not do. Each function either reads, or runs
// a declared command, or returns `not_wired` with the reason.
//
// Contract: tests/features/wensi-d-routine.test.mjs

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { resolveCommand, commandCwd } = require("./commands.js");

const LOG_LINE_LIMIT = 400;
const MAX_DRAFT_DAYS = 14;

/** @type {Map<string, Record<string, any>>} */
const RUNS = new Map();

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function routineError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {Record<string, any>} site */
function routineConfig(site) {
  return site?.routine && typeof site.routine === "object" ? site.routine : {};
}

/**
 * The corpus files, newest last: `corpus/2026H1.txt` and friends. The routine
 * names the directory; which half-year is current is a fact of the filenames.
 * @param {Record<string, any>} site
 */
function corpusFiles(site) {
  const dir = String(routineConfig(site)?.sync?.corpusDir || "");
  if (!dir) return [];
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^20\d\dH[12]\.txt$/.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

/**
 * One corpus file's size and its newest sync stamp.
 * @param {string} file
 */
function corpusInfo(file) {
  if (!file || !fs.existsSync(file)) return null;
  let lines = 0;
  let newest = "";
  try {
    const text = fs.readFileSync(file, "utf8");
    lines = text.split("\n").filter(Boolean).length;
    const stamps = text.match(/\[Sync(\d{4})\|/g) || [];
    if (stamps.length) {
      newest = stamps[stamps.length - 1].replace(/^\[Sync|\|$/g, "");
    }
  } catch {
    return null;
  }
  return { file, lines, newest };
}

/**
 * What the desk knows about syncing this site: whether the fixed command is
 * declared, which corpus file is current, and whether a run is in flight.
 * @param {Record<string, any>} site
 */
function syncStatus(site) {
  const config = routineConfig(site)?.sync || {};
  const commandId = String(config.command || "sync-corpus");
  const declared = Boolean((site.channel?.commands || []).some((command) => command?.id === commandId));
  const files = corpusFiles(site);
  const current = corpusInfo(files[files.length - 1]);
  // The child handle stays in this module: a response is a view of the run,
  // not a process.
  const stored = RUNS.get(String(site.id || "")) || null;
  const run = stored ? (() => {
    const { child, ...view } = stored;
    return view;
  })() : null;
  return {
    ok: true,
    commandId,
    declared,
    toolsDir: String(site.tools?.dir || ""),
    draftsDir: String(site.tools?.draftsDir || ""),
    corpusDir: String(config.corpusDir || ""),
    logsDir: String(config.logsDir || ""),
    corpus: current,
    run,
    note: !declared
      ? `站点描述里没有登记同步命令（${commandId}）。`
      : !current
        ? "语料目录里还没有 20xxH1/H2.txt；确认目录已共享。"
        : `语料当前 ${current.lines} 行，最后一条同步标记 ${current.newest || "—"}。`,
  };
}

/**
 * Start the declared sync in the background. The run keeps its tail of output
 * and, when it exits, the corpus's line count before and after — the number the
 * writer actually asks about is "did new lines arrive".
 * @param {Record<string, any>} site
 * @param {{ since?: string }} [options]
 */
function startSync(site, { since = "" } = {}) {
  const siteId = String(site.id || "");
  const existing = RUNS.get(siteId);
  if (existing?.status === "running") {
    throw routineError("sync_running", "上一次同步还在跑；等它结束或先停掉。", 409);
  }
  const config = routineConfig(site)?.sync || {};
  const commandId = String(config.command || "sync-corpus");
  const command = resolveCommand(site, commandId);
  const cwd = commandCwd(site, command);
  const files = corpusFiles(site);
  const before = corpusInfo(files[files.length - 1]);
  const argv = command.argv.map((part) => String(part));
  const values = {
    tools: String(site.tools?.dir || ""),
    since: String(since || ""),
  };
  const filled = argv.map((part) => part.replace(/\{(tools|since)\}/g, (_, key) => /** @type {any} */ (values)[key] ?? ""));
  if (!filled.length) throw routineError("bad_command", "同步命令没有 argv。", 500);

  const run = {
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: "",
    exitCode: null,
    commandId,
    argv: filled,
    lines: [],
    before,
    after: null,
    newLines: 0,
    error: "",
  };
  RUNS.set(siteId, run);
  let child;
  try {
    child = spawn(filled[0], filled.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    run.status = "failed";
    run.error = String(/** @type {any} */ (error)?.message || error);
    run.endedAt = new Date().toISOString();
    throw routineError("sync_spawn_failed", run.error, 500);
  }
  const push = (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (!line.trim()) continue;
      run.lines.push(line.slice(0, 400));
    }
    if (run.lines.length > LOG_LINE_LIMIT) run.lines.splice(0, run.lines.length - LOG_LINE_LIMIT);
  };
  child.stdout?.on("data", push);
  child.stderr?.on("data", push);
  child.on("error", (error) => {
    run.status = "failed";
    run.error = String(/** @type {any} */ (error)?.message || error);
    run.endedAt = new Date().toISOString();
  });
  child.on("close", (code) => {
    const after = corpusInfo(corpusFiles(site)[corpusFiles(site).length - 1]);
    run.after = after;
    run.newLines = after && before ? Math.max(0, after.lines - before.lines) : 0;
    run.exitCode = code;
    // A run the writer stopped stays stopped: the process closing afterwards is
    // not it finishing, and a "done" receipt would be a lie.
    if (run.status !== "stopped") run.status = code === 0 ? "done" : "failed";
    run.endedAt = new Date().toISOString();
    if (code !== 0 && !run.error && run.status !== "stopped") run.error = `同步命令以退出码 ${code} 结束。`;
  });
  run.child = child;
  return {
    ok: true,
    status: "running",
    commandId,
    startedAt: run.startedAt,
    corpus: before,
    note: `同步已在后台开始（${commandId}）。日志会随进度更新；跑完核对语料有没有新行。`,
  };
}

/**
 * Stop the running sync. A stopped sync reports itself as stopped, not as a
 * finished run.
 * @param {Record<string, any>} site
 */
function stopSync(site) {
  const run = RUNS.get(String(site.id || ""));
  if (!run || run.status !== "running") throw routineError("sync_not_running", "没有在跑的同步。", 409);
  try {
    run.child?.kill("SIGTERM");
  } catch {
    // Already gone; the close handler settles the record either way.
  }
  run.status = "stopped";
  run.endedAt = new Date().toISOString();
  return { ok: true, status: "stopped", note: "已请求停止；已经写进磁盘的部分保留。" };
}

/**
 * The dates in a range that have no post yet, capped at the pipeline's own
 * two-week rule.
 * @param {Record<string, any>} site
 * @param {{ type?: string, from?: string, to?: string }} options
 */
function draftPlan(site, { type = "daily", from = "", to = "" } = {}) {
  const contentType = site.contentTypes?.[type];
  if (!contentType || contentType.storage?.kind !== "file-per") {
    throw routineError("unknown_content_type", `站点没有可起草的稿件类型「${type}」。`, 404);
  }
  const start = String(from || "");
  const end = String(to || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw routineError("bad_date", "起草范围要写成 YYYY-MM-DD 到 YYYY-MM-DD。", 400);
  }
  if (start > end) throw routineError("bad_date", "起始日不能晚于结束日。", 400);
  // Dates are calendar days, not instants: the arithmetic runs in UTC and is
  // read back as strings, so a UTC+8 writer never loses a day to the offset.
  const days = [];
  const toUtc = (value) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const endUtc = toUtc(end);
  for (let cursor = toUtc(start); cursor <= endUtc; cursor += 86_400_000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  if (days.length > MAX_DRAFT_DAYS) {
    throw routineError("range_too_wide", `一次最多 ${MAX_DRAFT_DAYS} 天（例行文档的规矩）；先缩到最近两周。`, 400);
  }
  const dir = String(contentType.storage.dir || "");
  const existing = new Set();
  try {
    for (const name of fs.readdirSync(dir)) {
      const match = name.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) existing.add(match[1]);
    }
  } catch {
    throw routineError("folder_grant_required", `稿件目录读不了：${dir}`, 403);
  }
  const missing = days.filter((day) => !existing.has(day));
  const config = routineConfig(site)?.drafting || {};
  const brief = String(config.brief || "");
  const models = config.models && typeof config.models === "object" ? config.models : {};
  const channel = String(config.channel || "");
  const briefOk = Boolean(brief && fs.existsSync(brief));
  return {
    ok: true,
    type,
    from: start,
    to: end,
    days: days.length,
    missing,
    covered: days.filter((day) => existing.has(day)),
    brief: { path: brief, exists: Boolean(brief && fs.existsSync(brief)) },
    models: {
      pick: String(models.pick || ""),
      write: String(models.write || ""),
    },
    maxSpendUsd: Number(config.maxSpendUsd) || 0,
    channel,
    maxInputTokens: Number(config.maxInputTokens) || 0,
    maxOutputTokens: Number(config.maxOutputTokens) || 0,
    ready: briefOk && Boolean(channel) && missing.length > 0,
    missingPrerequisites: [
      ...(briefOk ? [] : ["brief(例行文档没有登记或找不到)"]),
      ...(channel ? [] : ["provider_bridge(站点描述没有登记起草通道 routine.drafting.channel)"]),
    ],
    note: missing.length
      ? `${missing.length} 天还没有稿（共 ${days.length} 天）。`
        + (briefOk && channel ? "材料与通道都在，按一下才会花模型。" : "还缺：(见下)")
      : `${days.length} 天都已经有稿。`,
  };
}

/**
 * A longform piece from chosen daily posts: the posts exist, and the back-links
 * the builder derives are already bidirectional because they come from the
 * longform file's `related` list.
 * @param {Record<string, any>} site
 * @param {{ posts?: string[] }} options
 */
function longformPlan(site, { posts = [] } = {}) {
  const daily = site.contentTypes?.daily;
  if (!daily || daily.storage?.kind !== "file-per") throw routineError("unknown_content_type", "站点没有日更类型。", 404);
  const names = [...new Set((Array.isArray(posts) ? posts : []).map((name) => String(name)).filter(Boolean))];
  if (!names.length) throw routineError("bad_request", "长文要选几篇日更（文件名）。", 400);
  const dir = String(daily.storage.dir || "");
  const found = [];
  const missing = [];
  for (const name of names) {
    const safe = !name.includes("/") && !name.includes("\\") && !name.startsWith(".");
    if (safe && fs.existsSync(path.join(dir, name))) found.push(name);
    else missing.push(name);
  }
  if (missing.length) {
    throw routineError("article_missing", `这些日更不存在：${missing.join("、")}`, 404);
  }
  const channel = String(routineConfig(site)?.drafting?.channel || "");
  const briefs = [routineConfig(site)?.drafting?.longformBrief, routineConfig(site)?.drafting?.brief]
    .map((file) => String(file || ""))
    .filter((file) => file && fs.existsSync(file));
  return {
    ok: true,
    posts: found,
    writes: [],
    channel,
    briefs,
    ready: Boolean(channel) && briefs.length > 0,
    missingPrerequisites: [
      ...(channel ? [] : ["provider_bridge(站点描述没有登记起草通道 routine.drafting.channel)"]),
      ...(briefs.length ? [] : ["brief(长文简报一份都没有登记或找不到)"]),
    ],
    note: `长文会用这 ${found.length} 篇的原文与引语起草，简报 ${briefs.length} 份；互链由长文的 related 生成，日更那边不用改。`,
  };
}

/**
 * The month's posts and the corpus a rescan packet would cover.
 * @param {Record<string, any>} site
 * @param {{ month?: string }} options
 */
function rescanPlan(site, { month = "" } = {}) {
  const wanted = String(month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(wanted)) throw routineError("bad_date", "回扫要给月份 YYYY-MM（月份 01–12）。", 400);
  const daily = site.contentTypes?.daily;
  if (!daily || daily.storage?.kind !== "file-per") throw routineError("unknown_content_type", "站点没有日更类型。", 404);
  const dir = String(daily.storage.dir || "");
  let posts = [];
  try {
    posts = fs.readdirSync(dir).filter((name) => name.startsWith(wanted) && name.endsWith(".md")).sort();
  } catch {
    throw routineError("folder_grant_required", `稿件目录读不了：${dir}`, 403);
  }
  const commandId = String(routineConfig(site)?.rescan?.command || "month-packet");
  const declared = Boolean((site.channel?.commands || []).some((command) => command?.id === commandId));
  const packetsDir = rescanPacketsDir(site);
  return {
    ok: true,
    month: wanted,
    posts,
    count: posts.length,
    commandId,
    commandDeclared: declared,
    packetsDir,
    ready: declared && posts.length > 0,
    missingPrerequisites: [
      ...(declared ? [] : [`command(${commandId} 没有登记在站点描述的命令表里)`]),
      "provider_bridge(改成 v4 写法要接上模型通道)",
    ],
    note: posts.length
      ? `${wanted} 有 ${posts.length} 篇；核对包可以生成了，改成 v4 写法仍要模型通道（还没接上）。`
      : `${wanted} 没有稿件。`,
  };
}

/**
 * Where a month packet lands: `routine.rescan.packetsDir`, else `packets/`
 * beside the tools folder (month_packet.py's own layout).
 * @param {Record<string, any>} site
 */
function rescanPacketsDir(site) {
  const configured = String(routineConfig(site)?.rescan?.packetsDir || "");
  if (configured) return configured;
  const toolsDir = String(site.tools?.dir || "");
  return toolsDir ? path.join(path.dirname(toolsDir), "packets") : "";
}

/**
 * Build one month's packet with the site's declared command. The script writes
 * `packets/<month>.md` and `.json`; this reports what appeared, not what it
 * "should" have written.
 * @param {Record<string, any>} site
 * @param {{ month?: string }} [options]
 */
async function runRescan(site, { month = "" } = {}) {
  const wanted = String(month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(wanted)) throw routineError("bad_date", "回扫要给月份 YYYY-MM（月份 01–12）。", 400);
  const commandId = String(routineConfig(site)?.rescan?.command || "month-packet");
  const command = resolveCommand(site, commandId);
  const cwd = commandCwd(site, command);
  const values = { month: wanted, tools: String(site.tools?.dir || "") };
  const argv = command.argv.map((part) => String(part).replace(/\{(month|tools)\}/g, (_, key) => /** @type {any} */ (values)[key] ?? ""));
  const packetsDir = rescanPacketsDir(site);
  const output = await new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      reject(routineError("rescan_spawn_failed", String(/** @type {any} */ (error)?.message || error), 500));
      return;
    }
    let text = "";
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* already gone */ }
      resolve({ exitCode: -1, text, timedOut: true });
    }, 5 * 60_000);
    child.stdout?.on("data", (chunk) => { if (text.length < 64 * 1024) text += String(chunk); });
    child.stderr?.on("data", (chunk) => { if (text.length < 64 * 1024) text += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(routineError("rescan_spawn_failed", String(/** @type {any} */ (error)?.message || error), 500));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, text, timedOut: false });
    });
  });
  const files = ["md", "json"].map((extension) => {
    const file = packetsDir ? path.join(packetsDir, `${wanted}.${extension}`) : "";
    const exists = Boolean(file) && fs.existsSync(file);
    return { extension, file, exists, bytes: exists ? fs.statSync(file).size : 0 };
  });
  return {
    ok: output.exitCode === 0,
    month: wanted,
    commandId,
    exitCode: output.exitCode,
    timedOut: output.timedOut,
    output: output.text.trim().slice(-4_000),
    files,
    note: output.exitCode === 0
      ? `核对包生成好了：${files.filter((file) => file.exists).map((file) => path.basename(file.file)).join("、") || "（没有出现新文件）"}。`
      : `回扫命令没有成功（退出码 ${output.exitCode}）。`,
  };
}

module.exports = Object.freeze({
  syncStatus,
  startSync,
  stopSync,
  draftPlan,
  longformPlan,
  rescanPlan,
  runRescan,
  rescanPacketsDir,
  corpusInfo,
  corpusFiles,
  MAX_DRAFT_DAYS,
});
