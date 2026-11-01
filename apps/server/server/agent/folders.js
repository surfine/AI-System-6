// Shared folders (Chooser 「共享文件夹」): the real Mac folders the writer
// granted to the engine, with a level each.
//
// Why this list lives on the server, when the desk keeps its state in the
// browser: a grant is a capability over this Mac's filesystem, not project
// data. Its only trustworthy origin is the system folder dialog the server
// itself runs (`osascript choose folder`); the browser never types a path. If
// the page held the list, every run request would carry a path, and the server
// could not tell a folder the writer picked from one a script in the page
// typed. Keeping the grant here means the page only ever names an opaque id
// the server minted at the moment of choosing — the same shape as the Mac
// shell's "files are read only through the opaque id the writer chose", and
// the same place the server already keeps the writer's model keys (Keychain).
// The file holds paths and levels only, no file contents. Each run re-checks
// that the folder still exists and is still the same directory (device and
// inode), so a folder renamed or replaced behind the grant is refused.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const paths = require("./paths.js");

/** 只读 / 可提议 / 可改动, the guest bridge's three words. */
const LEVELS = Object.freeze(["read", "propose", "change"]);

/** @param {string} level */
function normalizeLevel(level) {
  const value = String(level || "").trim().toLowerCase();
  return LEVELS.includes(value) ? value : "";
}

/**
 * The lower of two levels: a run can ask for less than the grant, never more.
 * @param {string} requested
 * @param {string} granted
 */
function capLevel(requested, granted) {
  const r = LEVELS.indexOf(normalizeLevel(requested) || granted);
  const g = LEVELS.indexOf(normalizeLevel(granted));
  if (g < 0) return "";
  return LEVELS[Math.min(r < 0 ? g : r, g)];
}

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function folderError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * Folders that are never granted, whatever the dialog returned: the disk
 * root, the home folder itself and anything above it, ~/Library, system
 * locations, and the engine's own state.
 * @param {string} real
 */
function refusalFor(real) {
  const home = paths.realOrSelf(os.homedir());
  if (real === "/") return "the disk root";
  if (real === home) return "the whole home folder";
  if (paths.isInside(home, real)) return "a folder that contains the home folder";
  if (paths.isInside(real, path.join(home, "Library"))) return "the Library folder";
  for (const system of ["/System", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/private/var/db", "/Library", "/Applications"]) {
    if (paths.isInside(real, system)) return `a system location (${system})`;
  }
  const agent = paths.agentHome();
  if (paths.isInside(real, agent) || paths.isInside(agent, real)) return "the engine's own state";
  if (paths.isInside(real, paths.dshInstall())) return "the engine itself";
  if (process.env.AI_SYSTEM6_AGENT_ALLOW_TMP !== "1"
    && paths.temporaryRoots().some((root) => paths.isInside(real, root))) {
    return "a temporary folder";
  }
  return "";
}

/**
 * The one validation path every grant goes through, chosen or restored.
 * @param {string} chosen an absolute path from the folder dialog
 */
function validateFolderPath(chosen) {
  const text = String(chosen || "").trim();
  if (!path.isAbsolute(text) || text.includes("\0")) throw folderError("bad_folder", "Not an absolute folder path.");
  let real;
  try {
    real = fs.realpathSync(text);
  } catch {
    throw folderError("folder_missing", "That folder no longer exists.", 404);
  }
  const stat = fs.statSync(real);
  if (!stat.isDirectory()) throw folderError("bad_folder", "That is not a folder.");
  const refusal = refusalFor(real);
  if (refusal) throw folderError("folder_refused", `ClioTalk cannot share ${refusal}.`, 403);
  return { real, dev: stat.dev, ino: stat.ino };
}

/**
 * @typedef {object} FolderGrant
 * @property {string} id
 * @property {string} path
 * @property {string} name
 * @property {string} level
 * @property {string} grantedAt
 * @property {number} dev
 * @property {number} ino
 */

/** @returns {{ version: number, folders: FolderGrant[] }} */
function readRegistry() {
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.foldersFile(), "utf8"));
    if (parsed && Array.isArray(parsed.folders)) return { version: 1, folders: parsed.folders };
  } catch {}
  return { version: 1, folders: [] };
}

