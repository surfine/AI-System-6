// The upload bundle a cloud run starts from, and the changes it returns.
//
// The browser sends only the Project Hard Disk items the visitor ticked, as
//   { path, encoding: "utf8" | "base64", content, sha256, id? }
// The server checks every path (relative, inside the workspace, no engine
// TMPDIR), every hash (sha-256 of the decoded bytes) and the caps, then writes
// the files twice under the run's directory: base/ (what was uploaded, never
// mounted) and work/ (the engine's /work). Changes are work/ against base/
// with shadow.js's own diff, plus the new bytes, so the page can apply them to
// IndexedDB itself. There is no put-back on the server.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { listChangesAsync, readNoFollowAsync, safeRelative } = require("../agent/shadow.js");

const MAX_PATH_CHARS = 400;
const MAX_ID_CHARS = 120;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function bundleError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/** @param {Buffer | Uint8Array} bytes */
function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * @typedef {{ path: string, bytes: Buffer, sha256: string, id: string, encoding: "utf8" | "base64" }} BundleFile
 */

/**
 * Validate and decode an upload bundle against one allowance's caps.
 * @param {any} files
 * @param {{ maxUploadBytes: number, maxUploadFiles: number }} caps
 * @returns {BundleFile[]}
 */
function parseBundle(files, caps) {
  if (!Array.isArray(files)) throw bundleError("agent_cloud_bad_bundle", "files must be a list.");
  if (files.length > caps.maxUploadFiles) {
    throw bundleError("agent_cloud_too_many_files", `A run takes at most ${caps.maxUploadFiles} files.`, 413);
  }
  /** @type {BundleFile[]} */
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const entry of files) {
    if (!entry || typeof entry !== "object") throw bundleError("agent_cloud_bad_bundle", "Each file must be an object.");
    const rawPath = String(entry.path || "");
    if (rawPath.length > MAX_PATH_CHARS || /[\u0000-\u001f]/.test(rawPath)) {
      throw bundleError("agent_cloud_bad_path", `Not a usable path: ${rawPath.slice(0, 80)}`);
    }
    let rel;
    try {
      rel = safeRelative(rawPath);
    } catch {
      throw bundleError("agent_cloud_bad_path", `Not a path inside the workspace: ${rawPath.slice(0, 80)}`);
    }
    if (rel.split("/").some((part) => part === "" || part === "." || part === ".." || Buffer.byteLength(part) > 255)) {
      throw bundleError("agent_cloud_bad_path", `Not a usable path: ${rawPath.slice(0, 80)}`);
    }
    const key = rel.normalize("NFC");
    if (seen.has(key)) throw bundleError("agent_cloud_bad_bundle", `The same path appears twice: ${rel}`);
    seen.add(key);
    const encoding = entry.encoding === "base64" ? "base64" : entry.encoding === "utf8" ? "utf8" : "";
    if (!encoding || typeof entry.content !== "string") {
      throw bundleError("agent_cloud_bad_bundle", `File ${rel} needs encoding utf8 or base64 and string content.`);
    }
    const bytes = encoding === "base64" ? Buffer.from(entry.content, "base64") : Buffer.from(entry.content, "utf8");
    total += bytes.length;
    if (total > caps.maxUploadBytes) {
      throw bundleError("agent_cloud_upload_too_large", `A run takes at most ${caps.maxUploadBytes} bytes of files.`, 413);
    }
    const digest = sha256(bytes);
    if (String(entry.sha256 || "").toLowerCase() !== digest) {
      throw bundleError("agent_cloud_bundle_hash_mismatch", `File ${rel} does not match its sha256.`);
    }
    const id = String(entry.id || "").slice(0, MAX_ID_CHARS);
    out.push({ path: rel, bytes, sha256: digest, id, encoding });
  }
  // A file cannot also be a folder: `a` and `a/b` together would fail half
  // way through writing the workspace.
  for (const file of out) {
    const parts = file.path.normalize("NFC").split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      const prefix = parts.slice(0, depth).join("/");
      if (seen.has(prefix)) {
        throw bundleError("agent_cloud_path_collision", `${prefix} is both a file and a folder in this upload.`);
      }
    }
  }
  return out;
}

/**
 * Write the bundle into base/ and work/ under the run directory. work/ is
 * world-writable: the container's user is a mapped uid that does not own it.
 * @param {string} runDir
 * @param {BundleFile[]} files
 */
