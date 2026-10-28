// Shadow copies: the engine never writes a writer's real folder.
//
// A run gets two clones of the mounted folder under shadows/<run>/:
//
//   base/  the folder as it was when the run started (the engine never sees it)
//   work/  the engine's cwd; every write it makes lands here
//
// On APFS both are `cp -c` clones (clonefile(2)), so a large folder costs
// nothing until a file changes; elsewhere they fall back to a plain copy.
// `baseline.json` (in the run's state dir) records each real file's size and
// mtime at clone time; together with base/ it answers "did someone change the
// real file since?" without hashing the folder up front.
//
// Put-back is the writer's commit: the server, not the engine, copies the
// chosen files from work/ into the real folder. A real file that changed
// since the clone is a conflict and is not overwritten unless the writer names
// it; a delete is never applied unless the writer confirms that one path; and
// every original a put-back replaces or moves to the Trash is first copied to
// runs/<run>/putback/<stamp>/.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

/** The engine's TMPDIR inside work/; never part of a diff or a put-back. */
const TMP_NAME = ".ais6-tmp";
/**
 * The engine's proposal channel inside work/ (proposals.js). Like TMP_NAME it
 * never appears in a walk, diff or put-back — but unlike TMP_NAME the engine
 * is meant to write here: one candidate proposal per JSON file. The sandbox
 * profile makes the directory write-only for the engine (sandbox-profile.js),
 * and runs.js harvests it into runs/<run>/proposals/ when the engine exits.
 */
const PROPOSALS_NAME = ".ais6-proposals";
const IGNORED_NAMES = new Set([TMP_NAME, PROPOSALS_NAME, ".DS_Store"]);
/**
 * Environment-layer names (`.env`, `.env.local`, `.envrc`, …). They never cross
 * the shadow boundary in either direction: the engine must not read the
 * author's keys out of the working copy, and a `.env*` the engine writes
 * inside the shadow is never listed, diffed or put back (owner's call,
 * 2026-10-26).
 * @param {string} name
 */
function isEnvLayer(name) {
  return name.startsWith(".env");
}
const MAX_FILES = 20_000;
const TEXT_DIFF_LIMIT = 1024 * 1024;
/**
 * Names a put-back refuses: bidi embeddings, overrides and isolates, the
 * LRM/RLM marks and C0/C1 controls can make a name read as another file.
 */
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

/**
 * @param {string} code
 * @param {string} message
 * @param {number} [statusCode]
 */
function shadowError(code, message, statusCode = 400) {
  const error = new Error(message);
  /** @type {any} */ (error).code = code;
  /** @type {any} */ (error).statusCode = statusCode;
  return error;
}

/**
 * Relative file paths (POSIX separators) under a root, skipping the engine's
 * TMPDIR and Finder litter. Symlinks are listed separately: they are never
 * put back.
 * @param {string} root
 */
function walk(root) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const links = [];
  /** @param {string} dir @param {string} prefix */
  function visit(dir, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {any} */ (error).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name) || isEnvLayer(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) links.push(rel);
      else if (entry.isDirectory()) visit(path.join(dir, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
      if (files.length > MAX_FILES) {
        throw shadowError("folder_too_large", `This folder has more than ${MAX_FILES} files; mount a smaller folder.`, 413);
      }
    }
  }
  visit(root, "");
  return { files: files.sort(), links: links.sort() };
}

/**
 * lstat every level of `rel` under `root` and refuse a link anywhere on the
 * way: the walk lists links apart, but a path read later must still not be
 * one (a link swapped in after the walk would read a file outside the run).
 * @param {string} root
 * @param {string} rel  POSIX relative path
 * @returns {string} the absolute path, a regular file
 */