/** @param {{ version: number, folders: FolderGrant[] }} registry */
function writeRegistry(registry) {
  const file = paths.foldersFile();
  paths.assertNotTemporary(path.dirname(file));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * Grant a folder (or change an existing grant's level).
 * @param {string} chosen
 * @param {string} level
 * @returns {FolderGrant}
 */
function grantFolder(chosen, level) {
  const normalized = normalizeLevel(level);
  if (!normalized) throw folderError("bad_level", "Level must be read, propose or change.");
  const { real, dev, ino } = validateFolderPath(chosen);
  const registry = readRegistry();
  const existing = registry.folders.find((folder) => folder.path === real);
  if (existing) {
    Object.assign(existing, { level: normalized, dev, ino });
    writeRegistry(registry);
    return existing;
  }
  /** @type {FolderGrant} */
  const grant = {
    id: `fld-${crypto.randomUUID()}`,
    path: real,
    name: path.basename(real),
    level: normalized,
    grantedAt: new Date().toISOString(),
    dev,
    ino,
  };
  registry.folders.push(grant);
  writeRegistry(registry);
  return grant;
}

/** @param {FolderGrant} grant */
function grantIsAvailable(grant) {
  try {
    const { real, dev, ino } = validateFolderPath(grant.path);
    return real === grant.path && dev === grant.dev && ino === grant.ino;
  } catch {
    return false;
  }
}

function listFolders() {
  return readRegistry().folders.map((grant) => ({ ...grant, available: grantIsAvailable(grant) }));
}

/**
 * The grant behind an id, re-validated now.
 * @param {string} id
 * @returns {FolderGrant}
 */
function resolveFolder(id) {
  const grant = readRegistry().folders.find((folder) => folder.id === String(id || ""));
  if (!grant) throw folderError("folder_unknown", "No shared folder has that id.", 404);
  if (!grantIsAvailable(grant)) {
    throw folderError("folder_changed", "The shared folder moved, changed or is gone; share it again from the Chooser.", 409);
  }
  return grant;
}

/**
 * Change a grant's level. Chooser can only lower it: raising needs the folder
 * dialog again, where the writer picks the folder and the level together.
 * @param {string} id
 * @param {string} level
 * @returns {FolderGrant}
 */
function setFolderLevel(id, level) {
  const normalized = normalizeLevel(level);
  if (!normalized) throw folderError("bad_level", "Level must be read, propose or change.");
  const registry = readRegistry();
  const grant = registry.folders.find((folder) => folder.id === String(id || ""));
  if (!grant) throw folderError("folder_unknown", "No shared folder has that id.", 404);
  if (LEVELS.indexOf(normalized) > LEVELS.indexOf(grant.level)) {
    throw folderError("level_raise_refused", "A shared folder's level can only be lowered here; choose the folder again to raise it.", 403);
  }
  grant.level = normalized;
  writeRegistry(registry);
  return grant;
}

/** Eject: forget the grant. @param {string} id */
function revokeFolder(id) {
  const registry = readRegistry();
  const before = registry.folders.length;
  registry.folders = registry.folders.filter((folder) => folder.id !== String(id || ""));
  if (registry.folders.length === before) return false;
  writeRegistry(registry);
  return true;
}

/**
 * The system folder dialog, run by the server so the browser never types a
 * path. macOS only; resolves "" when the writer cancels.
 * @param {{ prompt?: string, timeoutMs?: number }} [options]
 * @returns {string}
 */
function chooseFolderWithDialog(options = {}) {
  if (process.platform !== "darwin") {
    throw folderError("chooser_unavailable", "Choosing a folder needs macOS.", 501);
  }
  const prompt = String(options.prompt || "Choose a folder to share with ClioTalk").replace(/["\\]/g, "");
  const script = `POSIX path of (choose folder with prompt "${prompt}")`;
  const result = spawnSync("/usr/bin/osascript", ["-e", script], {
    encoding: "utf8",
    timeout: options.timeoutMs || 5 * 60_000,
  });
  // -128 is "User canceled."
  if (result.status !== 0) {
    if (/-128/.test(String(result.stderr || ""))) return "";
    throw folderError("chooser_failed", "The folder dialog did not answer.", 500);
  }
  return String(result.stdout || "").trim().replace(/\/$/, "") || "/";
}

module.exports = {
  LEVELS,
  capLevel,
  chooseFolderWithDialog,
  grantFolder,
  listFolders,
  normalizeLevel,
  resolveFolder,
  revokeFolder,
  setFolderLevel,
  validateFolderPath,
};