function writeWorkspace(runDir, files) {
  const base = path.join(runDir, "base");
  const work = path.join(runDir, "work");
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  fs.mkdirSync(work, { recursive: true, mode: 0o777 });
  fs.chmodSync(work, 0o777);
  // The proposal channel, pre-made like the Mac host pre-makes it (the run's
  // preamble says it exists). Same world-writable mode: the container's user
  // writes candidates here, and the host harvests them once it is gone.
  const channel = path.join(work, ".ais6-proposals");
  fs.mkdirSync(channel, { recursive: true, mode: 0o777 });
  fs.chmodSync(channel, 0o777);
  for (const file of files) {
    for (const [root, mode] of [[base, 0o600], [work, 0o666]]) {
      const target = path.join(/** @type {string} */ (root), ...file.path.split("/"));
      let dir = path.dirname(target);
      const made = fs.mkdirSync(dir, { recursive: true, mode: root === work ? 0o777 : 0o700 });
      if (made && root === work) {
        // mkdirSync's mode is masked by the umask; open each new level up.
        for (let current = dir; current.startsWith(work) && current !== work; current = path.dirname(current)) {
          fs.chmodSync(current, 0o777);
        }
      }
      fs.writeFileSync(target, file.bytes, { mode: /** @type {number} */ (mode), flag: "wx" });
      fs.chmodSync(target, /** @type {number} */ (mode));
    }
  }
  /** @type {Record<string, { sha256: string, id: string, size: number }>} */
  const manifest = {};
  for (const file of files) manifest[file.path] = { sha256: file.sha256, id: file.id, size: file.bytes.length };
  fs.writeFileSync(path.join(runDir, "upload.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
  return { base, work };
}

/**
 * Bytes, files and folders under a directory, without following links and
 * without blocking the server. A link or other non-folder entry counts as a
 * file. Stops once either count passes `stopAt` (the watchdog only needs to
 * know a cap was passed).
 * @param {string} root
 * @param {{ stopAt?: number }} [options]
 * @returns {Promise<{ bytes: number, files: number, dirs: number }>}
 */
async function workspaceUsage(root, options = {}) {
  const stopAt = Number(options.stopAt) || Infinity;
  let bytes = 0;
  let files = 0;
  let dirs = 0;
  const stack = [root];
  while (stack.length && files <= stopAt && dirs <= stopAt) {
    const dir = /** @type {string} */ (stack.pop());
    let entries;
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        dirs += 1;
        stack.push(full);
        continue;
      }
      files += 1;
      if (entry.isFile()) {
        try { bytes += (await fs.promises.lstat(full)).size; } catch {}
      }
    }
  }
  return { bytes, files, dirs };
}

/**
 * The run's changes for the page: shadow.js's diff of work/ against base/,
 * with the new bytes and the uploaded hash each change was made against.
 * Async (reads and diffs never block the server), and no path is followed
 * through a link. runs.js computes it once per finished run.
 * @param {string} runDir
 * @param {{ maxFiles?: number }} [options]
 */
async function cloudChanges(runDir, options = {}) {
  const base = path.join(runDir, "base");
  const work = path.join(runDir, "work");
  if (!fs.existsSync(work)) return { changes: [], links: [] };
  /** @type {Record<string, { sha256: string, id: string }>} */
  let manifest = {};
  try { manifest = JSON.parse(await fs.promises.readFile(path.join(runDir, "upload.json"), "utf8")); } catch {}
  const { changes, links } = await listChangesAsync({ base, work }, { diffs: true, maxFiles: options.maxFiles });
  const out = [];
  const raced = [];
  for (const change of changes) {
    const uploaded = manifest[change.path] || null;
    /** @type {Record<string, unknown>} */
    const entry = {
      ...change,
      id: uploaded?.id || "",
      baseSha256: uploaded?.sha256 || null,
      sha256: null,
    };
    if (change.kind !== "deleted") {
      let bytes;
      try {
        ({ bytes } = await readNoFollowAsync(work, change.path));
      } catch {
        raced.push(change.path);
        continue;
      }
      entry.sha256 = sha256(bytes);
      if (change.binary) entry.contentBase64 = bytes.toString("base64");
      else entry.content = bytes.toString("utf8");
    }
    out.push(entry);
  }
  return { changes: out, links: [...new Set([...links, ...raced])].sort() };
}

/**
 * Change counts for the `changes` event.
 * @param {string} runDir
 * @param {{ maxFiles?: number }} [options]
 */
async function changeCounts(runDir, options = {}) {
  const base = path.join(runDir, "base");
  const work = path.join(runDir, "work");
  const { changes } = await listChangesAsync({ base, work }, { maxFiles: options.maxFiles });
  const count = (/** @type {string} */ kind) => changes.filter((change) => change.kind === kind).length;
  return { count: changes.length, added: count("added"), modified: count("modified"), deleted: count("deleted") };
}

module.exports = {
  bundleError,
  changeCounts,
  cloudChanges,
  parseBundle,
  sha256,
  workspaceUsage,
  writeWorkspace,
};
