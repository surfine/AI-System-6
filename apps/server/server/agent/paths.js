// Where the ClioTalk engine keeps its state on this Mac.
//
// Everything lives under ~/Library/Application Support/AI System 6/agent:
//
//   shadows/<run> the APFS clones the engine works in (work/ and base/) and
//                 the run's own DSH_HOME (dsh-home/: profile, sessions)
//   dsh-home/     legacy: the DSH_HOME every run shared before 2026-10-24;
//                 only read to clean up sessions of runs started back then
//   runs/<run>    run.json, rendered per-run patches, the engine log and the
//                 pre-put-back snapshots of every original a put-back replaced
//   tasks/<task>  task.json: a writer's task and the runs (turns) it holds
//   folders.json  the folders the writer granted through the Chooser
//   schedules.json  the writer's schedules (schedules.js), beside folders.json
//
// Never under /tmp or $TMPDIR: dsh hard-codes both as writable roots for its
// own fence, so a shadow there would have no boundary at all (spike Q2).

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** The one dsh version this server knows how to drive (tooling/dsh-slim). */
const DSH_VERSION = "0.2.1-rc.3";

const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

function agentHome() {
  const override = String(process.env.AI_SYSTEM6_AGENT_HOME || "").trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), "Library", "Application Support", "AI System 6", "agent");
}

/** The shared DSH_HOME of runs started before each run had its own. */
function legacyDshHome() {
  return path.join(agentHome(), "dsh-home");
}

function shadowsRoot() {
  return path.join(agentHome(), "shadows");
}

function runsRoot() {
  return path.join(agentHome(), "runs");
}

function tasksRoot() {
  return path.join(agentHome(), "tasks");
}

function foldersFile() {
  return path.join(agentHome(), "folders.json");
}

function schedulesFile() {
  return path.join(agentHome(), "schedules.json");
}

function patchDir() {
  return path.join(__dirname, "patches");
}

/** The slim install built by tooling/build-dsh-slim.mjs (or an override). */
function dshInstall() {
  const override = String(process.env.AI_SYSTEM6_DSH_INSTALL || "").trim();
  if (override) return path.resolve(override);
  return path.join(repoRoot, "vendor-runtime", "dsh", DSH_VERSION);
}

function dshBin(install = dshInstall()) {
  return path.join(install, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}

function acpSdkEntry(install = dshInstall()) {
  return path.join(install, "node_modules", "@agentclientprotocol", "sdk", "dist", "acp.js");
}

/** @returns {{ installed: boolean, version: string, path: string }} */
function engineStatus() {
  const install = dshInstall();
  let installed = false;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(install, "MANIFEST.json"), "utf8"));
    installed = manifest.version === DSH_VERSION && fs.existsSync(dshBin(install));
  } catch {
    installed = fs.existsSync(dshBin(install));
  }
  return { installed, version: DSH_VERSION, path: install };
}

/**
 * Claude Code as a Clio engine (engine `claude-code`): Zed's ACP adapter
 * `@agentclientprotocol/claude-agent-acp` (formerly `@zed-industries/
 * claude-code-acp`) and the native Claude Code binary its Agent SDK ships
 * (`@anthropic-ai/claude-agent-sdk-darwin-arm64`), installed together
 * with `npm install --ignore-scripts` into one folder. The pins are the
 * versions this host was checked against; another install is refused.
 */
const CLAUDE_ACP_VERSION = "0.99.1";
/** The Agent SDK binary package; it carries Claude Code 2.1.312 (`claude --version`). */
const CLAUDE_SDK_VERSION = "0.3.312";
const CLAUDE_CLI_VERSION = "2.1.312";

/** The adapter install (or AI_SYSTEM6_CLAUDE_ACP_INSTALL). */
function claudeAcpInstall() {
  const override = String(process.env.AI_SYSTEM6_CLAUDE_ACP_INSTALL || "").trim();
  if (override) return path.resolve(override);
  return path.join(repoRoot, "vendor-runtime", "claude-agent-acp", CLAUDE_ACP_VERSION);
}

/** @param {string} [install] */
function claudeAcpEntry(install = claudeAcpInstall()) {
  return path.join(install, "node_modules", "@agentclientprotocol", "claude-agent-acp", "dist", "index.js");
}

/** The native Claude Code binary inside the adapter install. @param {string} [install] */
function claudeCliBin(install = claudeAcpInstall()) {
  return path.join(install, "node_modules", "@anthropic-ai", `claude-agent-sdk-${process.platform}-${process.arch}`, "claude");
}

/**
 * Is the Claude Code engine here, at the pinned versions? Reads two
 * package.json files; never runs anything.
 * @returns {{ installed: boolean, adapterVersion: string, sdkVersion: string, cliVersion: string, reason: string }}
 */
