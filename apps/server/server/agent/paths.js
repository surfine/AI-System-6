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
//   folders.json  the folders the writer granted through the Chooser
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

function foldersFile() {
  return path.join(agentHome(), "folders.json");
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
  DSH_VERSION,
  acpSdkEntry,
  agentHome,
  assertNotTemporary,
  dshBin,
  dshInstall,
  engineStatus,
  foldersFile,
  isInside,
  legacyDshHome,
  patchDir,
  realOrSelf,
  repoRoot,
  runsRoot,
  shadowsRoot,
  temporaryRoots,
};
