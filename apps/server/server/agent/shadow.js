// Shadow copies: the engine never writes a writer's real folder.
//
// A run gets two clones of the mounted folder under shadows/<run>/:
//
//   base/  the folder as it was when the run started (the engine never sees it)
//   work/  the engine's cwd; every write it makes lands here
//   tmp/   the engine's TMPDIR, beside work/ so its search never walks it;
//          it holds the write-only proposal channel tmp/.ais6-proposals, which
//          the engine reaches through the link work/.ais6-proposals, and for
//          a run granted desk tools the desk channel tmp/.ais6-desk
//          (desk-tools.js), reached through work/.ais6-desk
//   stage/ the server's staging folder for restore proposals (proposals.js)
//
// When a run's engine group is confirmed gone, the run freezes its shadow:
// work/ and tmp/ are renamed to frozen/ and tmp-frozen/, the run's DSH_HOME
// moves to dsh-home-frozen/, and the frozen trees are sealed — copied with
// fresh inodes (APFS clonefile where it works) into sealed/ and sealed-tmp/,
// two folders no write allowance of the engine's sandbox names. The sandbox
// allows writes under the OLD work and tmp names only, and the kernel judges
// each write by the path it resolves to at operation time — so a process that
// detached from the group and outlived it (p3-survivor) can no longer create,
// rename, link or write anything in the trees it used to own, however it
// spells the paths (freeze probe, agent-harness). A write through a file
// descriptor or a mapping it opened before the freeze, or by path through a
// hard link it made into its own DSH_HOME while that was still writable,
// still lands on the frozen inode (round 4) — so after the freeze the server
// reads only the sealed copies, whose inodes no old descriptor or link can
// reach, and put-back is bound to the per-path digests the writer reviewed.
// A shadow that was never frozen is treated as live; a half-frozen one
// (frozen/ present, tmp-frozen/ or sealed/ missing) comes back frozen and
// finishes its freeze and seal at the next open.
//
// A link in the folder that resolves outside its clone (an absolute link, or
// one climbing out with ..) is not materialised in either clone; a link that
// stays inside is kept, as a link. Every write the server makes into a clone
// or the real folder on the engine's behalf (staging, put-back) lstats each
// level and refuses a link anywhere on the path (noLinkWriteTarget), and the
// reads and renames carry a belt (verifyOpenedPath, directoryChain): the
// identities captured on the way down are re-checked after the open or the
// move, so a swap that lands between two syscalls is caught — O_NOFOLLOW
// binds only a path's last component.
//
// On APFS both clones are `cp -c` clones (clonefile(2)), so a large folder
// costs nothing until a file changes; elsewhere they fall back to a plain
// copy. `baseline.json` (in the run's state dir) records each real file's
// size and mtime at clone time — and the frozen roots' identities at freeze
// time —; together with base/ it answers "did someone change the real file
// since?" without hashing the folder up front.
//
// Put-back is the writer's commit: the server, not the engine, copies the
// chosen files from the frozen tree into the real folder. A real file that
// changed since the clone is a conflict and is not overwritten unless the
// writer names it; a delete is never applied unless the writer confirms that
// one path; and every original a put-back replaces or moves to the Trash is
// first copied to runs/<run>/putback/<stamp>/.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

/**
 * The engine's TMPDIR inside work/ in shadows made before 2026-10-29 (now
 * shadows/<run>/tmp); still never part of a diff or a put-back.
 */
const TMP_NAME = ".ais6-tmp";
/** The engine's TMPDIR beside work/: shadows/<run>/tmp. */
const TMP_DIR = "tmp";
/**
 * The frozen names a run's shadow takes once its engine group is confirmed
 * gone: shadows/<run>/frozen (the work clone) and shadows/<run>/tmp-frozen
 * (its TMPDIR). No sandbox profile names a write allowance for either — that
 * is the whole point of the move (freeze probe, agent-harness).
 */
const FROZEN_DIR = "frozen";
const TMP_FROZEN_DIR = "tmp-frozen";
/**
 * The sealed copies a freeze makes of the frozen trees: shadows/<run>/sealed
 * (the tree every server read of a settled run goes through) and
 * shadows/<run>/sealed-tmp (the frozen TMPDIR, with the proposal channel).
 * Their files are fresh inodes — APFS clonefile via COPYFILE_FICLONE where it
 * works — so a write through a descriptor or mapping opened on the frozen
 * file before the freeze, or through a hard link to it, changes the frozen
 * inode and never the sealed one (round 4). No write allowance of the
 * engine's sandbox names either.
 */
const SEALED_DIR = "sealed";
const SEALED_TMP_DIR = "sealed-tmp";
/**
 * The run's DSH_HOME beside its clones (dsh-home.js HOME_NAME) and the name
 * it takes at freeze: the profile allows writes under the home for as long as
 * the run lives, and a hard link the engine made into it (a legal write while
 * it ran) would keep a frozen file reachable — and writable — by path after
 * the freeze. Renaming the home takes that path out of every allowance.
 */
const DSH_HOME_DIR = "dsh-home";
const DSH_HOME_FROZEN_DIR = "dsh-home-frozen";
/**
 * The engine's proposal channel (proposals.js): tmp/.ais6-proposals, reached
 * by the engine through the link work/.ais6-proposals. The name never appears
 * in a walk, diff or put-back. The engine is meant to write here: one
 * candidate proposal per JSON file. The sandbox profile makes the directory
 * write-only for the engine (sandbox-profile.js), and runs.js harvests it into
 * runs/<run>/proposals/ when the engine exits. It lives outside work/ because
 * dsh's glob walks work/ with `rg --files --hidden --no-ignore --no-config`:
 * an unreadable folder there made every search exit 2 (EPERM), and rg does
 * not follow the link.
 */
const PROPOSALS_NAME = ".ais6-proposals";
/**
 * The desk-tools channel (desk-tools.js): tmp/.ais6-desk, reached through the
 * link work/.ais6-desk, made only for a run the writer granted desk tools.
 * Like the proposal channel, never part of a walk, diff or put-back.
 */
const DESK_NAME = ".ais6-desk";
const IGNORED_NAMES = new Set([TMP_NAME, PROPOSALS_NAME, DESK_NAME, ".DS_Store"]);
/**
 * Where a run's lent documents live: base/ and work/ `.ais6-documents/<name>/`.
 * The folder is the server's. A real folder's own top-level entry of that name,
 * in any case or Unicode spelling, is removed from both clones, and listChanges
 * (so put-back) leaves everything under it out, so no document name can meet
 * a real-folder entry however the volume compares names (round 8 F1: an NFC
 * name landed inside the real folder's NFD directory of the same name).
 */
const DOCUMENTS_NAME = ".ais6-documents";

/**
 * A name as a case-insensitive, normalization-insensitive volume compares it,
 * near enough: NFC, then case folded (upper first, so `ſ` meets `s`).
 * @param {string} name
 */
function foldName(name) {
  return String(name).normalize("NFC").toUpperCase().toLowerCase();
}

/** @param {string} rel  POSIX relative path */
function inDocumentsRoot(rel) {
  return foldName(rel.split("/")[0]) === DOCUMENTS_NAME;
}
/**
 * Environment-layer names (`.env`, `.env.local`, `.envrc`, …). They never cross
 * the shadow boundary in either direction: the engine must not read the
 * author's keys out of the working copy, and a `.env*` the engine writes
 * inside the shadow is never listed, diffed or put back (owner's call,
 * 2026-10-26).
 * @param {string} name
 */
