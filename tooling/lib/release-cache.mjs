// A machine-local store for release steps that development already paid for.
//
// tooling/lib/gate-receipts.mjs does this for the seven browser gates: a gate
// banks a receipt keyed to a content hash of everything it reads, and a release
// spends the receipt instead of running the gate again. This module applies the
// same discipline to the rest of the release — the deterministic gate, the
// public source snapshot, and the two dependency installs — which together cost
// about ninety seconds of a release that repeats them although nothing they
// read has moved.
//
// The difference is that these steps have OUTPUT. A reused browser gate gives
// back a verdict; a reused `npm ci` must give back node_modules, and a reused
// `verify:release` must give back the bundle it built and the base receipt it
// sealed. So an entry holds both: the sealed claim and the exact bytes.
//
// The policy is fail-closed in the same three ways as a gate receipt:
//
//  1. The key must describe EVERY input of the step. Where a complete list is
//     not cheap, the key uses something wider than the real input set — the
//     source tree hash instead of the file list the manifest allows. A wider
//     key refuses more often than it must; it can never accept too often.
//  2. An entry is spent only when the key, the policy version and the machine
//     are the same, AND every stored byte still hashes to what the entry says.
//     Any difference, any unreadable file, and any error is a reason to run.
//  3. An entry is sealed. A hand-edited entry does not open.
//
// One rule is borrowed whole from the gate receipts: a repository path that no
// gate-input rule claims turns reuse OFF for the entire release, this store
// included. An unowned path is a request for the full release, never permission
// to guess.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { collectCoverage, machineBinding, sha256 } from "./gate-receipts.mjs";

export const RELEASE_CACHE_SCHEMA = "ai-system-6/release-step-cache/v1";
export const RELEASE_CACHE_DIR = "dist/release-cache";

// Bump this when the meaning of a key or of a payload changes. Every entry
// written under an older version is then refused, which is what a policy change
// must do.
export const RELEASE_CACHE_POLICY_VERSION = 1;

// How many entries one step keeps. A release keeps its own entry and the entry
// of the release before it, so a re-prepared commit and its predecessor both
// stay warm; older payloads are deleted because node_modules is half a gigabyte.
const KEEP_ENTRIES_PER_STEP = 3;

const WALK_SKIP = new Set([".DS_Store", ".git"]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "seal")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

function seal(entry) {
  return sha256(JSON.stringify(canonical(entry)));
}

/** sha256 of a file, or "" when it cannot be read. An unreadable input is a miss, never a pass. */
export function fileDigest(filePath) {
  try {
    return sha256(readFileSync(filePath));
  } catch {
    return "";
  }
}

/**
 * The key of one step.
 *
 * The machine joins every key: a payload made on this host is bytes for this
 * host, and node_modules holds compiled native binaries that say so.
 */
export function releaseStepKey(root, step, parts) {
  return sha256(JSON.stringify(canonical({
    schema: RELEASE_CACHE_SCHEMA,
    policy: RELEASE_CACHE_POLICY_VERSION,
    step,
    machine: machineBinding(root).sha256,
    parts,
  })));
}

/**
 * May the release spend anything at all?
 *
 * One repository path that no gate-input rule claims stops reuse for every ship
 * gate. The same answer holds here: if the rule table cannot say what reads a
 * file, no cached step may claim it read the right bytes.
 */
export function releaseReuseAllowed(root, { allowReuse = true } = {}) {
  if (!allowReuse) return { allowed: false, reason: "no-reuse-requested", unmapped: [] };
  let coverage;
  try {
    coverage = collectCoverage(root);
  } catch (error) {
    return { allowed: false, reason: `coverage-unreadable:${error.message}`, unmapped: [] };
  }
  if (coverage.unmapped.length) {
    return {
      allowed: false,
      reason: `unmapped-paths:${coverage.unmapped.length}`,
      unmapped: coverage.unmapped,
    };
  }
  return { allowed: true, reason: "coverage-complete", unmapped: [] };
}

function entryRoot(cacheRoot, step, key) {
  return path.join(cacheRoot, RELEASE_CACHE_DIR, step, key.slice(0, 32));
}

function walkPayload(root, relative, out) {
  const absolute = relative ? path.join(root, relative) : root;
  let entry;
  try {
    entry = lstatSync(absolute);
  } catch {
    return out;
  }
  if (entry.isSymbolicLink()) {
    out.push({ path: relative, kind: "symlink", target: readlinkSync(absolute) });
    return out;
  }
  if (entry.isFile()) {
    out.push({
      path: relative,
      kind: "file",
      bytes: entry.size,
      // Only the execute bit survives a copy in a way that matters: a package
      // binary that loses it stops being runnable.
      executable: (entry.mode & 0o111) !== 0,
      sha256: sha256(readFileSync(absolute)),
    });
    return out;
  }
  if (!entry.isDirectory()) return out;
  for (const child of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (WALK_SKIP.has(child.name)) continue;
    walkPayload(root, relative ? `${relative}/${child.name}` : child.name, out);
  }
  return out;
}

