"use strict";
// 回扫改稿 (P5): one month's posts, rewritten to the v4 way, one approval each.
//
// Three verbs, in the order the writer uses them:
//   snapshot — a rollback point before anything is rewritten. The corpus lives
//              outside git (chat_history_new is not a repository), so this is a
//              copy under `tools/snapshots/`; if the folder ever *is* inside a
//              repository, a commit is made instead and reported as such.
//   rewrite  — one post through the model, with its own packet (the corpus
//              lines behind it) and the rescan brief. The reply is the body and
//              nothing else: title, date and front matter are the writer's.
//   apply    — write the approved body back, keeping the front-matter bytes
//              exactly as they were.
//
// Nothing here is automatic: a rewrite is a candidate until `apply` is called.
//
// Contract: tests/features/wensi-d-rescan.test.mjs

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_BODY_CHARS = 1_200;
const MAX_PACKET_CHARS = 60_000;
const BRIEF_LIMIT_CHARS = 48_000;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function rescanError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {Record<string, any>} site */
function postsDir(site) {
  const dir = String(site?.contentTypes?.daily?.storage?.dir || "");
  if (!dir) throw rescanError("unknown_content_type", "站点没有日更类型。", 404);
  return dir;
}

/** @param {Record<string, any>} site */
function snapshotsDir(site) {
  const toolsDir = String(site?.tools?.dir || "");
  return toolsDir ? path.join(toolsDir, "snapshots") : "";
}

/**
 * @param {string} dir
 */
function gitRoot(dir) {
  const result = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

/**
 * A rollback point. A repository gets a commit; anything else gets a copy of
 * the posts folder, and the receipt says which one happened.
 * @param {Record<string, any>} site
 * @param {{ label?: string }} [options]
 */
// One snapshot per site and label per day: a rescan writes twenty posts, and
// twenty copies of a 10 MB corpus is not a rollback point, it is a leak.
const SNAPSHOTS = new Map();

function snapshot(site, { label = "rescan" } = {}) {
  const source = postsDir(site);
  const key = `${String(site.id || "")}:${label}:${new Date().toISOString().slice(0, 10)}`;
  const existing = SNAPSHOTS.get(key);
  if (existing) return { ...existing, reused: true, note: `今天这一轮已经留过快照（${existing.where}），继续用它。` };
  if (!fs.existsSync(source)) throw rescanError("posts_missing", `日更目录不存在：${source}`, 409);
  const root = gitRoot(source);
  if (root) {
    const status = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
    const dirty = String(status.stdout || "").trim();
    if (!dirty) return { ok: true, kind: "git", where: root, note: "工作树是干净的，没有可提交的内容；这本身就是回滚点。" };
    const add = spawnSync("git", ["-C", root, "add", "-A"], { encoding: "utf8" });
    if (add.status !== 0) throw rescanError("snapshot_failed", `git add 失败：${String(add.stderr || "").slice(0, 300)}`, 500);
    const commit = spawnSync("git", ["-C", root, "commit", "-m", `wensi: 回扫前的快照（${label}）`, "--no-verify"], { encoding: "utf8" });
    if (commit.status !== 0) throw rescanError("snapshot_failed", `git commit 失败：${String(commit.stderr || "").slice(0, 300)}`, 500);
    const receipt = { ok: true, kind: "git", where: root, note: "已提交一份快照；改坏了可以回到这次提交。" };
    SNAPSHOTS.set(key, receipt);
    return receipt;
  }
  const dest = snapshotsDir(site);
  if (!dest) throw rescanError("snapshot_nowhere", "站点描述没有登记工具目录，快照没有地方放。", 409);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = path.join(dest, `${stamp}-${label}`);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  let files = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) if (entry.isFile()) files += 1;
  const receipt = {
    ok: true,
    kind: "copy",
    where: target,
    files,
    note: `日更目录不在 git 里，已复制一份快照（${files} 个文件）：${target}`,
  };
  SNAPSHOTS.set(key, receipt);
  return receipt;
}

/**
 * The per-post packet the rescan brief names, if this month has one.
 * @param {Record<string, any>} site
 * @param {string} month
 * @param {string} file
 */
function packetFor(site, month, file) {
  const root = String(site?.routine?.rescan?.postPacketsDir || "");
  if (!root) return { text: "", path: "" };
  const name = String(file || "").replace(/\.md$/i, ".txt");
  const full = path.join(root, month, name);
  if (!fs.existsSync(full)) return { text: "", path: full };
  const text = fs.readFileSync(full, "utf8");
  return { text: text.length > MAX_PACKET_CHARS ? text.slice(0, MAX_PACKET_CHARS) : text, path: full, truncated: text.length > MAX_PACKET_CHARS };
}

/**
 * @param {Record<string, any>} site
 * @param {string} file
 */
function readPost(site, file) {
  const name = String(file || "");
  if (!name || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    throw rescanError("bad_file", "要给出稿件的文件名（不带路径）。", 400);
  }
  const full = path.join(postsDir(site), name);
  if (!fs.existsSync(full)) throw rescanError("article_missing", `找不到这篇稿件：${name}`, 404);
  return { name, full, text: fs.readFileSync(full, "utf8") };
}

/**
 * The body of a post and the bytes of its front-matter block, so a rewrite can
 * put the body back without touching one byte above it.
 * @param {string} text
 */