function noLinkPath(root, rel) {
  let current = root;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw shadowError("link_refused", `This path is a link and is never read or put back: ${rel}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    }
  }
  return current;
}

/** O_NOFOLLOW where the platform has it (macOS and Linux do). */
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

/**
 * Read a file under `root` without following a link at any level.
 * @param {string} root
 * @param {string} rel
 * @returns {{ bytes: Buffer, mode: number }}
 */
function readNoFollow(root, rel) {
  const file = noLinkPath(root, rel);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    return { bytes: fs.readFileSync(fd), mode: stat.mode & 0o777 };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The async twin of readNoFollow, for the cloud host's request path.
 * @param {string} root
 * @param {string} rel
 */
async function readNoFollowAsync(root, rel) {
  let current = root;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await fs.promises.lstat(current);
    if (stat.isSymbolicLink()) throw shadowError("link_refused", `This path is a link and is never read or put back: ${rel}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) throw shadowError("not_a_file", `Not a regular file: ${rel}`);
  }
  const handle = await fs.promises.open(current, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    return { bytes: await handle.readFile(), mode: stat.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

/** @param {string} file */
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Clone `source` into `dest` (which must not exist). APFS clonefile when it
 * works, a recursive copy when it does not.
 * @param {string} source
 * @param {string} dest
 * @param {{ forceCopy?: boolean }} [options]
 * @returns {"clonefile" | "copy"}
 */
function cloneTree(source, dest, options = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!options.forceCopy && process.platform === "darwin") {
    // `cp -c` asks for clonefile(2); -p keeps mtimes so base/ mirrors the real
    // folder's timestamps. `source/.` copies the contents, not the folder.
    fs.mkdirSync(dest);
    const result = spawnSync("/bin/cp", ["-c", "-R", "-p", `${source}/.`, dest], { encoding: "utf8" });
    if (result.status === 0) return "clonefile";
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(source, dest, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  return "copy";
}

/**
 * Normalise a writer-chosen relative path and refuse anything that leaves the
 * folder.
 * @param {string} rel
 */
function safeRelative(rel) {
  const text = String(rel || "").replaceAll("\\", "/");
  const normal = path.posix.normalize(text);
  if (!text || path.posix.isAbsolute(text) || normal.startsWith("../") || normal === ".." || normal === "."
    || text.includes("\0") || normal.split("/").some((part) => IGNORED_NAMES.has(part))) {
    throw shadowError("bad_path", `Not a path inside this folder: ${rel}`);
  }
  return normal;
}

/**
 * The real target for a relative path, refusing a parent directory that a
 * symlink inside the real folder redirects elsewhere.
 * @param {string} realRoot realpath of the mounted folder
 * @param {string} rel
 */
function realTarget(realRoot, rel) {
  const target = path.join(realRoot, ...rel.split("/"));
  let parent = path.dirname(target);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  const resolvedParent = fs.realpathSync(parent);
  if (resolvedParent !== realRoot && !resolvedParent.startsWith(realRoot + path.sep)) {
    throw shadowError("bad_path", `This path leaves the folder through a link: ${rel}`);
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
    throw shadowError("bad_path", `This path is a link in the real folder: ${rel}`);
  }
  return target;
}

/** @param {Buffer} buffer */
function looksBinary(buffer) {
  return buffer.subarray(0, 8192).includes(0);
}

/**
 * The system diff's argv. It reads the two sides from inherited descriptors
 * 3 and 4 (files this process opened with O_NOFOLLOW), never by path, so a
 * link cannot redirect it.
 * @param {boolean} hasBefore
 * @param {boolean} hasAfter
 * @param {string} rel
 */
function diffArgs(hasBefore, hasAfter, rel) {
  return [
    "-u",
    "--label", hasBefore ? `a/${rel}` : "/dev/null",
    "--label", hasAfter ? `b/${rel}` : "/dev/null",
    hasBefore ? "/dev/fd/3" : "/dev/null",
    hasAfter ? "/dev/fd/4" : "/dev/null",
  ];
}

/**
 * Open the two sides of a diff without following links.
 * @param {string | null} beforeRoot
 * @param {string | null} afterRoot
 * @param {string} rel
 */
function openDiffSides(beforeRoot, afterRoot, rel) {
  /** @type {number[]} */
  const fds = [];
  try {
    for (const root of [beforeRoot, afterRoot]) {
      fds.push(root ? fs.openSync(noLinkPath(root, rel), fs.constants.O_RDONLY | NOFOLLOW) : fs.openSync("/dev/null", "r"));
    }
  } catch (error) {
    for (const fd of fds) fs.closeSync(fd);
    throw error;
  }
  return fds;
}

/**
 * Unified diff of one path in two trees (either side may be absent).
 * @param {string | null} beforeRoot
 * @param {string | null} afterRoot
 * @param {string} rel
 */
function unifiedDiff(beforeRoot, afterRoot, rel) {
  const fds = openDiffSides(beforeRoot, afterRoot, rel);
  try {
    const result = spawnSync("diff", diffArgs(Boolean(beforeRoot), Boolean(afterRoot), rel), {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe", fds[0], fds[1]],
    });
    // diff exits 1 when the files differ; 2 is trouble.
    if (result.status === 2 || result.error) return "";
    return result.stdout;
  } finally {
    for (const fd of fds) fs.closeSync(fd);
  }
}

/**
 * The async twin of unifiedDiff: the server keeps answering while diff runs.
 * @param {string | null} beforeRoot
 * @param {string | null} afterRoot
 * @param {string} rel
 * @returns {Promise<string>}
 */
async function unifiedDiffAsync(beforeRoot, afterRoot, rel) {
  const fds = openDiffSides(beforeRoot, afterRoot, rel);
  try {
    return await new Promise((resolve) => {
      const child = spawn("diff", diffArgs(Boolean(beforeRoot), Boolean(afterRoot), rel), {
        stdio: ["ignore", "pipe", "ignore", fds[0], fds[1]],
      });
      /** @type {Buffer[]} */
      const chunks = [];
      let bytes = 0;
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes <= 8 * 1024 * 1024) chunks.push(chunk);
        else child.kill("SIGKILL");
      });
      child.on("error", () => resolve(""));
      child.on("close", (code) => resolve(code === 2 || bytes > 8 * 1024 * 1024 ? "" : Buffer.concat(chunks).toString("utf8")));
    });
  } finally {
    for (const fd of fds) fs.closeSync(fd);
  }
}