/** Every file under the given relative paths, hashed. */
export function payloadManifest(root, relativePaths) {
  const files = [];
  for (const relative of [...new Set(relativePaths)].sort()) walkPayload(root, relative, files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  return {
    fileCount: files.length,
    bytes: files.reduce((total, file) => total + (file.bytes || 0), 0),
    sha256: sha256(JSON.stringify(files)),
    files,
  };
}

/**
 * Copy a tree, cloning the blocks where the file system can.
 *
 * On APFS `cp -c` writes a copy-on-write clone: half a gigabyte of node_modules
 * lands in about a second and costs no extra disk. `cp -c` fails as a whole on a
 * file system that cannot clone, so the plain copy is the fallback.
 */
export function cloneTree(source, destination) {
  mkdirSync(path.dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  const attempts = process.platform === "darwin"
    ? [["-c", "-R", "-p"], ["-R", "-p"]]
    : [["-R", "-p"]];
  let last = null;
  for (const flags of attempts) {
    last = spawnSync("cp", [...flags, source, destination], { encoding: "utf8" });
    if (last.status === 0) return;
    rmSync(destination, { recursive: true, force: true });
  }
  throw new Error(`could not copy ${source} → ${destination}: ${last?.stderr || "unknown error"}`);
}

/**
 * Read the entry for a key and prove its payload is still the bytes it claims.
 *
 * Every answer other than a hit is a reason to run the step. The payload is
 * re-hashed here rather than trusted: the store lives in a working directory
 * that other work also writes to.
 */
export function lookupReleaseStep(cacheRoot, step, key) {
  const home = entryRoot(cacheRoot, step, key);
  const entryPath = path.join(home, "entry.json");
  let entry;
  try {
    entry = JSON.parse(readFileSync(entryPath, "utf8"));
  } catch {
    return { hit: false, reason: "no-entry" };
  }
  if (entry.schema !== RELEASE_CACHE_SCHEMA) return { hit: false, reason: "entry-schema" };
  if (entry.step !== step) return { hit: false, reason: "entry-step-mismatch" };
  if (entry.key !== key) return { hit: false, reason: "entry-key-mismatch" };
  if (entry.policy !== RELEASE_CACHE_POLICY_VERSION) return { hit: false, reason: "policy-drift" };
  if (entry.seal?.algorithm !== "sha256" || entry.seal?.digest !== seal(entry)) {
    return { hit: false, reason: "entry-seal-mismatch" };
  }
  if (entry.machine?.sha256 !== machineBinding(cacheRoot).sha256) {
    return { hit: false, reason: "machine-mismatch" };
  }
  const payloadRoot = path.join(home, "payload");
  let present;
  try {
    present = payloadManifest(payloadRoot, entry.payload.roots);
  } catch (error) {
    return { hit: false, reason: `payload-unreadable:${error.message}` };
  }
  if (present.sha256 !== entry.payload.sha256) return { hit: false, reason: "payload-mismatch" };
  return { hit: true, reason: "key-and-payload-match", entry, payloadRoot };
}

function pruneStep(cacheRoot, step, keepKey) {
  const stepRoot = path.join(cacheRoot, RELEASE_CACHE_DIR, step);
  let entries;
  try {
    entries = readdirSync(stepRoot, { withFileTypes: true }).filter((child) => child.isDirectory());
  } catch {
    return;
  }
  const dated = entries.map((child) => {
    const home = path.join(stepRoot, child.name);
    let at = 0;
    try {
      at = statSync(path.join(home, "entry.json")).mtimeMs;
    } catch {
      at = 0;
    }
    return { home, name: child.name, at };
  }).sort((left, right) => right.at - left.at);
  for (const candidate of dated.slice(KEEP_ENTRIES_PER_STEP)) {
    if (candidate.name === keepKey.slice(0, 32)) continue;
    rmSync(candidate.home, { recursive: true, force: true });
  }
}

/**
 * Store what a step produced, under the key of what it read.
 *
 * `roots` are repository-relative paths inside `sourceRoot`. They are cloned
 * whole, then hashed from the stored copy — so the entry describes the bytes
 * the next release will actually restore, not the bytes that were on disk a
 * moment earlier.
 */
export function saveReleaseStep(cacheRoot, step, key, {
  sourceRoot,
  roots,
  durationMs = 0,
  sourceCommit = "",
  note = "",
}) {
  const home = entryRoot(cacheRoot, step, key);
  const payloadRoot = path.join(home, "payload");
  rmSync(home, { recursive: true, force: true });
  mkdirSync(payloadRoot, { recursive: true });
  const stored = [];
  for (const relative of [...new Set(roots)].sort()) {
    const source = path.join(sourceRoot, relative);
    if (!existsSync(source)) continue;
    cloneTree(source, path.join(payloadRoot, relative));
    stored.push(relative);
  }
  const manifest = payloadManifest(payloadRoot, stored);
  const entry = {
    schema: RELEASE_CACHE_SCHEMA,
    step,
    key,
    policy: RELEASE_CACHE_POLICY_VERSION,
    createdAt: new Date().toISOString(),
    durationMs,
    sourceCommit,
    note,
    machine: machineBinding(cacheRoot),
    payload: {
      roots: stored,
      fileCount: manifest.fileCount,
      bytes: manifest.bytes,
      sha256: manifest.sha256,
    },
  };
  entry.seal = { algorithm: "sha256", digest: seal(entry) };
  writeFileSync(path.join(home, "entry.json"), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  pruneStep(cacheRoot, step, key);
  return { entry, home, payloadRoot };
}

