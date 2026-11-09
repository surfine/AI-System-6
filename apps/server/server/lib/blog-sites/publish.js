"use strict";
// Publishing a git-static site (P3).
//
// Three stages, each one asked for by name, because the last one is outward
// facing and the middle one writes the writer's files:
//
//   plan    — no writes, no processes: say what would run and which files it
//             would touch, so the writer can look before anything moves.
//   prepare — run the site's normaliser into a temporary staging directory
//             (publish.py rewrites tag spelling for the whole corpus, so it
//             must run over everything), then copy ONLY the chosen article
//             into the site, then build and report. Other staged files that
//             differ are reported as drift, never written: a publish of one
//             post does not silently rewrite the corpus.
//   deploy  — run the description's deploy command, then wait for the article
//             URL to answer 200 with the new text.
//
// Every process comes from the site description's fixed command table
// (commands.js): no command outside it, no shell string, cwd inside the site
// root. The caller checks the folder grants; this module never widens them.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveCommand } = require("./commands.js");
const { readFrames } = require("./media.js");

const VERIFY_TIMEOUT_MS = 180_000;
const VERIFY_INTERVAL_MS = 5_000;
const COMMAND_OUTPUT_LIMIT = 64 * 1024;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function publishError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The directory a normalised copy lands in: the content type's own publish
 * directory, which is different from the drafts directory the editor saves to.
 * @param {Record<string, any>} contentType
 */
function publishDir(contentType) {
  const dir = String(contentType?.publish?.dir || "");
  if (!dir) {
    throw publishError("not_publishable", "这个内容类型没有登记发布目录（contentTypes.<类型>.publish.dir）。", 409);
  }
  return dir;
}

/**
 * True when the editor's storage is the directory the site builds from: the
 * article is already in place, so publishing never copies it.
 * @param {Record<string, any>} contentType
 */
function editsInPlace(contentType) {
  const storage = String(contentType?.storage?.dir || "");
  const target = String(contentType?.publish?.dir || "");
  return Boolean(storage) && Boolean(target) && path.resolve(storage) === path.resolve(target);
}

/**
 * Substitute the placeholders the server owns. The description still names a
 * literal argv; only these tokens are filled in, and each is a path the server
 * computed, never a caller-typed string.
 * @param {string[]} argv
 * @param {Record<string, string>} values
 */
function fillArgv(argv, values) {
  return argv.map((part) => Object.entries(values).reduce(
    (acc, [token, value]) => acc.split(`{${token}}`).join(value),
    String(part),
  ));
}

/**
 * @param {string} executable
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {Promise<{ exitCode: number | null, stdout: string, stderr: string, timedOut: boolean }>}
 */
function runProcess(executable, argv, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, argv, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const clip = (s) => (s.length > COMMAND_OUTPUT_LIMIT ? s.slice(0, COMMAND_OUTPUT_LIMIT) : s);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 5_000);
    }, 20 * 60_000);
    child.stdout.on("data", (chunk) => { stdout = clip(stdout + chunk.toString("utf8")); });
    child.stderr.on("data", (chunk) => { stderr = clip(stderr + chunk.toString("utf8")); });
    child.on("error", (error) => { clearTimeout(timer); reject(publishError("command_failed", String(error.message || error), 500)); });
    child.on("close", (exitCode) => { clearTimeout(timer); resolve({ exitCode, stdout, stderr, timedOut }); });
  });
}

/**
 * Run a declared command with placeholder values filled in.
 * @param {Record<string, any>} site
 * @param {string} commandId
 * @param {Record<string, string>} values
 */
async function runDeclared(site, commandId, values = {}) {
  const command = resolveCommand(site, commandId);
  const argv = fillArgv(Array.isArray(command.argv) ? command.argv : [], values);
  if (!argv.length) throw publishError("bad_command", `命令「${commandId}」没有 argv。`, 500);
  const cwd = path.resolve(String(command.cwd || site.channel?.root || ""));
  const result = await runProcess(argv[0], argv.slice(1), cwd);
  if (result.exitCode !== 0) {
    throw publishError(
      "command_failed",
      `命令「${commandId}」以退出码 ${result.exitCode} 结束：${(result.stderr || result.stdout || "").trim().slice(0, 400)}`,
      502,
    );
  }
  return result;
}

/**
 * What the writer will see: which commands would run, which file would be
 * written, and whether the site's own inputs are where the description says.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 */