/**
 * @typedef {object} Shadow
 * @property {string} root      shadows/<run>
 * @property {string} work      shadows/<run>/work (the engine's cwd)
 * @property {string} base      shadows/<run>/base
 * @property {string} tmp       work/.ais6-tmp (the engine's TMPDIR)
 * @property {string} proposals work/.ais6-proposals (the engine's write-only proposal channel)
 * @property {string} realRoot  realpath of the mounted folder
 * @property {string} stateDir  runs/<run>
 * @property {"clonefile" | "copy"} method
 */

/**
 * Unlink every `.env*` file (or link) under `root`. Used on the two clones
 * only — the real folder is never touched. The walk already hides these names
 * from every listing, so this sweep needs its own recursion.
 * @param {string} dir
 */
function removeEnvLayers(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) removeEnvLayers(full);
    else if (isEnvLayer(entry.name)) fs.rmSync(full, { force: true });
  }
}

/**
 * @param {{ source: string, shadowRoot: string, stateDir: string, forceCopy?: boolean }} input
 * @returns {Shadow}
 */
function createShadow(input) {
  const realRoot = fs.realpathSync(input.source);
  if (!fs.statSync(realRoot).isDirectory()) throw shadowError("not_a_folder", "The mounted path is not a folder.");
  if (fs.existsSync(input.shadowRoot)) throw shadowError("shadow_exists", "This run already has a shadow.", 409);
  const listing = walk(realRoot);
  const base = path.join(input.shadowRoot, "base");
  const work = path.join(input.shadowRoot, "work");
  const method = cloneTree(realRoot, base, { forceCopy: input.forceCopy });
  cloneTree(base, work, { forceCopy: input.forceCopy || method === "copy" });
  // The engine reads files straight off work/, so the environment layers are
  // removed from disk as well as from every listing.
  removeEnvLayers(base);
  removeEnvLayers(work);
  // The engine's TMPDIR. A folder that already has one keeps it out of base/
  // and work/ alike: IGNORED_NAMES hides it from diffs and put-back.
  const tmp = path.join(work, TMP_NAME);
  fs.mkdirSync(tmp, { recursive: true });
  // The proposal channel, pre-made so even a 只读 run (whose sandbox may write
  // this directory but nothing else under work/) can use it.
  fs.mkdirSync(path.join(work, PROPOSALS_NAME), { recursive: true });
  /** @type {Record<string, { size: number, mtimeMs: number }>} */
  const baseline = {};
  for (const rel of listing.files) {
    const stat = fs.statSync(path.join(realRoot, ...rel.split("/")));
    baseline[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
  }
  fs.mkdirSync(input.stateDir, { recursive: true });
  fs.writeFileSync(path.join(input.stateDir, "baseline.json"), `${JSON.stringify({ realRoot, method, files: baseline }, null, 2)}\n`);
  return { root: input.shadowRoot, work, base, tmp, proposals: path.join(work, PROPOSALS_NAME), realRoot, stateDir: input.stateDir, method };
}

/**
 * Re-open a shadow from disk (after a server restart).
 * @param {{ shadowRoot: string, stateDir: string }} input
 * @returns {Shadow}
 */
function openShadow(input) {
  const baseline = readBaseline(input.stateDir);
  return {
    root: input.shadowRoot,
    work: path.join(input.shadowRoot, "work"),
    base: path.join(input.shadowRoot, "base"),
    tmp: path.join(input.shadowRoot, "work", TMP_NAME),
    proposals: path.join(input.shadowRoot, "work", PROPOSALS_NAME),
    realRoot: baseline.realRoot,
    stateDir: input.stateDir,
    method: baseline.method,
  };
}

/** @param {string} stateDir */
function readBaseline(stateDir) {
  return JSON.parse(fs.readFileSync(path.join(stateDir, "baseline.json"), "utf8"));
}

/**
 * @typedef {object} Change
 * @property {string} path
 * @property {"added" | "modified" | "deleted"} kind
 * @property {boolean} binary
 * @property {number | null} sizeBefore
 * @property {number | null} sizeAfter
 * @property {string} [diff]   unified diff (text files up to 1 MiB)
 */

/**
 * What the engine changed: work/ against base/.
 * @param {Shadow} shadow
 * @param {{ diffs?: boolean }} [options]
 * @returns {{ changes: Change[], links: string[] }}
 */
function listChanges(shadow, options = {}) {
  const before = walk(shadow.base);
  const after = walk(shadow.work);
  const beforeSet = new Set(before.files);
  const afterSet = new Set(after.files);
  /** @type {Change[]} */
  const changes = [];
  /** @type {string[]} */
  const raced = [];
  for (const rel of [...new Set([...before.files, ...after.files])].sort()) {
    let change;
    try {
      const a = beforeSet.has(rel) ? readNoFollow(shadow.base, rel).bytes : null;
      const b = afterSet.has(rel) ? readNoFollow(shadow.work, rel).bytes : null;
      change = compareSides(rel, a, b);
    } catch (error) {
      // Became a link (or vanished) after the walk: reported as a link.
      if (["link_refused", "not_a_file", "ENOENT"].includes(String(/** @type {any} */ (error)?.code))) {
        raced.push(rel);
        continue;
      }
      throw error;
    }
    if (!change) continue;
    if (options.diffs && !change.binary && Math.max(change.sizeBefore || 0, change.sizeAfter || 0) <= TEXT_DIFF_LIMIT) {
      try {
        change.diff = unifiedDiff(beforeSet.has(rel) ? shadow.base : null, afterSet.has(rel) ? shadow.work : null, rel);
      } catch {
        change.diff = "";
      }
    }
    changes.push(change);
  }
  return { changes, links: newLinks(before.links, after.links, raced) };
}

/**
 * One path's change from its two sides' bytes, or null when they are equal.
 * @param {string} rel
 * @param {Buffer | null} a  base/ bytes
 * @param {Buffer | null} b  work/ bytes
 * @returns {Change | null}
 */
function compareSides(rel, a, b) {
  let kind = null;
  if (a && !b) kind = "deleted";
  else if (!a && b) kind = "added";
  else if (a && b && !a.equals(b)) kind = "modified";
  if (!kind) return null;
  const sample = /** @type {Buffer} */ (b || a);
  return { path: rel, kind, binary: looksBinary(sample), sizeBefore: a ? a.length : null, sizeAfter: b ? b.length : null };
}

/**
 * Links the engine created (never put back), plus paths that turned into one
 * between the walk and the read.
 * @param {string[]} baseLinks
 * @param {string[]} workLinks
 * @param {string[]} raced
 */
function newLinks(baseLinks, workLinks, raced) {
  const known = new Set(baseLinks);
  return [...new Set([...workLinks.filter((rel) => !known.has(rel)), ...raced])].sort();
}

/**
 * walk() without blocking the event loop, with its own file cap.
 * @param {string} root
 * @param {number} [maxFiles]
 */
async function walkAsync(root, maxFiles = MAX_FILES) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const links = [];
  /** @param {string} dir @param {string} prefix */
  async function visit(dir, prefix) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {any} */ (error).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name) || isEnvLayer(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) links.push(rel);
      else if (entry.isDirectory()) await visit(path.join(dir, entry.name), rel);
      else if (entry.isFile()) files.push(rel);
      if (files.length > maxFiles) {
        throw shadowError("folder_too_large", `This folder has more than ${maxFiles} files.`, 413);
      }
    }
  }
  await visit(root, "");
  return { files: files.sort(), links: links.sort() };
}