function claudeEngineStatus() {
  const install = claudeAcpInstall();
  const version = (/** @type {string} */ file) => {
    try { return String(JSON.parse(fs.readFileSync(file, "utf8")).version || ""); } catch { return ""; }
  };
  const adapterVersion = version(path.join(install, "node_modules", "@agentclientprotocol", "claude-agent-acp", "package.json"));
  const sdkVersion = version(path.join(path.dirname(claudeCliBin(install)), "package.json"));
  let reason = "";
  if (!adapterVersion || !fs.existsSync(claudeAcpEntry(install))) reason = "adapter_missing";
  else if (!fs.existsSync(claudeCliBin(install))) reason = "cli_missing";
  else if (adapterVersion !== CLAUDE_ACP_VERSION) reason = "adapter_version";
  else if (sdkVersion !== CLAUDE_SDK_VERSION) reason = "cli_version";
  return { installed: !reason, adapterVersion, sdkVersion, cliVersion: sdkVersion === CLAUDE_SDK_VERSION ? CLAUDE_CLI_VERSION : "", reason };
}

/**
 * Codex as a Clio engine (engine `codex`): `@agentclientprotocol/codex-acp`
 * (formerly `@zed-industries/codex-acp`), a TypeScript adapter over
 * `codex app-server`, and the native Codex binary it depends on
 * (`@openai/codex-darwin-arm64`), installed together like Claude Code's.
 */
const CODEX_ACP_VERSION = "2.5.0";
const CODEX_CLI_VERSION = "0.165.0";

/** The adapter install (or AI_SYSTEM6_CODEX_ACP_INSTALL). */
function codexAcpInstall() {
  const override = String(process.env.AI_SYSTEM6_CODEX_ACP_INSTALL || "").trim();
  if (override) return path.resolve(override);
  return path.join(repoRoot, "vendor-runtime", "codex-acp", CODEX_ACP_VERSION);
}

/** @param {string} [install] */
function codexAcpEntry(install = codexAcpInstall()) {
  return path.join(install, "node_modules", "@agentclientprotocol", "codex-acp", "dist", "index.js");
}

/** The native Codex binary inside the adapter install. @param {string} [install] */
function codexCliBin(install = codexAcpInstall()) {
  const triple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  return path.join(install, "node_modules", "@openai", `codex-${process.platform}-${process.arch}`, "vendor", triple, "bin", "codex");
}

/**
 * The writer's Codex sign-in (ChatGPT login): `$CODEX_HOME/auth.json` of the
 * server's own environment, else ~/.codex/auth.json. A run reads this one
 * file and nothing else of the writer's Codex folder.
 */
function codexLoginFile() {
  const home = String(process.env.CODEX_HOME || "").trim() || path.join(os.homedir(), ".codex");
  return path.join(home, "auth.json");
}

/** @returns {{ installed: boolean, adapterVersion: string, cliVersion: string, reason: string }} */
function codexEngineStatus() {
  const install = codexAcpInstall();
  const version = (/** @type {string} */ file) => {
    try { return String(JSON.parse(fs.readFileSync(file, "utf8")).version || ""); } catch { return ""; }
  };
  const adapterVersion = version(path.join(install, "node_modules", "@agentclientprotocol", "codex-acp", "package.json"));
  const cliVersion = version(path.join(install, "node_modules", "@openai", `codex-${process.platform}-${process.arch}`, "package.json")).replace(/-.*$/, "");
  let reason = "";
  if (!adapterVersion || !fs.existsSync(codexAcpEntry(install))) reason = "adapter_missing";
  else if (!fs.existsSync(codexCliBin(install))) reason = "cli_missing";
  else if (adapterVersion !== CODEX_ACP_VERSION) reason = "adapter_version";
  else if (cliVersion !== CODEX_CLI_VERSION) reason = "cli_version";
  return { installed: !reason, adapterVersion, cliVersion, reason };
}

function realOrSelf(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

/** True when a path sits inside (or is) another. Both are realpath'd first. */
function isInside(child, parent) {
  const c = realOrSelf(child);
  const p = realOrSelf(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/** Temporary roots dsh treats as writable whatever we say. */
function temporaryRoots() {
  return [...new Set(["/tmp", "/private/tmp", os.tmpdir()].map(realOrSelf))];
}

/**
 * Refuse a state root under a temporary directory. Contracts run in a temp
 * folder and say so with AI_SYSTEM6_AGENT_ALLOW_TMP=1; nothing ships it.
 * @param {string} value
 */
function assertNotTemporary(value) {
  if (process.env.AI_SYSTEM6_AGENT_ALLOW_TMP === "1") return;
  if (temporaryRoots().some((root) => isInside(value, root))) {
    const error = new Error(`Agent state may not live under a temporary directory: ${value}`);
    /** @type {any} */ (error).code = "agent_home_temporary";
    throw error;
  }
}

module.exports = {
  CLAUDE_ACP_VERSION,
  CLAUDE_CLI_VERSION,
  CLAUDE_SDK_VERSION,
  DSH_VERSION,
  acpSdkEntry,
  claudeAcpEntry,
  claudeAcpInstall,
  claudeCliBin,
  claudeEngineStatus,
  CODEX_ACP_VERSION,
  CODEX_CLI_VERSION,
  codexAcpEntry,
  codexAcpInstall,
  codexCliBin,
  codexEngineStatus,
  codexLoginFile,
  agentHome,
  assertNotTemporary,
  dshBin,
  dshInstall,
  engineStatus,
  foldersFile,
  schedulesFile,
  isInside,
  legacyDshHome,
  patchDir,
  realOrSelf,
  repoRoot,
  runsRoot,
  shadowsRoot,
  tasksRoot,
  temporaryRoots,
};