function isEnvLayer(name) {
  // APFS is case-insensitive: `.ENV` and `.Env.local` are the same layer.
  return String(name).toLowerCase().startsWith(".env");
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
 * lstat a root the server is about to read or write under — never realpath
 * it, which would follow a link the engine left in its place. Throws
 * `link_refused` for a link, `not_a_folder` for anything but a folder, and
 * the lstat error (ENOENT) when it is gone.
 * @param {string} dir
 * @returns {fs.BigIntStats}
 */
function lstatRoot(dir) {
  const stat = fs.lstatSync(dir, { bigint: true });
  if (stat.isSymbolicLink()) throw shadowError("link_refused", `This folder is a link and is never read or written through: ${path.basename(dir)}`);
  if (!stat.isDirectory()) throw shadowError("not_a_folder", `Not a folder: ${path.basename(dir)}`);
  return stat;
}

/** "dev:ino" of a root folder, read with lstat. @param {string} dir */
function rootIdentity(dir) {
  const stat = lstatRoot(dir);
  return `${stat.dev}:${stat.ino}`;
}

/** The shadow folders the server reads and writes under, by key. */
const ROOT_KEYS = /** @type {const} */ (["root", "work", "base", "tmp"]);

/**
 * Refuse a shadow whose folders were swapped since the clone (or the freeze):
 * before the server reads or writes one (listChanges, put-back, staging,
 * harvest, re-open), each of root, work/, base/ and tmp/ must be a real
 * folder (lstat, not a link) with the dev/ino recorded at createShadow, and
 * the proposal channel, if present, a real folder. Once the shadow is frozen
 * the live work/ and tmp/ names are gone by design — their trees are checked
 * instead as frozen/, tmp-frozen/, sealed/ and sealed-tmp/, against the
 * identities recorded at freeze (and seal) time. The engine's sandbox already
 * refuses writes on these roots; this is the server's own check, and it also
 * covers shadows made before that rule. A shadow without recorded ids (an
 * older run, or a bare { work } in a contract) gets the lstat checks only.
 * @param {{ root?: string, work?: string, base?: string, tmp?: string, proposals?: string, frozen?: string, tmpFrozen?: string, sealed?: string, sealedTmp?: string, stateDir?: string }} shadow
 * @param {{ allowMissing?: boolean }} [options]  re-open: a missing folder is not an error
 */
function checkShadow(shadow, options = {}) {
  /** @type {Record<string, string> | null} */
  let recorded = null;
  if (shadow.stateDir) {
    try {
      recorded = readBaseline(shadow.stateDir).roots || null;
    } catch {}
  }
  const frozen = Boolean(shadow.frozen);
  for (const key of ROOT_KEYS) {
    const dir = shadow[key];
    if (!dir) continue;
    if (frozen && (key === "work" || key === "tmp")) continue;
    let id;
    try {
      id = rootIdentity(dir);
    } catch (error) {
      const code = /** @type {any} */ (error).code;
      // An old shadow's TMPDIR lived in work/ and may be gone.
      if (code === "ENOENT" && (options.allowMissing || key === "tmp")) continue;
      throw shadowError("shadow_tampered", `This run's ${key} folder is not the one it was cloned into (${code}); nothing is read or written through it.`, 409);
    }
    if (recorded && recorded[key] && recorded[key] !== id) {
      throw shadowError("shadow_tampered", `This run's ${key} folder was replaced after the clone; nothing is read or written through it.`, 409);
    }
  }
  for (const key of ["frozen", "tmpFrozen", "sealed", "sealedTmp"]) {
    const dir = shadow[key];
    if (!dir) continue;
    let id;
    try {
      id = rootIdentity(dir);
    } catch (error) {
      const code = /** @type {any} */ (error).code;
      // A freeze that died between its two renames leaves tmp-frozen absent.
      // A shadow only names sealed/ and sealed-tmp/ once they exist, so one
      // that is gone now was removed by somebody else.
      if (code === "ENOENT" && (options.allowMissing || key === "tmpFrozen")) continue;
      throw shadowError("shadow_tampered", `This run's ${key} folder is not the one it was frozen into (${code}); nothing is read or written through it.`, 409);
    }
    if (recorded && recorded[key] && recorded[key] !== id) {
      throw shadowError("shadow_tampered", `This run's ${key} folder was replaced after the freeze; nothing is read or written through it.`, 409);
    }
  }
  if (shadow.proposals) {
    let stat = null;
    try {
      stat = fs.lstatSync(shadow.proposals);
    } catch {}
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw shadowError("shadow_tampered", "This run's proposal channel is not a folder; nothing is read through it.", 409);
    }
  }
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
  try {
    lstatRoot(root);
  } catch (error) {
    if (/** @type {any} */ (error).code === "ENOENT") return { files, links };
    throw error;
  }
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

/** O_NOFOLLOW where the platform has it (macOS and Linux do). */
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

/**
 * lstat every level of `rel` under `root` and refuse a link anywhere on the
 * way, recording each level's dev/ino. The open that follows is checked
 * against the last level's identity and every level is re-lstat'ed after the
 * open (verifyOpenedPath): a swap that lands between two syscalls would
 * otherwise be followed, because O_NOFOLLOW binds only a path's last
 * component. Returns the chain, root first, the file last.
 * @param {string} root
 * @param {string} rel  POSIX relative path
 * @returns {Array<{ path: string, dev: bigint, ino: bigint }>}
 */
function noLinkChain(root, rel) {
  lstatRoot(root);
  /** @type {Array<{ path: string, dev: bigint, ino: bigint }>} */
  const chain = [];
  const rootStat = fs.lstatSync(root, { bigint: true });
  chain.push({ path: root, dev: rootStat.dev, ino: rootStat.ino });
  let current = root;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink()) throw shadowError("link_refused", `This path is a link and is never read or put back: ${rel}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
      throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    }
    // A hard link the engine made (it may link its own files into its
    // DSH_HOME, which stays writable for the run) keeps the bytes reachable
    // — and writable — through the other name after the freeze, past every
    // path check. A file with more than one link is refused outright, before
    // the open and again after it (verifyOpenedPath, round 4).
    if (index === parts.length - 1 && stat.nlink > 1n) {
      throw shadowError("link_refused", `This file is hard-linked somewhere else and is never read or put back: ${rel}`);
    }
    chain.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  // The walk itself can be poisoned: a swap of an intermediate directory
  // between two lstats makes the NEXT lstat follow the swap (an lstat follows
  // every link but the last component), and the swap may be undone before the
  // post-open check. Re-read every level but the last once the walk is done:
  // whatever the open resolves to must sit inside the tree this walk verified,
  // or the fstat comparison after the open refuses the read.
  for (let index = 0; index < chain.length - 1; index += 1) {
    const stat = fs.lstatSync(chain[index].path, { bigint: true });
    if (stat.dev !== chain[index].dev || stat.ino !== chain[index].ino) {
      throw shadowError("link_refused", `This path was swapped while it was read: ${rel}`);
    }
  }
  return chain;
}

/**
 * The belt around an open on a tree someone else may be reshaping: the fd's
 * dev/ino must still be the last chain level's, and every level before it —
 * the root and the directories on the way — must re-lstat to the identity the
 * chain recorded. A mismatch means the path was swapped while it was opened
 * (a link the swap left would have been followed: O_NOFOLLOW binds only the
 * last component), and nothing is read through the swap.
 * @param {Array<{ path: string, dev: bigint, ino: bigint }>} chain
 * @param {number} fd
 */
function verifyOpenedPath(chain, fd) {
  const opened = fs.fstatSync(fd, { bigint: true });
  const last = chain[chain.length - 1];
  if (opened.dev !== last.dev || opened.ino !== last.ino) {
    throw shadowError("link_refused", "This path was swapped while it was opened; nothing is read through the swap.");
  }
  // The same hard-link refusal as the walk, after the open: a link that
  // landed on the file between the lstat and the open is caught here.
  if (opened.nlink > 1n) {
    throw shadowError("link_refused", "This file is hard-linked somewhere else; nothing is read or put back through it.");
  }
  for (let index = 0; index < chain.length - 1; index += 1) {
    let stat = null;
    try {
      stat = fs.lstatSync(chain[index].path, { bigint: true });
    } catch (error) {
      if (/** @type {any} */ (error).code !== "ENOENT") throw error;
    }
    if (!stat || stat.dev !== chain[index].dev || stat.ino !== chain[index].ino) {
      throw shadowError("link_refused", "This path was swapped while it was opened; nothing is read through the swap.");
    }
  }
}

/**
 * Open a file under `root` without following a link at any level, with the
 * belt on: the fd that comes back is the file the lstat chain verified.
 * @param {string} root
 * @param {string} rel
 * @param {number} [flags]  extra open flags (desk-tools.js adds O_NONBLOCK, so a FIFO swapped in never blocks)
 * @returns {number}
 */
function openNoFollow(root, rel, flags = 0) {
  const chain = noLinkChain(root, rel);
  const fd = fs.openSync(chain[chain.length - 1].path, fs.constants.O_RDONLY | NOFOLLOW | flags);
  try {
    verifyOpenedPath(chain, fd);
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  return fd;
}

/**
 * Read a file under `root` without following a link at any level.
 * @param {string} root
 * @param {string} rel
 * @returns {{ bytes: Buffer, mode: number }}
 */
function readNoFollow(root, rel) {
  const fd = openNoFollow(root, rel);
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
  const rootStat = await fs.promises.lstat(root);
  if (rootStat.isSymbolicLink()) throw shadowError("link_refused", `This folder is a link and is never read through: ${path.basename(root)}`);
  if (!rootStat.isDirectory()) throw shadowError("not_a_folder", `Not a folder: ${path.basename(root)}`);
  /** @type {Array<{ path: string, dev: number, ino: number }>} */
  const chain = [{ path: root, dev: rootStat.dev, ino: rootStat.ino }];
  let current = root;
  const parts = rel.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const stat = await fs.promises.lstat(current);
    if (stat.isSymbolicLink()) throw shadowError("link_refused", `This path is a link and is never read or put back: ${rel}`);
    if (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    // The sync read's hard-link refusal (round 4): a multiply-linked file is
    // never read, before the open or after it.
    if (index === parts.length - 1 && stat.nlink > 1) {
      throw shadowError("link_refused", `This file is hard-linked somewhere else and is never read or put back: ${rel}`);
    }
    chain.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  // The same in-walk re-check as the sync read: a swap between two lstats
  // poisons the walk (an lstat follows every link but the last component).
  for (let index = 0; index < chain.length - 1; index += 1) {
    const stat = await fs.promises.lstat(chain[index].path);
    if (stat.dev !== chain[index].dev || stat.ino !== chain[index].ino) {
      throw shadowError("link_refused", `This path was swapped while it was read: ${rel}`);
    }
  }
  const handle = await fs.promises.open(current, fs.constants.O_RDONLY | NOFOLLOW);
  try {
    // The same belt as the sync read: the handle's identity against the
    // chain's last level, then every earlier level re-lstat'ed — and the
    // hard-link refusal again, in case a link landed between the lstat and
    // the open.
    const opened = await handle.stat();
    const last = chain[chain.length - 1];
    if (opened.dev !== last.dev || opened.ino !== last.ino) {
      throw shadowError("link_refused", "This path was swapped while it was opened; nothing is read through the swap.");
    }
    if (opened.nlink > 1) {
      throw shadowError("link_refused", "This file is hard-linked somewhere else; nothing is read or put back through it.");
    }
    for (let index = 0; index < chain.length - 1; index += 1) {
      let stat = null;
      try {
        stat = await fs.promises.lstat(chain[index].path);
      } catch (error) {
        if (/** @type {any} */ (error).code !== "ENOENT") throw error;
      }
      if (!stat || stat.dev !== chain[index].dev || stat.ino !== chain[index].ino) {
        throw shadowError("link_refused", "This path was swapped while it was opened; nothing is read through the swap.");
      }
    }
    if (!opened.isFile()) throw shadowError("not_a_file", `Not a regular file: ${rel}`);
    return { bytes: await handle.readFile(), mode: opened.mode & 0o777 };
  } finally {
    await handle.close();
  }
}

/**
 * The target for a write the server makes under `root` on the engine's
 * behalf (a staged restore, a put-back, base/ bookkeeping). Every level of
 * `rel` is lstat'ed from the root down: a link anywhere — a folder on the
 * way or the file itself — is refused, and so is a level that is not a
 * folder; the root itself must be a folder, not a link (lstat). A missing
 * level is made (mkdir, one level at a time) only with
 * `create`; without it the check stops at the first missing level. The
 * parent's realpath must stay inside the root's.
 * @param {string} root
 * @param {string} rel  POSIX relative path, already through safeRelative
 * @param {{ create?: boolean }} [options]
 * @returns {string} the absolute target path
 */
function noLinkWriteTarget(root, rel, options = {}) {
  // The root itself first, by lstat: realpath alone would follow a link the
  // engine left in its place. (Its ancestors are the server's own.)
  lstatRoot(root);
  const realRoot = fs.realpathSync(root);
  const parts = rel.split("/");
  let current = realRoot;
  let missing = false;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    const last = index === parts.length - 1;
    let stat = null;
    if (!missing) {
      try {
        stat = fs.lstatSync(current);
      } catch (error) {
        if (/** @type {any} */ (error).code !== "ENOENT") throw error;
      }
    }
    if (!stat) {
      if (last) break;
      if (!options.create) {
        missing = true;
        continue;
      }
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (stat.isSymbolicLink()) throw shadowError("link_refused", `This path goes through a link and is never written: ${rel}`);
    if (last ? !stat.isFile() : !stat.isDirectory()) throw shadowError("not_a_file", `Not a regular file in a folder: ${rel}`);
  }
  if (!missing) {
    const parent = fs.realpathSync(path.dirname(current));
    if (parent !== realRoot && !parent.startsWith(realRoot + path.sep)) {
      throw shadowError("bad_path", `This path leaves the folder through a link: ${rel}`);
    }
  }
  return current;
}

/**
 * The directories a rename's destination resolves through: the root and every
 * level of `rel` except the last (the final component is the rename's own
 * business). Captured right before a server-side move, re-checked right after
 * it (verifyDirectoryChain): rename() resolves its destination path in the
 * kernel, following whatever a racer left in an intermediate directory, and a
 * swap that lands between the write-target check and the move would otherwise
 * go unnoticed.
 * @param {string} root
 * @param {string} rel
 * @returns {Array<{ path: string, dev: bigint, ino: bigint }>}
 */
function directoryChain(root, rel) {
  lstatRoot(root);
  /** @type {Array<{ path: string, dev: bigint, ino: bigint }>} */
  const chain = [];
  const rootStat = fs.lstatSync(root, { bigint: true });
  chain.push({ path: root, dev: rootStat.dev, ino: rootStat.ino });
  const parts = rel.split("/");
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = path.join(current, parts[index]);
    const stat = fs.lstatSync(current, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw shadowError("link_refused", `This path goes through a link and is never written: ${rel}`);
    }
    chain.push({ path: current, dev: stat.dev, ino: stat.ino });
  }
  return chain;
}

/**
 * @param {Array<{ path: string, dev: bigint, ino: bigint }>} chain
 * @param {string} rel
 */
function verifyDirectoryChain(chain, rel) {
  for (const level of chain) {
    let stat = null;
    try {
      stat = fs.lstatSync(level.path, { bigint: true });
    } catch (error) {
      if (/** @type {any} */ (error).code !== "ENOENT") throw error;
    }
    if (!stat || stat.dev !== level.dev || stat.ino !== level.ino) {
      throw shadowError("link_refused", `This path was swapped while it was written: ${rel}`);
    }
  }
}

/** @param {string} file */
function sha256(file) {
  return sha256Bytes(fs.readFileSync(file));
}

/** @param {Buffer | string} bytes */
function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
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

/** Real (non-clone) copy bytes one seal may write; clones are copy-on-write and cost nothing. */
const MAX_SEAL_COPY_BYTES = 1024 ** 3;
const MAX_SEAL_DEPTH = 64;
const SEAL_CHUNK = 1024 * 1024;
/** How long the freeze waits after its renames before it reads: a syscall a survivor started under the old names finishes in microseconds. */
const FREEZE_SETTLE_MS = 100;

/** @param {number} ms */
function settle(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The walking half of sealTree: our own walk, not fs.cpSync. Node's cpSync runs in C++ and an engine-made tree (a directory
 * chmod 000, an entry swapped mid-walk) made it throw a std::filesystem_error
 * nothing could catch, which aborted the whole server, again at every restart
 * that retried the seal (attack round 5). Here every entry is lstat'ed, a
 * regular file is opened O_NOFOLLOW|O_NONBLOCK and fstat'ed against its lstat
 * (a link, FIFO or swapped entry never gets read), and every failure is a
 * plain JS error. Files are fresh inodes — an APFS clone (copy-on-write, no
 * bytes copied) where the volume allows, a chunked copy through the open
 * descriptor otherwise — so a write through a descriptor or mapping opened on
 * the frozen file before the freeze, or through a hard link to it, never
 * reaches the sealed copy (round 4). Links are copied as links. A FIFO,
 * socket or device has no bytes to seal, so like anything else that cannot be
 * sealed whole it fails the seal (`seal_failed`) rather than leaving a hole
 * the change list would show as a deletion; the writer's way out is Discard. Caps:
 * MAX_FILES entries, MAX_SEAL_COPY_BYTES of real copying, MAX_SEAL_DEPTH.
 * @param {string} source
 * @param {string} dest
 */
function copyWalkSeal(source, dest) {
  const budget = { entries: 0, copied: 0 };
  /** @param {string} detail @param {any} [error] */
  const fail = (detail, error) => shadowError("seal_failed", `${detail}${error?.code ? ` (${error.code})` : ""}`, 409);
  /** @param {string} from @param {string} to @param {number} depth */
  function copyDir(from, to, depth) {
    if (depth > MAX_SEAL_DEPTH) throw fail("A folder is nested too deeply to seal");
    let entries;
    try { entries = fs.readdirSync(from, { withFileTypes: true }); } catch (error) { throw fail("A folder could not be read to seal it", error); }
    for (const entry of entries) {
      budget.entries += 1;
      if (budget.entries > MAX_FILES * 2) throw shadowError("folder_too_large", `This run holds more than ${MAX_FILES} files; it cannot be sealed.`, 413);
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      let st;
      try { st = fs.lstatSync(src); } catch (error) { throw fail("An entry vanished while it was sealed", error); }
      try {
        if (st.isSymbolicLink()) {
          fs.symlinkSync(fs.readlinkSync(src), dst);
        } else if (st.isDirectory()) {
          fs.mkdirSync(dst, { mode: (st.mode & 0o777) | 0o700 });
          copyDir(src, dst, depth + 1);
        } else if (st.isFile()) {
          copyFile(src, dst, st);
        } else {
          throw fail("A FIFO, socket or device cannot be sealed");
        }
      } catch (error) {
        if (/** @type {any} */ (error)?.code === "seal_failed" || /** @type {any} */ (error)?.code === "folder_too_large") throw error;
        throw fail("An entry could not be sealed", error);
      }
    }
  }
  /** @param {string} src @param {string} dst @param {import("node:fs").Stats} st */
  function copyFile(src, dst, st) {
    const mode = (st.mode & 0o777) | 0o600;
    const fd = fs.openSync(src, fs.constants.O_RDONLY | NOFOLLOW | (fs.constants.O_NONBLOCK || 0));
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.dev !== st.dev || opened.ino !== st.ino) throw fail("An entry changed while it was sealed");
      // Copy through the open descriptor, within the budget.
      budget.copied += opened.size;
      if (budget.copied > MAX_SEAL_COPY_BYTES) {
        throw shadowError("folder_too_large", "This run holds more data than can be sealed by copying; discard it and run again.", 413);
      }
      const out = fs.openSync(dst, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW, mode);
      try {
        const buffer = Buffer.allocUnsafe(SEAL_CHUNK);
        for (;;) {
          const read = fs.readSync(fd, buffer, 0, SEAL_CHUNK, null);
          if (!read) break;
          let written = 0;
          while (written < read) written += fs.writeSync(out, buffer, written, read - written);
        }
      } finally {
        fs.closeSync(out);
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  const rootStat = fs.lstatSync(source);
  if (!rootStat.isDirectory()) throw fail("The tree to seal is not a folder");
  fs.mkdirSync(dest, { mode: (rootStat.mode & 0o777) | 0o700 });
  copyDir(source, dest, 0);
}

/**
 * Count the entries under a tree without following links; refuse a tree with
 * more than the cap, a type the seal never carries (FIFO, socket, device), or
 * a depth past the cap.
 * @param {string} root
 */
function checkSealedShape(root) {
  let entries = 0;
  /** @param {string} dir @param {number} depth */
  const visit = (dir, depth) => {
    if (depth > MAX_SEAL_DEPTH) throw shadowError("seal_failed", "A folder is nested too deeply to seal", 409);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      entries += 1;
      if (entries > MAX_FILES * 2) throw shadowError("folder_too_large", `This run holds more than ${MAX_FILES} files; it cannot be sealed.`, 413);
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full, depth + 1);
      else if (!entry.isFile() && !entry.isSymbolicLink()) throw shadowError("seal_failed", "A sealed entry is neither a file, a folder nor a link", 409);
    }
  };
  visit(root, 0);
}

/**
 * Seal one frozen tree into `dest` (which must not exist), every file a fresh
 * inode. On macOS first `cp -c -R -P` (clonefile(2): copy-on-write, so a large
 * folder costs nothing), a separate process whose failure is an exit status,
 * then the result is checked entry by entry; Node's own FICLONE does not
 * clone on this platform (ENOSYS), and its cpSync aborts the server on an
 * unreadable directory (attack round 5). When the clone cannot be made or
 * fails the check, the walking copy above runs instead, within its caps.
 * @param {string} source
 * @param {string} dest
 * @param {{ forceCopy?: boolean }} [options]
 */
function sealTree(source, dest, options = {}) {
  if (!options.forceCopy && process.platform === "darwin") {
    try {
      // cp leaves a socket out and still succeeds, so the source's shape is
      // checked first: a FIFO, socket or device fails the seal here too.
      checkSealedShape(source);
      fs.mkdirSync(dest);
      const result = spawnSync("/bin/cp", ["-c", "-R", "-P", `${source}/.`, dest], { encoding: "utf8", timeout: 300_000, killSignal: "SIGKILL" });
      if (result.status === 0) {
        checkSealedShape(dest);
        return;
      }
    } catch (error) {
      const code = /** @type {any} */ (error)?.code;
      if (code === "folder_too_large" || code === "seal_failed") { forceRemove(dest); throw error; }
    }
    forceRemove(dest);
  }
  copyWalkSeal(source, dest);
}

/**
 * Normalise a writer-chosen relative path and refuse anything that leaves the
 * folder. An APFS named-fork component (`..namedfork`) is refused too: on
 * this filesystem `<file>/../namedfork/rsrc` writes the file's resource fork
 * rather than a path a put-back list could show (probeC, 2026-10-30).
 * @param {string} rel
 */
function safeRelative(rel) {
  const text = String(rel || "").replaceAll("\\", "/");
  const normal = path.posix.normalize(text);
  if (!text || path.posix.isAbsolute(text) || normal.startsWith("../") || normal === ".." || normal === "."
    || text.includes("\0") || normal.split("/").some((part) => IGNORED_NAMES.has(part) || part === "..namedfork")) {
    throw shadowError("bad_path", `Not a path inside this folder: ${rel}`);
  }
  return normal;
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
 * Open the two sides of a diff without following links, with the belt on:
 * each fd is checked against the chain that verified its path.
 * @param {string | null} beforeRoot
 * @param {string | null} afterRoot
 * @param {string} rel
 */
function openDiffSides(beforeRoot, afterRoot, rel) {
  /** @type {number[]} */
  const fds = [];
  try {
    for (const root of [beforeRoot, afterRoot]) {
      fds.push(root ? openNoFollow(root, rel) : fs.openSync("/dev/null", "r"));
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
 * @property {string} work      shadows/<run>/work — the engine's cwd while it ran; gone once the shadow is frozen
 * @property {string} base      shadows/<run>/base
 * @property {string} tmp       shadows/<run>/tmp (the engine's TMPDIR; work/.ais6-tmp in older shadows)
 * @property {string} proposals tmp/.ais6-proposals (the engine's write-only proposal channel; work/.ais6-proposals in older shadows)
 * @property {string} [frozen]  shadows/<run>/frozen — the work clone once the run froze its shadow; no server read goes through it
 * @property {string} [tmpFrozen]  shadows/<run>/tmp-frozen — the frozen TMPDIR; no server read goes through it
 * @property {string} [sealed]  shadows/<run>/sealed — fresh-inode copy of frozen/ made at freeze; every server read of the run's tree goes here
 * @property {string} [sealedTmp]  shadows/<run>/sealed-tmp — fresh-inode copy of tmp-frozen/; the proposal channel is read from here
 * @property {string} realRoot  realpath of the mounted folder ("" when the run has only lent documents)
 * @property {Array<{ id: string, dir: string }>} [objects]  lent documents (task object mounts): each lives in work/<dir>/ and base/<dir>/ (dir is `.ais6-documents/<name>`), never in the real folder, so listChanges leaves them out and nothing of them is put back
 * @property {string} stateDir  runs/<run>
 * @property {"clonefile" | "copy"} method
 */

/**
 * The tree a settled run's changes are read from: the sealed copy once the
 * run froze and sealed its shadow, the live work clone while it runs. The
 * frozen tree's own inodes stay reachable through descriptors, mappings and
 * hard links the engine left behind (round 4), so a frozen shadow without a
 * seal is never read: it throws `not_sealed` until freezeShadow finishes.
 * @param {{ sealed?: string, frozen?: string, work: string }} shadow
 */
function afterWork(shadow) {
  if (shadow.frozen && !shadow.sealed) {
    throw shadowError("not_sealed", "This run's frozen shadow has not been sealed yet; nothing is read through it.", 409);
  }
  return shadow.sealed || shadow.work;
}

/**
 * Remove every `.env*` entry under `root` — a file, a link, or a folder with
 * everything in it (`.envs/prod.txt` is as much the author's environment as
 * `.env`). Used on the two clones only — the real folder is never touched.
 * The walk already hides these names from every listing, so this sweep needs
 * its own recursion. Links are never descended.
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
    if (isEnvLayer(entry.name)) fs.rmSync(full, { recursive: true, force: true });
    else if (entry.isDirectory()) removeEnvLayers(full);
  }
}

/**
 * Unlink every link in a clone that does not resolve inside it: an absolute
 * link (it names the real folder or somewhere else on the disk), one that
 * climbs out with `..`, or one that resolves nowhere. Inside the shadow such
 * a link would lead the engine's tools, or a server write, out of the run.
 * A link that resolves inside the clone stays, as a link (the walk lists it
 * apart and it is never put back). Resolution is the kernel's, all links
 * judged before any is removed.
 * @param {string} cloneRoot
 */
function removeEscapingLinks(cloneRoot) {
  const realRoot = fs.realpathSync(cloneRoot);
  /** @type {string[]} */
  const escaping = [];
  /** @param {string} dir */
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let resolved = "";
        try {
          resolved = fs.realpathSync(full);
        } catch {}
        if (!resolved || (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep))) escaping.push(full);
      } else if (entry.isDirectory()) {
        visit(full);
      }
    }
  }
  visit(realRoot);
  for (const link of escaping) fs.unlinkSync(link);
}

/**
 * A folder name for a lent document: the document's name without anything a
 * path component cannot carry, never hidden (a leading dot would meet the
 * ignored and environment names), and distinct from every name already taken
 * among the run's documents (compared folded: APFS ignores case and
 * normalization).
 * @param {string} name
 * @param {Set<string>} taken  folded names in use; the new one is added
 */
function objectFolderName(name, taken) {
  const stem = String(name || "").normalize("NFC").replace(new RegExp(UNSAFE_NAME.source, "g"), "_").replace(/[\\/:*?"<>|]/g, "_").replace(/^[.\s]+|\s+$/g, "");
  // Cut by code point, never inside a surrogate pair: a lone surrogate on disk
  // becomes U+FFFD and the document's folder could no longer be found.
  const cut = Array.from(stem).slice(0, 100).join("").trim() || "document";
  let candidate = cut;
  for (let n = 2; taken.has(foldName(candidate)); n += 1) candidate = `${cut}-${n}`;
  taken.add(foldName(candidate));
  return candidate;
}

/**
 * Clear the documents folder's name in a clone: whatever the real folder kept
 * under it (in any spelling the volume takes for it) goes, in every run, since
 * listChanges never shows it. With lent documents the folder is then made
 * fresh, never reused.
 * @param {string} clone  base/ or work/
 * @param {boolean} make
 */
function clearDocumentsRoot(clone, make) {
  for (const name of fs.readdirSync(clone)) {
    if (foldName(name) === DOCUMENTS_NAME) fs.rmSync(path.join(clone, name), { recursive: true, force: true });
  }
  // The volume's own idea of the same name, if it is wider than foldName's.
  fs.rmSync(path.join(clone, DOCUMENTS_NAME), { recursive: true, force: true });
  if (make) fs.mkdirSync(path.join(clone, DOCUMENTS_NAME));
}

/**
 * A lent document's folder, `.ais6-documents/<name>`, made new in base/ and
 * work/: a name the volume already holds there (EEXIST) is numbered on.
 * @param {string} base
 * @param {string} work
 * @param {string} name
 * @param {Set<string>} taken
 */
function makeObjectFolder(base, work, name, taken) {
  for (;;) {
    const dir = `${DOCUMENTS_NAME}/${objectFolderName(name, taken)}`;
    try {
      fs.mkdirSync(path.join(base, dir));
    } catch (error) {
      if (/** @type {any} */ (error)?.code === "EEXIST") continue;
      throw error;
    }
    fs.mkdirSync(path.join(work, dir));
    return dir;
  }
}

/**
 * Write a lent document's projection files into base/<dir>/ and work/<dir>/.
 * Each target is checked link by link (noLinkWriteTarget) and made with `wx`.
 * @param {string} root  base/ or work/
 * @param {string} dir
 * @param {Array<{ path: string, bytes: Buffer }>} files
 */
function writeObjectFiles(root, dir, files) {
  for (const file of files) {
    const target = noLinkWriteTarget(root, `${dir}/${safeRelative(file.path)}`, { create: true });
    fs.writeFileSync(target, file.bytes, { flag: "wx", mode: 0o644 });
  }
}

/**
 * @param {{ source?: string, objects?: Array<{ id: string, name: string, files: Array<{ path: string, bytes: Buffer }> }>, shadowRoot: string, stateDir: string, forceCopy?: boolean, seedWork?: string }} input
 *   source is the mounted real folder, absent when the run holds only lent documents (objects)
 * @returns {Shadow}
 */
function createShadow(input) {
  const realRoot = input.source ? fs.realpathSync(input.source) : "";
  if (realRoot && !fs.statSync(realRoot).isDirectory()) throw shadowError("not_a_folder", "The mounted path is not a folder.");
  if (fs.existsSync(input.shadowRoot)) throw shadowError("shadow_exists", "This run already has a shadow.", 409);
  const listing = realRoot ? walk(realRoot) : { files: [], links: [] };
  const base = path.join(input.shadowRoot, "base");
  const work = path.join(input.shadowRoot, "work");
  /** @type {"clonefile" | "copy"} */
  let method = "copy";
  if (realRoot) {
    method = cloneTree(realRoot, base, { forceCopy: input.forceCopy });
    cloneTree(base, work, { forceCopy: input.forceCopy || method === "copy" });
    // A forked task starts from a snapshot of what an earlier turn found.
    if (input.seedWork) {
      fs.rmSync(work, { recursive: true, force: true });
      cloneTree(input.seedWork, work, { forceCopy: true });
    }
  } else {
    fs.mkdirSync(base, { recursive: true });
    fs.mkdirSync(work, { recursive: true });
  }
  // The engine reads files straight off work/, so the environment layers are
  // removed from disk as well as from every listing; links leading out of a
  // clone go too.
  for (const clone of [base, work]) {
    removeEnvLayers(clone);
    removeEscapingLinks(clone);
  }
  // Lent documents come after the sweeps: each gets a folder of its own name
  // under the server's documents folder, apart from every real-folder entry.
  /** @type {Array<{ id: string, dir: string }>} */
  const objects = [];
  const lending = Boolean(input.objects && input.objects.length);
  for (const clone of [base, work]) clearDocumentsRoot(clone, lending);
  /** @type {Set<string>} */
  const taken = new Set();
  for (const object of input.objects || []) {
    const dir = makeObjectFolder(base, work, object.name, taken);
    writeObjectFiles(base, dir, object.files);
    writeObjectFiles(work, dir, object.files);
    objects.push({ id: object.id, dir });
  }
  // The engine's TMPDIR, beside work/.
  const tmp = path.join(input.shadowRoot, TMP_DIR);
  fs.mkdirSync(tmp, { recursive: true });
  // The server's staging folder for restore proposals (proposals.js
  // stageRestore): the engine's sandbox names no write allowance for it, so
  // the bytes are safe here even if something of the engine's process group
  // is still alive. stageRestore creates it lazily for older shadows.
  fs.mkdirSync(path.join(input.shadowRoot, "stage"), { recursive: true });
  // The proposal channel, pre-made so even a 只读 run (whose sandbox may write
  // this directory but nothing else of the shadow) can use it. The engine
  // reaches it at work/.ais6-proposals, a link the server makes; a folder
  // that carried its own entry of that name loses it in work/ (IGNORED_NAMES
  // already hid it from diffs and put-back).
  const proposals = path.join(tmp, PROPOSALS_NAME);
  fs.mkdirSync(proposals, { recursive: true });
  const channelLink = path.join(work, PROPOSALS_NAME);
  fs.rmSync(channelLink, { recursive: true, force: true });
  fs.symlinkSync(path.relative(work, proposals), channelLink);
  /** @type {Record<string, { size: number, mtimeMs: number }>} */
  const baseline = {};
  for (const rel of listing.files) {
    const stat = fs.statSync(path.join(realRoot, ...rel.split("/")));
    baseline[rel] = { size: stat.size, mtimeMs: stat.mtimeMs };
  }
  fs.mkdirSync(input.stateDir, { recursive: true });
  // The roots' identities, for checkShadow: a folder swapped in later (a link
  // or another real folder) does not match.
  /** @type {Record<string, string>} */
  const roots = {};
  for (const [key, dir] of /** @type {Array<[string, string]>} */ ([["root", input.shadowRoot], ["work", work], ["base", base], ["tmp", tmp]])) {
    roots[key] = rootIdentity(dir);
  }
  fs.writeFileSync(path.join(input.stateDir, "baseline.json"), `${JSON.stringify({ realRoot, method, roots, files: baseline, objects }, null, 2)}\n`);
  return { root: input.shadowRoot, work, base, tmp, proposals, realRoot, objects, stateDir: input.stateDir, method };
}

/**
 * Re-open a shadow from disk (after a server restart). A run that froze its
 * shadow comes back frozen: the run's tree is read from sealed/, the channel
 * from sealed-tmp/, and the live work/ and tmp/ names no longer exist. A
 * shadow frozen but not yet sealed (a freeze that died after its renames, or
 * one from before the seal) comes back frozen without `sealed`; nothing is
 * read through it until freezeShadow finishes the seal (runs.js does that
 * when it loads the run). This function never mutates the disk. Its
 * folders are checked (checkShadow) unless `check` is false — runs.js opens a
 * tampered shadow unchecked only so the writer can still discard it; every
 * read and write path checks again.
 * @param {{ shadowRoot: string, stateDir: string }} input
 * @param {{ check?: boolean }} [options]
 * @returns {Shadow}
 */
function openShadow(input, options = {}) {
  const baseline = readBaseline(input.stateDir);
  const frozenPath = path.join(input.shadowRoot, FROZEN_DIR);
  const tmpFrozenPath = path.join(input.shadowRoot, TMP_FROZEN_DIR);
  const sealedPath = path.join(input.shadowRoot, SEALED_DIR);
  const sealedTmpPath = path.join(input.shadowRoot, SEALED_TMP_DIR);
  // lstat, not existsSync: a folder swapped for a link is still "there" and
  // is refused below rather than followed.
  const dirThere = (dir) => {
    try { return fs.lstatSync(dir).isDirectory(); } catch { return false; }
  };
  const frozen = dirThere(frozenPath);
  const tmpFrozen = frozen && dirThere(tmpFrozenPath);
  // The seal is complete only when its work copy exists (it is renamed into
  // place last, after its partial copy was whole); a TMPDIR copy rides with it.
  const sealed = frozen && dirThere(sealedPath);
  const sealedTmp = sealed && tmpFrozen && dirThere(sealedTmpPath);
  /** @type {Shadow} */
  const shadow = {
    root: input.shadowRoot,
    work: path.join(input.shadowRoot, "work"),
    base: path.join(input.shadowRoot, "base"),
    tmp: "",
    proposals: "",
    realRoot: baseline.realRoot,
    objects: Array.isArray(baseline.objects) ? baseline.objects.map((/** @type {any} */ entry) => ({ id: String(entry.id), dir: String(entry.dir) })) : [],
    stateDir: input.stateDir,
    method: baseline.method,
  };
  if (frozen) {
    // Shadows made before 2026-10-29 kept the TMPDIR and the channel inside
    // work/: they moved with the tree, so they live under frozen/ (sealed/
    // once sealed).
    shadow.frozen = frozenPath;
    shadow.tmpFrozen = tmpFrozen ? tmpFrozenPath : undefined;
    if (sealed) {
      shadow.sealed = sealedPath;
      shadow.sealedTmp = sealedTmp ? sealedTmpPath : undefined;
    }
    const tmpRoot = sealed ? (sealedTmp ? sealedTmpPath : path.join(sealedPath, TMP_NAME)) : (tmpFrozen ? tmpFrozenPath : path.join(frozenPath, TMP_NAME));
    shadow.tmp = tmpRoot;
    shadow.proposals = tmpRoot.endsWith(TMP_NAME) ? path.join(sealed ? sealedPath : frozenPath, PROPOSALS_NAME) : path.join(tmpRoot, PROPOSALS_NAME);
  } else {
    // Shadows made before 2026-10-29 kept TMPDIR and the channel inside
    // work/.
    const newLayout = dirThere(path.join(input.shadowRoot, TMP_DIR));
    const tmp = newLayout ? path.join(input.shadowRoot, TMP_DIR) : path.join(input.shadowRoot, "work", TMP_NAME);
    shadow.tmp = tmp;
    shadow.proposals = tmp.endsWith(TMP_NAME) ? path.join(input.shadowRoot, "work", PROPOSALS_NAME) : path.join(tmp, PROPOSALS_NAME);
  }
  if (options.check !== false) checkShadow(shadow, { allowMissing: true });
  return shadow;
}

/**
 * Freeze a run's shadow and seal it. Called when the run's engine group is
 * confirmed gone (runs.js endEngine) — the moment the old names stop being
 * final is the moment they stop existing:
 *
 *   1. work/ → frozen/, tmp/ → tmp-frozen/, dsh-home/ → dsh-home-frozen/. The
 *      engine's sandbox allows writes under the old names only, and the
 *      kernel judges each write by the path it resolves to at operation
 *      time, so a process that detached from the group and outlived it can no
 *      longer create, rename, link or write anything *by path* in these
 *      trees or in its DSH_HOME. That is all the renames do: they do not
 *      reach a descriptor or a mapping opened before the freeze, nor a hard
 *      link it made into a folder it could write (round 4) — those still
 *      write the frozen inode.
 *   2. frozen/ and tmp-frozen/ are sealed: copied (APFS clonefile where it
 *      works, new inodes either way) into sealed/ and sealed-tmp/, folders no
 *      write allowance of the engine's sandbox names, whose inodes no old
 *      descriptor, mapping or link can reach. Every server read and write of
 *      the run afterwards goes through sealed/; frozen/ stays on disk only to
 *      be removed with the shadow.
 *
 * A freeze that cannot run — a tampered or already-removed shadow, or a seal
 * that fails — throws, and the run stays live or unsealed (runs.js gates
 * refuse it until the writer discards it). Every step is conditional on the
 * disk's own state, so a freeze that died half way is finished by the next
 * call. Idempotent.
 * @param {{ root: string, work: string, tmp: string, proposals?: string, frozen?: string, tmpFrozen?: string, sealed?: string, sealedTmp?: string, stateDir: string }} shadow
 * @returns {boolean} whether the shadow is frozen and sealed when this returns
 */
function freezeShadow(shadow) {
  checkShadow(shadow);
  const frozenPath = path.join(shadow.root, FROZEN_DIR);
  const tmpFrozenPath = path.join(shadow.root, TMP_FROZEN_DIR);
  const sealedPath = path.join(shadow.root, SEALED_DIR);
  const sealedTmpPath = path.join(shadow.root, SEALED_TMP_DIR);
  const dirThere = (dir) => {
    try { return fs.lstatSync(dir).isDirectory(); } catch { return false; }
  };
  // The work clone moves first. A detached survivor of the group may still be
  // churning inside it — its writes under the old names keep landing until
  // the move, and stop there.
  let renamed = false;
  if (!dirThere(frozenPath) && dirThere(shadow.work)) {
    fs.renameSync(shadow.work, frozenPath);
    renamed = true;
  }
  // The TMPDIR moves once the work clone has: frozen/ existing is the marker
  // that a freeze was in progress (a crash between the renames leaves the
  // rest where it is; the next call finishes them).
  if (dirThere(frozenPath) && !dirThere(tmpFrozenPath)) {
    const liveTmp = path.join(shadow.root, TMP_DIR);
    if (dirThere(liveTmp)) { fs.renameSync(liveTmp, tmpFrozenPath); renamed = true; }
  }
  // The run's DSH_HOME leaves every write allowance too: a hard link the
  // engine made from a file of work/ into it while it ran is still writable
  // by path under the home's old name.
  if (dirThere(frozenPath)) {
    const home = path.join(shadow.root, DSH_HOME_DIR);
    const homeFrozen = path.join(shadow.root, DSH_HOME_FROZEN_DIR);
    if (dirThere(home) && !dirThere(homeFrozen)) { fs.renameSync(home, homeFrozen); renamed = true; }
  }
  if (!dirThere(frozenPath)) return false;
  // A path operation a survivor began under the old names, whose sandbox check
  // passed before the rename, can still finish inside the renamed tree; give
  // those microseconds-long syscalls time to land before anything is read.
  if (renamed) settle(FREEZE_SETTLE_MS);
  shadow.frozen = frozenPath;
  shadow.tmpFrozen = dirThere(tmpFrozenPath) ? tmpFrozenPath : undefined;
  // The seal: copies into names the engine's sandbox never allowed, built
  // under a partial name and renamed into place once whole, so the final
  // name exists only for a complete copy.
  if (!dirThere(sealedPath)) {
    sealOne(frozenPath, sealedPath);
  }
  if (shadow.tmpFrozen && !dirThere(sealedTmpPath)) {
    sealOne(shadow.tmpFrozen, sealedTmpPath);
  }
  shadow.sealed = sealedPath;
  shadow.sealedTmp = dirThere(sealedTmpPath) ? sealedTmpPath : undefined;
  shadow.tmp = shadow.sealedTmp || path.join(sealedPath, TMP_NAME);
  shadow.proposals = shadow.sealedTmp ? path.join(shadow.sealedTmp, PROPOSALS_NAME) : path.join(sealedPath, PROPOSALS_NAME);
  // The identities of all four roots, for checkShadow (a rename keeps dev/ino,
  // so the work/tmp entries recorded at clone time still match too).
  const doc = readBaseline(shadow.stateDir);
  doc.roots = doc.roots || {};
  doc.roots.frozen = rootIdentity(frozenPath);
  if (shadow.tmpFrozen) doc.roots.tmpFrozen = rootIdentity(shadow.tmpFrozen);
  doc.roots.sealed = rootIdentity(sealedPath);
  if (shadow.sealedTmp) doc.roots.sealedTmp = rootIdentity(shadow.sealedTmp);
  fs.writeFileSync(path.join(shadow.stateDir, "baseline.json"), `${JSON.stringify(doc, null, 2)}\n`);
  return true;
}

/**
 * Seal one frozen tree: copy it beside itself under a partial name, then
 * rename the partial copy to `dest`. A leftover partial copy from a freeze
 * that died is removed first.
 * @param {string} source
 * @param {string} dest
 */
function sealOne(source, dest) {
  const partial = `${dest}.partial`;
  forceRemove(partial);
  try {
    sealTree(source, partial);
  } catch (error) {
    // A tree still churning under the walk (an entry vanished or changed
    // type): one more try after a settle, then the seal fails.
    if (/** @type {any} */ (error)?.code !== "seal_failed") { forceRemove(partial); throw error; }
    forceRemove(partial);
    settle(FREEZE_SETTLE_MS);
    try { sealTree(source, partial); } catch (again) { forceRemove(partial); throw again; }
  }
  fs.renameSync(partial, dest);
}

/**
 * A snapshot of a tree (a task turn's work/ before the engine starts): the
 * seal's own copy — APFS clone where it works, the capped walking copy
 * otherwise, every failure a plain `seal_failed` / `folder_too_large` — built
 * under a partial name and renamed into place once whole. `dest` must not
 * exist and belongs outside every engine-writable tree.
 * @param {string} source
 * @param {string} dest
 */
function snapshotTree(source, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  sealOne(source, dest);
}

/**
 * Put paths of a run's after-tree back to what a snapshot held: the snapshot's
 * bytes where it has the file, no file where it has none. Nothing is followed
 * (readNoFollow on the snapshot, noLinkWriteTarget on the tree), and a file
 * lands by a temp name and one rename, with the directories it resolves
 * through re-verified around it, as a staged restore does. A path that cannot
 * be restored that way is refused and left as it is.
 * @param {Shadow} shadow  a frozen and sealed shadow (runs.js checks)
 * @param {string} snapshot
 * @param {string[]} rels
 * @returns {{ restored: string[], refused: Array<{ path: string, reason: string }> }}
 */
function restoreFromSnapshot(shadow, snapshot, rels) {
  checkShadow(shadow);
  const tree = afterWork(shadow);
  /** @type {string[]} */
  const restored = [];
  /** @type {Array<{ path: string, reason: string }>} */
  const refused = [];
  for (const name of rels) {
    try {
      const rel = safeRelative(name);
      /** @type {{ bytes: Buffer, mode: number } | null} */
      let before = null;
      try {
        before = readNoFollow(snapshot, rel);
      } catch (error) {
        if (/** @type {any} */ (error)?.code !== "ENOENT") throw error;
      }
      const target = noLinkWriteTarget(tree, rel, { create: before !== null });
      if (!before) {
        fs.rmSync(target, { force: true });
      } else {
        const temp = path.join(path.dirname(target), `.ais6-rewind-${crypto.randomUUID()}`);
        fs.writeFileSync(temp, before.bytes, { flag: "wx", mode: before.mode | 0o600 });
        try {
          const dirs = directoryChain(tree, rel);
          verifyDirectoryChain(dirs, rel);
          fs.renameSync(temp, target);
          verifyDirectoryChain(dirs, rel);
        } catch (error) {
          fs.rmSync(temp, { force: true });
          throw error;
        }
      }
      restored.push(rel);
    } catch (error) {
      refused.push({ path: name, reason: String(/** @type {any} */ (error)?.code || "refused") });
    }
  }
  return { restored, refused };
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
 * @property {string | null} sha256  digest of the after-bytes the listing read (null for a delete): what the writer reviews is bound to these bytes, and put-back lands only bytes that still match
 * @property {"binary" | "too_large" | null} notShown  why the review cannot show this change's bytes: a NUL byte anywhere on either side (diff would print only "Binary files … differ"), or a side over 1 MiB (no diff is made); null when the diff shows them. Put-back lands such a file only when the writer confirms it by name (confirmUnshown).
 * @property {string} [diff]   unified diff (text files up to 1 MiB)
 */

/**
 * @param {Shadow} shadow
 * @param {string} rel
 */
function inObject(shadow, rel) {
  // The documents folder in any spelling, whether or not the run lent any;
  // a shadow from before it named each document's folder at the top.
  return inDocumentsRoot(rel) || (shadow.objects || []).some((object) => rel === object.dir || rel.startsWith(`${object.dir}/`));
}

/**
 * What the engine changed: work/ against base/. Lent documents (the shadow's
 * objects, everything under the documents folder) are left out unless
 * `objects` is set: they are never put back to disk, so they are not changes
 * the writer reviews; their edits leave only through objectFiles, and a rewind
 * (objects: true) still restores them.
 * @param {Shadow} shadow
 * @param {{ diffs?: boolean, objects?: boolean }} [options]
 * @returns {{ changes: Change[], links: string[] }}
 */
function listChanges(shadow, options = {}) {
  checkShadow(shadow);
  const keep = (/** @type {string} */ rel) => options.objects === true || !inObject(shadow, rel);
  const before = walk(shadow.base);
  const after = walk(afterWork(shadow));
  before.files = before.files.filter(keep);
  after.files = after.files.filter(keep);
  before.links = before.links.filter(keep);
  after.links = after.links.filter(keep);
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
      const b = afterSet.has(rel) ? readNoFollow(afterWork(shadow), rel).bytes : null;
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
    if (options.diffs && !change.notShown) {
      try {
        change.diff = unifiedDiff(beforeSet.has(rel) ? shadow.base : null, afterSet.has(rel) ? afterWork(shadow) : null, rel);
      } catch {
        change.diff = "";
      }
    }
    changes.push(change);
  }
  return { changes, links: newLinks(before.links, after.links, raced) };
}

/**
 * The files of one lent document as the engine left them: paths relative to
 * the document's folder and their text. Read from the settled tree (sealed
 * once the run froze), link by link; a file with a NUL byte is not text and is
 * named in `skipped` instead.
 * @param {Shadow} shadow
 * @param {string} objectId
 * @returns {{ files: Array<{ path: string, text: string, sha256: string }>, skipped: string[] } | null} null when the shadow holds no such document
 */
function objectFiles(shadow, objectId) {
  checkShadow(shadow);
  const object = (shadow.objects || []).find((entry) => entry.id === objectId);
  if (!object) return null;
  const tree = afterWork(shadow);
  const prefix = `${object.dir}/`;
  /** @type {Array<{ path: string, text: string, sha256: string }>} */
  const files = [];
  /** @type {string[]} */
  const skipped = [];
  for (const rel of walk(tree).files.filter((entry) => entry.startsWith(prefix))) {
    const inner = rel.slice(prefix.length);
    try {
      const { bytes } = readNoFollow(tree, rel);
      if (looksBinary(bytes)) skipped.push(inner);
      else files.push({ path: inner, text: bytes.toString("utf8"), sha256: sha256Bytes(bytes) });
    } catch {
      skipped.push(inner);
    }
  }
  return { files, skipped };
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
  // `binary` looks at the first 8 KiB only (the preview's guess at a file
  // type); whether the writer can see the bytes is decided over all of them.
  const notShown = (a && a.includes(0)) || (b && b.includes(0)) ? "binary"
    : Math.max(a ? a.length : 0, b ? b.length : 0) > TEXT_DIFF_LIMIT ? "too_large" : null;
  return { path: rel, kind, binary: looksBinary(sample), notShown, sizeBefore: a ? a.length : null, sizeAfter: b ? b.length : null, sha256: b ? sha256Bytes(b) : null };
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
  try {
    lstatRoot(root);
  } catch (error) {
    if (/** @type {any} */ (error).code === "ENOENT") return { files, links };
    throw error;
  }
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
  checkShadow(shadow);
  const before = await walkAsync(shadow.base, options.maxFiles);
  const after = await walkAsync(afterWork(shadow), options.maxFiles);
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
      const b = afterSet.has(rel) ? (await readNoFollowAsync(afterWork(shadow), rel)).bytes : null;
      change = compareSides(rel, a, b);
    } catch (error) {
      if (["link_refused", "not_a_file", "ENOENT"].includes(String(/** @type {any} */ (error)?.code))) {
        raced.push(rel);
        continue;
      }
      throw error;
    }
    if (!change) continue;
    if (options.diffs && !change.notShown) {
      try {
        change.diff = await unifiedDiffAsync(beforeSet.has(rel) ? shadow.base : null, afterSet.has(rel) ? afterWork(shadow) : null, rel);
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
 * @property {string[]} [confirmUnshown]     files whose bytes the review could not show (Change.notShown), confirmed one path each; "all" never lands one without it
 * @property {(file: string) => void} [trash] how a confirmed delete leaves the real folder
 * @property {boolean} [readOnly]             a 只读 grant never puts anything back
 * @property {Record<string, string | null>} reviewed  path → the sha256 of the after-bytes the writer was shown (null for a delete), as runChanges listed them; a path missing here, or whose bytes no longer match, refuses the whole request (409 changed_since_review) before anything lands
 */

/**
 * @param {Shadow} shadow
 * @param {PutBackRequest} request
 */
function putBack(shadow, request) {
  if (request.readOnly) throw shadowError("read_only", "This folder was shared read-only; nothing can be put back.", 403);
  checkShadow(shadow);
  const { changes } = listChanges(shadow);
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const wanted = request.paths === "all"
    ? changes.map((change) => change.path)
    : [...new Set((request.paths || []).map(safeRelative))];
  // What lands is what the writer reviewed. Every wanted path that still
  // differs must be in the reviewed set with the digest of the bytes the
  // listing just read; one that is not, or does not match, refuses the whole
  // request before any file moves (round 4: a survivor that outlived the
  // engine changed bytes after the review).
  const reviewed = request.reviewed && typeof request.reviewed === "object" ? request.reviewed : null;
  /** @param {string} rel */
  const reviewedDigest = (rel) => (reviewed && Object.prototype.hasOwnProperty.call(reviewed, rel) ? reviewed[rel] : undefined);
  const changedSinceReview = () => shadowError("changed_since_review", "These files changed after you looked at them; look at them again before putting them back.", 409);
  for (const rel of wanted) {
    const change = byPath.get(rel);
    if (!change) continue;
    if (reviewedDigest(rel) === undefined || reviewedDigest(rel) !== change.sha256) throw changedSinceReview();
  }
  const confirmDeletes = new Set((request.confirmDeletes || []).map(safeRelative));
  const overwrite = new Set((request.overwriteConflicts || []).map(safeRelative));
  const confirmUnshown = new Set((request.confirmUnshown || []).map(safeRelative));
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
  const pendingUnshown = [];
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
    // Bytes the review could not show (attack round 5: a NUL past the first
    // 8 KiB, or text over 1 MiB) land only when the writer named the file.
    if (change.kind !== "deleted" && change.notShown && !confirmUnshown.has(rel)) {
      pendingUnshown.push({ path: rel, reason: change.notShown });
      continue;
    }
    const conflict = conflictFor(shadow, baseline, rel);
    if (conflict && !overwrite.has(rel)) {
      conflicts.push({ path: rel, reason: conflict });
      continue;
    }
    // Both write targets are checked before anything moves: no link at any
    // level of the real path (inside the folder or out of it — what lands
    // must be at the path the writer was shown), and none in base/ either.
    let target;
    let baseFile;
    try {
      target = noLinkWriteTarget(shadow.realRoot, rel);
      baseFile = noLinkWriteTarget(shadow.base, rel);
    } catch (error) {
      skipped.push({ path: rel, reason: String(/** @type {any} */ (error).message) });
      continue;
    }
    /** @type {{ bytes: Buffer, mode: number } | null} */
    let source = null;
    if (change.kind !== "deleted") {
      // Read once, without following a link at any level and with the belt on
      // (the identities are re-checked after the open); these bytes are what
      // lands, whatever happens to the run's tree afterwards.
      try {
        source = readNoFollow(afterWork(shadow), rel);
      } catch (error) {
        skipped.push({ path: rel, reason: String(/** @type {any} */ (error)?.message || error) });
        continue;
      }
      // The bytes about to land are hashed here, after the read that
      // produced them, and must be the reviewed ones.
      if (sha256Bytes(source.bytes) !== reviewedDigest(rel)) throw changedSinceReview();
    }
    // The original next: whatever this put-back replaces can be had back.
    /** @type {number | null} */
    let keptMode = null;
    if (fs.existsSync(target)) {
      keptMode = fs.lstatSync(target).mode & 0o777;
      const copy = path.join(snapshotDir, ...rel.split("/"));
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(target, copy);
      snapshotted.push(rel);
    }
    if (change.kind === "deleted") {
      if (fs.existsSync(target)) trash(target);
      fs.rmSync(baseFile, { force: true });
      delete baseline[rel];
    } else {
      const { bytes } = /** @type {{ bytes: Buffer, mode: number }} */ (source);
      // Re-checked with the missing folders made one level at a time.
      target = noLinkWriteTarget(shadow.realRoot, rel, { create: true });
      const temp = path.join(path.dirname(target), `.ais6-putback-${crypto.randomUUID()}`);
      // The mode is the folder's, never the engine's: a replaced file keeps
      // the writer's mode; a new one gets 0666 under this process's umask
      // (the kernel applies it), not the 0600 the engine's umask left in
      // work/.
      fs.writeFileSync(temp, bytes, { flag: "wx", mode: keptMode ?? 0o666 });
      if (keptMode !== null) fs.chmodSync(temp, keptMode);
      // The move carries the same belt as a staged restore: the directories
      // the rename resolves through are re-verified immediately before it and
      // re-checked after it, and the file must land where the writer was
      // shown (rename follows whatever a racer left in an intermediate
      // directory).
      const tempStat = fs.lstatSync(temp, { bigint: true });
      const dirs = directoryChain(shadow.realRoot, rel);
      verifyDirectoryChain(dirs, rel);
      fs.renameSync(temp, target);
      verifyDirectoryChain(dirs, rel);
      const landed = fs.lstatSync(target, { bigint: true });
      if (landed.dev !== tempStat.dev || landed.ino !== tempStat.ino) {
        throw shadowError("link_refused", `This path was swapped while it was written: ${rel}`);
      }
      baseFile = noLinkWriteTarget(shadow.base, rel, { create: true });
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
    pendingUnshown,
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
  forceRemove(shadow.root);
}

/**
 * Remove a tree an engine may have made undeletable: a directory it chmod'ed
 * to 000 stops rmSync (and every discard) with EACCES. Retry after giving
 * the owner access back, directory by directory, then clear user-immutable
 * flags as a last resort. Never follows a link.
 * @param {string} target
 */
function forceRemove(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return;
  } catch {}
  /** @param {string} dir @param {number} depth */
  const reopen = (dir, depth) => {
    if (depth > 4096) return;
    try { fs.chmodSync(dir, 0o700); } catch {}
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink()) reopen(path.join(dir, entry.name), depth + 1);
  };
  try { if (fs.lstatSync(target).isDirectory()) reopen(target, 0); } catch {}
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    spawnSync("/usr/bin/chflags", ["-R", "nouchg,noschg", target], { stdio: "ignore" });
    fs.rmSync(target, { recursive: true, force: true });
  }
}

module.exports = {
  MAX_FILES,
  sealTree,
  snapshotTree,
  restoreFromSnapshot,
  forceRemove,
  DESK_NAME,
  PROPOSALS_NAME,
  TMP_DIR,
  TMP_NAME,
  FROZEN_DIR,
  TMP_FROZEN_DIR,
  SEALED_DIR,
  SEALED_TMP_DIR,
  DSH_HOME_FROZEN_DIR,
  afterWork,
  checkShadow,
  cloneTree,
  UNSAFE_NAME,
  conflictFor,
  createShadow,
  directoryChain,
  freezeShadow,
  listChanges,
  listChangesAsync,
  objectFiles,
  isEnvLayer,
  moveToMacTrash,
  noLinkWriteTarget,
  openNoFollow,
  openShadow,
  putBack,
  readNoFollow,
  readNoFollowAsync,
  removeShadow,
  safeRelative,
  walk,
  walkAsync,
  verifyDirectoryChain,
};
