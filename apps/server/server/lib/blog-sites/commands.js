// The fixed command table (固定命令表, lane C P1).
//
// A git-static site publishes through commands named in its own description
// (`channel.commands`): id, purpose, a literal argv, an optional cwd. Nothing
// else ever runs — a command id outside the description is refused before any
// process is started, and the argv is passed to spawn as an array, never
// through a shell string. P1 ships the registry and the guard; the publish
// route that calls runCommand arrives with P3, so nothing exposes it yet.

"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function commandError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * The commands a site declared, in description order.
 * @param {Record<string, any>} site
 */
function listCommands(site) {
  return Array.isArray(site?.channel?.commands) ? site.channel.commands : [];
}

/**
 * The one declared command behind an id. Anything else — including a command
 * the desk invented — is refused here, before a process exists.
 * @param {Record<string, any>} site
 * @param {string} commandId
 */
function resolveCommand(site, commandId) {
  const wanted = String(commandId || "");
  const command = listCommands(site).find((entry) => entry?.id === wanted);
  if (!command) {
    throw commandError(
      "unknown_command",
      `站点描述的命令表里没有「${wanted}」；只有描述里登记的命令可以运行。`,
      404
    );
  }
  return command;
}

/**
 * The working directory a command runs in: the command's own cwd when it has
 * one, else the site root. It must land inside the site root — a description
 * cannot point a command at an unrelated directory.
 * @param {Record<string, any>} site
 * @param {Record<string, any>} command
 */
function commandCwd(site, command) {
  const root = path.resolve(String(site.channel?.root || ""));
  if (!root) throw commandError("bad_site_description", "站点描述缺少 channel.root。", 500);
  const cwd = path.resolve(String(command.cwd || root));
  // Allowed trees: the site root and the site's own tools directory. Both are
  // named by the description and both need a folder grant before use; nothing
  // else — a description cannot point a command at an unrelated directory.
  const trees = [root, String(site.tools?.dir || "")].filter(Boolean).map((dir) => {
    const abs = path.resolve(dir);
    return abs.endsWith(path.sep) ? abs : abs + path.sep;
  });
  const inside = trees.some((tree) => cwd === tree.slice(0, -1) || cwd.startsWith(tree));
  if (!inside) {
    throw commandError("bad_command_cwd", "命令的 cwd 必须在站点根目录或站点工具目录内。", 403);
  }
  return cwd;
}

/**
 * Run one declared command and collect its output. argv goes to spawn as an
 * array (no shell), the timeout kills the process SIGTERM-then-SIGKILL, and
 * stdout/stderr are capped so a runaway publisher cannot fill memory. The
 * caller is responsible for the folder grant on the cwd — the publish route
 * (P3) checks it before calling in.
 *
 * @param {Record<string, any>} site
 * @param {string} commandId
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ id: string, purpose: string, exitCode: number | null, timedOut: boolean,
 *                     stdout: string, stderr: string, truncated: boolean }>}
 */
function runCommand(site, commandId, options = {}) {
  const command = resolveCommand(site, commandId);
  const argv = command.argv.map((part) => String(part));
  const cwd = commandCwd(site, command);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : COMMAND_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    const append = (/** @type {string} */ which) => (/** @type {Buffer} */ chunk) => {
      const current = which === "stdout" ? stdout : stderr;
      if (current.length + chunk.length > MAX_OUTPUT_BYTES) {
        truncated = true;
        child.kill("SIGKILL");
        return;
      }
      if (which === "stdout") stdout += chunk;
      else stderr += chunk;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 5_000);
    }, timeoutMs);
    child.stdout.on("data", append("stdout"));
    child.stderr.on("data", append("stderr"));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(commandError("command_failed", String(error.message || error), 500));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        id: String(command.id),
        purpose: String(command.purpose || ""),
        exitCode,
        timedOut,
        stdout,
        stderr,
        truncated,
      });
    });
  });
}

module.exports = {
  COMMAND_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  commandCwd,
  listCommands,
  resolveCommand,
  runCommand,
};