/**
 * listChanges for the cloud host: async reads and diffs, so one visitor's
 * large result never stalls the server for everyone else.
 * @param {{ base: string, work: string }} shadow
 * @param {{ diffs?: boolean, maxFiles?: number }} [options]
 * @returns {Promise<{ changes: Change[], links: string[] }>}
 */
async function listChangesAsync(shadow, options = {}) {
  const before = await walkAsync(shadow.base, options.maxFiles);
  const after = await walkAsync(shadow.work, options.maxFiles);
  const beforeSet = new Set(before.files);
  const afterSet = new Set(after.files);
  /** @type {Change[]} */
  const changes = [];
  /** @type {string[]} */
  const raced = [];
  for (const rel of [...new Set([...before.files, ...after.files])].sort()) {
    let change;
    try {
      const a = beforeSet.has(rel) ? (await readNoFollowAsync(shadow.base, rel)).bytes : null;
      const b = afterSet.has(rel) ? (await readNoFollowAsync(shadow.work, rel)).bytes : null;
      change = compareSides(rel, a, b);
    } catch (error) {
      if (["link_refused", "not_a_file", "ENOENT"].includes(String(/** @type {any} */ (error)?.code))) {
        raced.push(rel);
        continue;
      }
      throw error;
    }
    if (!change) continue;
    if (options.diffs && !change.binary && Math.max(change.sizeBefore || 0, change.sizeAfter || 0) <= TEXT_DIFF_LIMIT) {
      try {
        change.diff = await unifiedDiffAsync(beforeSet.has(rel) ? shadow.base : null, afterSet.has(rel) ? shadow.work : null, rel);
      } catch {
        change.diff = "";
      }
    }
    changes.push(change);
  }
  return { changes, links: newLinks(before.links, after.links, raced) };
}