/**
 * Things that make the site's own build refuse, known before it runs.
 *
 * The builder fails the whole build when a frame has no alternative text
 * (`photos.json: <id> 缺少 alt`), so publishing an article would stop on a
 * photograph that has nothing to do with it. Naming the frames here turns a
 * late, terse build failure into a list the writer can act on first.
 * @param {Record<string, any>} site
 */
function publishBlockers(site) {
  const { frames } = readFrames(site);
  const collection = Object.values(site.contentTypes || {}).find((type) => type?.storage?.kind === "json-collection");
  if (!collection) return [];
  const dir = String(collection.storage?.dir || "");
  const mediaDir = String(site.media?.dir || "");
  const blockers = [];

  const withoutAlt = frames.filter((frame) => !String(frame.alt || "").trim()).map((frame) => frame.id);
  if (withoutAlt.length) {
    blockers.push({
      code: "photos_missing_alt",
      ids: withoutAlt,
      message: `影像里有 ${withoutAlt.length} 帧还没有替代文字（${withoutAlt.join("、")}）。站点构建会因此失败——先在影像视图里补上，再发布。`,
    });
  }

  // The builder's other hard failures, checked here so they arrive as a list
  // rather than as one terse line after the normaliser has already run.
  const known = new Set(frames.map((frame) => frame.id));
  const missingFiles = frames
    .filter((frame) => frame.file && mediaDir && !fs.existsSync(path.join(mediaDir, frame.file)))
    .map((frame) => `${frame.id}→${frame.file}`);
  if (missingFiles.length) {
    blockers.push({
      code: "photos_file_missing",
      ids: missingFiles,
      message: `影像里有 ${missingFiles.length} 帧的图片文件不在目录里（${missingFiles.join("、")}）。构建会失败。`,
    });
  }

  // Stack and roll membership: read the raw file, because the ledger view only
  // carries frames.
  let data = null;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, String(collection.storage?.file || "")), "utf8"));
  } catch {
    // An unreadable collection is the media audit's business; the build will
    // report it too, and blocking here on the file's absence would be a guess.
    return blockers;
  }
  const stacks = Array.isArray(data?.stacks) ? data.stacks : [];
  const strayStack = stacks.flatMap((stack) => (Array.isArray(stack?.ids) ? stack.ids : [])
    .filter((id) => !known.has(String(id)))
    .map((id) => `${stack?.slug || "?"}:${id}`));
  if (strayStack.length) {
    blockers.push({
      code: "photos_stack_unknown_frame",
      ids: strayStack,
      message: `有叠点到了不存在的帧（${strayStack.join("、")}）。构建会失败。`,
    });
  }
  const stacked = new Set(stacks.flatMap((stack) => (Array.isArray(stack?.ids) ? stack.ids.map(String) : [])));
  const rolls = Array.isArray(data?.rolls) ? data.rolls : [];
  const rollProblems = [];
  for (const roll of rolls) {
    const ids = Array.isArray(roll?.ids) ? roll.ids.map(String) : [];
    const code = String(roll?.no ?? "").padStart(3, "0");
    for (const id of ids) {
      if (!known.has(id)) rollProblems.push(`卷 ${code}:${id}`);
      else if (!stacked.has(id)) rollProblems.push(`卷 ${code}:${id}（没归叠）`);
    }
  }
  if (rollProblems.length) {
    blockers.push({
      code: "photos_roll_unstacked",
      ids: rollProblems,
      message: `有卷里的帧不在集合或没有归叠（${rollProblems.join("、")}）。构建会失败。`,
    });
  }
  return blockers;
}

/**
 * @param {Record<string, any>} site
 */
function assertNoBlockers(site) {
  const blockers = publishBlockers(site);
  if (!blockers.length) return;
  const error = publishError("publish_blocked", blockers.map((entry) => entry.message).join("\n"), 409);
  /** @type {any} */ (error).blockers = blockers;
  throw error;
}

function planPublish(site, typeId, relPath) {
  const contentType = site.contentTypes?.[typeId];
  if (!contentType) throw publishError("unknown_content_type", `站点没有内容类型「${typeId}」。`, 404);
  const article = path.join(publishDir(contentType), String(relPath || ""));
  const inPlace = editsInPlace(contentType);
  const ids = (inPlace ? ["build-site", "deploy-site"] : ["publish-staging", "build-site", "deploy-site"]).filter((id) => (
    (site.channel?.commands || []).some((command) => command?.id === id)
  ));
  const missing = ["publish-staging", "build-site", "deploy-site"].filter((id) => !ids.includes(id));
  const blockers = publishBlockers(site);
  return {
    ok: true,
    stage: "plan",
    willRun: ids,
    missingCommands: missing,
    blockers,
    willWrite: inPlace ? [] : [article],
    editsInPlace: inPlace,
    deployRequiresConfirm: true,
    note: blockers.length
      ? blockers.map((entry) => entry.message).join("\n")
      : missing.length
        ? "站点描述的命令表缺少发布命令；先在描述里登记，再发。"
        : "准备阶段只写这一篇；部署要在确认后才跑。",
  };
}