function splitPost(text) {
  const lines = String(text || "").split("\n");
  if (!lines.length || lines[0].trim() !== "---") return { head: "", body: String(text || "") };
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") {
      return { head: lines.slice(0, index + 1).join("\n"), body: lines.slice(index + 1).join("\n").replace(/^\n+/, "") };
    }
  }
  return { head: "", body: String(text || "") };
}

/**
 * One post, rewritten. The model returns the body only.
 * @param {{
 *   site: Record<string, any>, month: string, file: string, brief: string,
 *   model?: string, complete: Function, check?: Function | null, instruction?: string
 * }} options
 */
async function rewritePost({ site, month, file, brief = "", model = "", complete, check = null, instruction = "" }) {
  if (typeof complete !== "function") throw rescanError("provider_not_configured", "没有可用的模型通道。", 409);
  const post = readPost(site, file);
  const split = splitPost(post.text);
  const packet = packetFor(site, String(month || ""), post.name);
  const briefRead = brief && fs.existsSync(brief) ? fs.readFileSync(brief, "utf8").slice(0, BRIEF_LIMIT_CHARS) : "";
  if (!briefRead) throw rescanError("brief_missing", `找不到回扫简报：${brief || "（没有登记）"}`, 409);

  const system = [
    "You are correcting one Chinese blog post so it matches what the writer actually said.",
    "Follow the rules in the brief exactly: fix stance, inference, attribution, invention and AI-sounding endings.",
    "Keep the writer's voice. Do not add new facts. Do not change the title.",
    "Answer with exactly one JSON object and nothing else:",
    '{"body":"the corrected post body in Markdown"}',
    "",
    "# Brief",
    briefRead,
  ].join("\n");
  const user = [
    `Correct this post. The packet below holds its corpus lines and export context; use it as the evidence.`,
    instruction ? `\nExtra instruction from the writer:\n${instruction}` : "",
    "\n# The post as it stands",
    split.head ? `${split.head}\n${split.body}` : split.body,
    packet.text ? `\n# 核对包\n${packet.text}` : "\n(这篇没有核对包；只按简报改正，不要补写事实。)",
  ].join("\n");

  // The same ceiling the drafting channel uses: a packet plus a brief plus the
  // post can be large, and a prompt over the limit is refused rather than sent.
  const maxInputTokens = Number(site?.routine?.drafting?.maxInputTokens) || 40_000;
  const estimated = Math.ceil(Buffer.byteLength(`${system}\n${user}`, "utf8") / 3);
  if (estimated > maxInputTokens) {
    throw rescanError("input_too_large", `这篇的材料约 ${estimated} tokens，超过上限 ${maxInputTokens}；核对包太大时先看它的摘要。`, 413);
  }
  const answer = await complete([{ role: "system", content: system }, { role: "user", content: user }], { model, maxTokens: 4_000 });
  let parsed;
  try {
    parsed = JSON.parse(String(answer?.text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
  } catch (error) {
    throw rescanError("reply_unreadable", `模型没有给出可读的 JSON（${String(/** @type {any} */ (error)?.message || error)}）。`, 502);
  }
  const body = String(parsed?.body || "").trim();
  if (body.length < 20 || body.length > MAX_BODY_CHARS) {
    throw rescanError("body_length", `改写后的正文 ${body.length} 字，超出 ${MAX_BODY_CHARS} 字的上限或短得不像一篇。`, 502);
  }
  let findings = [];
  if (typeof check === "function") {
    try {
      findings = (await check({ body, before: split.body })) || [];
    } catch (error) {
      findings = [{ severity: "warn", message: `检查没跑成：${String(/** @type {any} */ (error)?.message || error)}` }];
    }
  }
  return {
    ok: true,
    file: post.name,
    packet: packet.path ? { path: packet.path, used: Boolean(packet.text), truncated: packet.truncated === true } : null,
    before: split.body.trim(),
    after: body,
    findings,
    blocked: findings.some((finding) => finding?.severity === "error"),
    receipt: { model: String(answer?.model || model || ""), inputTokens: null, outputTokens: null },
    note: "改写候选好了；对照之后逐篇批准才会写回稿件。",
  };
}

/**
 * Write an approved body back. The front matter is copied byte for byte; only
 * the body after the closing `---` changes.
 * @param {Record<string, any>} site
 * @param {{ file?: string, body?: string }} options
 */
function applyRewrite(site, { file = "", body = "" } = {}) {
  const post = readPost(site, file);
  const next = String(body || "").trim();
  if (next.length < 20) throw rescanError("body_length", "批准写入的正文太短。", 400);
  const split = splitPost(post.text);
  const text = split.head ? `${split.head}\n${next}\n` : `${next}\n`;
  if (text === post.text) return { ok: true, file: post.name, changed: false, note: "改写后的正文与原文一样，没有写。" };
  fs.writeFileSync(post.full, text);
  return { ok: true, file: post.name, changed: true, note: `已写回 ${post.name}（front-matter 一个字节没动）。` };
}

module.exports = Object.freeze({
  snapshot,
  rewritePost,
  applyRewrite,
  splitPost,
  packetFor,
  readPost,
  snapshotsDir,
  MAX_BODY_CHARS,
});