/**
 * Has the real file moved on since the clone?
 * @param {Shadow} shadow
 * @param {Record<string, { size: number, mtimeMs: number }>} baseline
 * @param {string} rel
 * @returns {"" | "changed-outside" | "deleted-outside" | "created-outside"}
 */
function conflictFor(shadow, baseline, rel) {
  const real = path.join(shadow.realRoot, ...rel.split("/"));
  const recorded = baseline[rel];
  const exists = fs.existsSync(real);
  if (!recorded) return exists ? "created-outside" : "";
  if (!exists) return "deleted-outside";
  const stat = fs.statSync(real);
  if (stat.size === recorded.size && stat.mtimeMs === recorded.mtimeMs) return "";
  // Touched but identical (an editor that rewrote the same bytes) is fine.
  const baseFile = path.join(shadow.base, ...rel.split("/"));
  if (fs.existsSync(baseFile) && sha256(baseFile) === sha256(real)) return "";
  return "changed-outside";
}

/**
 * Move a real file to the macOS Trash through Finder, so the writer can put
 * it back from there. Refuses rather than unlinking when Finder cannot.
 * @param {string} file
 */
function moveToMacTrash(file) {
  const script = `tell application "Finder" to delete (POSIX file ${JSON.stringify(file)} as alias)`;
  const result = spawnSync("/usr/bin/osascript", ["-e", script], { encoding: "utf8", timeout: 30_000 });
  if (result.status !== 0) {
    throw shadowError("trash_failed", `Finder could not move ${path.basename(file)} to the Trash.`, 500);
  }
}

/**
 * @typedef {object} PutBackRequest
 * @property {string[] | "all"} paths
 * @property {string[]} [confirmDeletes]      deletes the writer confirmed, one path each
 * @property {string[]} [overwriteConflicts]  conflicts the writer chose to overwrite, one path each
 * @property {(file: string) => void} [trash] how a confirmed delete leaves the real folder
 * @property {boolean} [readOnly]             a 只读 grant never puts anything back
 */

/**
 * @param {Shadow} shadow
 * @param {PutBackRequest} request
 */