/**
 * The staged normalise: publish.py into a temp directory over the whole draft
 * corpus (tag spelling is normalised corpus-wide, so a partial run is wrong),
 * then copy only the chosen file into the site. Files the normaliser changed
 * elsewhere are reported, not written.
 * @param {Record<string, any>} site
 * @param {string} typeId
 * @param {string} relPath
 */
async function preparePublish(site, typeId, relPath) {
  assertNoBlockers(site);
  const contentType = site.contentTypes?.[typeId];
  if (!contentType) throw publishError("unknown_content_type", `站点没有内容类型「${typeId}」。`, 404);
  if (editsInPlace(contentType)) {
    // Notes and longform are edited where the site reads them, and the site
    // tracks them in git: there is nothing to normalise and nothing to copy.
    return { ok: true, stage: "prepare", changed: false, inPlace: true, note: "这个类型直接改在站点里，发布时只需构建与部署。" };
  }
  const target = path.resolve(publishDir(contentType), String(relPath || ""));
  const drafts = String(site.tools?.draftsDir || "");
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "wensi-publish-"));
  try {
    await runDeclared(site, "publish-staging", { staging, drafts });
    const stagedFile = path.join(staging, path.basename(target));
    if (!fs.existsSync(stagedFile)) {
      throw publishError("not_ready", `底稿里没有「${path.basename(target)}」；先存稿，再发。`, 409);
    }
    const staged = fs.readFileSync(stagedFile);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (current && Buffer.compare(current, staged) === 0) {
      return { ok: true, stage: "prepare", changed: false, copied: target, drift: [], note: "站点的这篇已经是正规化后的样子，没有改写。" };
    }
    // The copy is the one write: same bytes the normaliser produced.
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, staged);
    return { ok: true, stage: "prepare", changed: true, copied: target, drift: [], bytes: staged.length };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Build the site (no deploy). A build failure stops the publish here: nothing
 * outward facing happens with a broken build.
 * @param {Record<string, any>} site
 */
async function buildSite(site) {
  const result = await runDeclared(site, "build-site");
  return { ok: true, stage: "build", exitCode: result.exitCode, output: `${result.stdout}\n${result.stderr}`.trim().slice(-4_000) };
}

/**
 * Deploy, then wait for the article URL. `expectText`, when given, must appear
 * in the page body: a 200 from a stale deployment is not a publish.
 * @param {Record<string, any>} site
 * @param {{ url?: string, expectText?: string, timeoutMs?: number }} [options]
 */
async function deploySite(site, options = {}) {
  assertNoBlockers(site);
  const result = await runDeclared(site, "deploy-site");
  const url = String(options.url || "");
  if (!url) return { ok: true, stage: "deploy", verified: false, output: `${result.stdout}\n${result.stderr}`.trim().slice(-4_000), note: "没有给网址，跳过上线确认。" };
  const deadline = Date.now() + (Number(options.timeoutMs) || VERIFY_TIMEOUT_MS);
  const expect = String(options.expectText || "").trim();
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      const text = response.ok ? await response.text() : "";
      last = { status: response.status, matched: expect ? text.includes(expect) : true };
      if (response.ok && (!expect || last.matched)) {
        return { ok: true, stage: "deploy", verified: true, url, status: response.status, output: `${result.stdout}\n${result.stderr}`.trim().slice(-4_000) };
      }
    } catch (error) {
      last = { status: 0, error: String(/** @type {any} */ (error)?.message || error) };
    }
    await new Promise((done) => setTimeout(done, VERIFY_INTERVAL_MS));
  }
  return {
    ok: false, stage: "deploy", verified: false, url,
    note: expect
      ? "部署命令跑完了，但网址还没出现这篇的新内容。Pages 常要一两分钟，稍后重试确认。"
      : "部署命令跑完了，但网址还没回 200。稍后重试确认。",
    last,
    output: `${result.stdout}\n${result.stderr}`.trim().slice(-4_000),
  };
}

module.exports = Object.freeze({ planPublish, preparePublish, buildSite, deploySite, publishBlockers, fillArgv, runDeclared, publishDir, editsInPlace });