function putBack(shadow, request) {
  if (request.readOnly) throw shadowError("read_only", "This folder was shared read-only; nothing can be put back.", 403);
  const { changes } = listChanges(shadow);
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const wanted = request.paths === "all"
    ? changes.map((change) => change.path)
    : [...new Set((request.paths || []).map(safeRelative))];
  const confirmDeletes = new Set((request.confirmDeletes || []).map(safeRelative));
  const overwrite = new Set((request.overwriteConflicts || []).map(safeRelative));
  const trash = request.trash || moveToMacTrash;
  const baselineDoc = readBaseline(shadow.stateDir);
  const baseline = baselineDoc.files;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotDir = path.join(shadow.stateDir, "putback", stamp);

  /** @type {Array<{ path: string, kind: string }>} */
  const applied = [];
  /** @type {Array<{ path: string, reason: string }>} */
  const conflicts = [];
  /** @type {string[]} */
  const pendingDeletes = [];
  /** @type {Array<{ path: string, reason: string }>} */
  const skipped = [];
  /** @type {string[]} */
  const snapshotted = [];

  for (const rel of wanted) {
    const change = byPath.get(rel);
    if (!change) {
      skipped.push({ path: rel, reason: "unchanged" });
      continue;
    }
    if (UNSAFE_NAME.test(rel)) {
      skipped.push({ path: rel, reason: "unsafe_name" });
      continue;
    }
    if (change.kind === "deleted" && !confirmDeletes.has(rel)) {
      pendingDeletes.push(rel);
      continue;
    }
    const conflict = conflictFor(shadow, baseline, rel);
    if (conflict && !overwrite.has(rel)) {
      conflicts.push({ path: rel, reason: conflict });
      continue;
    }
    let target;
    try {
      target = realTarget(shadow.realRoot, rel);
    } catch (error) {
      skipped.push({ path: rel, reason: String(/** @type {any} */ (error).message) });
      continue;
    }
    // The original first: whatever this put-back replaces can be had back.
    if (fs.existsSync(target)) {
      const copy = path.join(snapshotDir, ...rel.split("/"));
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(target, copy);
      snapshotted.push(rel);
    }
    const baseFile = path.join(shadow.base, ...rel.split("/"));
    /** @type {{ bytes: Buffer, mode: number } | null} */
    let source = null;
    if (change.kind !== "deleted") {
      // Read once, without following a link at any level; these bytes are
      // what lands, whatever happens to work/ afterwards.
      try {
        source = readNoFollow(shadow.work, rel);
      } catch (error) {
        skipped.push({ path: rel, reason: String(/** @type {any} */ (error)?.message || error) });
        continue;
      }
    }
    if (change.kind === "deleted") {
      if (fs.existsSync(target)) trash(target);
      fs.rmSync(baseFile, { force: true });
      delete baseline[rel];
    } else {
      const { bytes, mode } = /** @type {{ bytes: Buffer, mode: number }} */ (source);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temp = path.join(path.dirname(target), `.ais6-putback-${crypto.randomUUID()}`);
      fs.writeFileSync(temp, bytes, { flag: "wx", mode });
      fs.chmodSync(temp, mode);
      fs.renameSync(temp, target);
      fs.mkdirSync(path.dirname(baseFile), { recursive: true });
      fs.writeFileSync(baseFile, bytes);
      const stat = fs.statSync(target);
      baseline[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
    }
    applied.push({ path: rel, kind: change.kind });
  }
  fs.writeFileSync(path.join(shadow.stateDir, "baseline.json"), `${JSON.stringify(baselineDoc, null, 2)}\n`);
  return {
    applied,
    conflicts,
    pendingDeletes,
    skipped,
    snapshot: snapshotted.length ? { dir: snapshotDir, paths: snapshotted } : null,
    remaining: listChanges(shadow).changes.length,
  };
}

/**
 * Remove a shadow (both clones). Put-back snapshots in the state dir stay:
 * they are the writer's way back.
 * @param {Shadow} shadow
 */
function removeShadow(shadow) {
  fs.rmSync(shadow.root, { recursive: true, force: true });
}

module.exports = {
  MAX_FILES,
  PROPOSALS_NAME,
  TMP_NAME,
  cloneTree,
  UNSAFE_NAME,
  conflictFor,
  createShadow,
  listChanges,
  listChangesAsync,
  moveToMacTrash,
  openShadow,
  putBack,
  readNoFollow,
  readNoFollowAsync,
  removeShadow,
  safeRelative,
  walk,
  walkAsync,
};
