// Receipts that let a ship gate be paid during development and spent at release.
//
// The seven browser gates cost about eleven minutes together. Most of that work
// is done again at release time although nothing the gate reads has changed.
// A receipt records that one gate passed, and it records a hash of everything
// that gate reads. At release time a gate whose hash is the same as a green
// receipt is reused. Everything else runs.
//
// The policy is fail-closed in three ways:
//
//  1. The rule table below must classify EVERY path in the repository. A path
//     that no rule claims is unmapped, and one unmapped path stops reuse for
//     all gates. This is the rule that tooling/verification-impact.mjs applies
//     to the development gates: an unowned path is a request for the full gate,
//     never permission to guess. The table is checked against the real tree by
//     tests/features/ship-gate-reuse.test.mjs.
//  2. A gate is reused only when its own input hash, its baseline hash, the
//     machine, and the policy hash are all the same as the receipt. Any
//     difference, any unreadable file, or any error makes the gate run.
//  3. A receipt is sealed. A hand-edited receipt does not open.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";
import process from "node:process";

import { releaseStampOf } from "./release-stamp.mjs";

export const GATE_RECEIPT_SCHEMA = "ai-system-6/ship-gate-receipt/v1";
export const GATE_RECEIPT_DIR = "dist/gate-receipts";

// A receipt is only true on the machine that made it. The appearance baselines
// are machine-local because font rasterization is not the same on two hosts, so
// a receipt that says "the pixels matched" carries no information anywhere
// else. The Node and Playwright versions join the binding because they decide
// which browser took the picture.
export const RECEIPT_POLICY_VERSION = 1;

const ALL = "all";
const NONE = null;

/**
 * How a changed path reaches a ship gate.
 *
 * The rules are ordered and the first match wins. `gates: ALL` means every ship
 * gate reads the path. `gates: NONE` means no ship gate can read it, and the
 * `why` says how that is known. A path that matches no rule is unmapped.
 */
export const GATE_INPUT_RULES = Object.freeze([
  {
    id: "live-app",
    pattern: /^apps\//,
    gates: ALL,
    // Every ship gate drives a real browser against apps/server/server.js,
    // which serves the repository root. The page loads apps/desktop/index.html,
    // the two generated bundles, the lazy style bundles, and every lazy module
    // — and a lazy module is fetched from its own source path, not from the
    // bundle. A window may also draw any file under apps/desktop/assets. No
    // gate can say in advance which of those files a window will ask for, so
    // the whole tree is the input set of all of them.
  },
  {
    id: "system-css-reference",
    pattern: /^system\.css-reference(?:\/|$)/,
    gates: ALL,
    // A submodule, but a live browser input: 00-foundation.css draws the
    // checkmark, the radio button and the select button from
    // system.css-reference/icon/. git ls-files reports only the gitlink, so the
    // files below it are collected from the disk instead.
  },
  {
    id: "build-identity",
    pattern: /^(?:package\.json|package-lock\.json|build-info\.json)$/,
    gates: ALL,
    // The version and the build stamp are compiled into
    // apps/desktop/app/generated/, so they can appear on screen. The lock file
    // decides which Playwright, and therefore which browser, takes the picture.
  },
  {
    id: "gate-tooling",
    pattern: /^tooling\//,
    gates: ALL,
    // The gate entry points, their shared libraries, the bundle builder, the
    // runtime and style manifests, and this reuse policy all live here. A rule
    // that named only the import closure of each gate would leave the builder
    // and the policy unguarded, so the directory is an input to every gate.
    // Python bytecode under tooling/__pycache__ is dropped while the files are
    // collected: it is neither served to a browser nor imported by Node.
  },

  // ---- baselines and fixtures that belong to one or two gates ----
  {
    id: "appearance-pixel-baseline",
    pattern: /^internal\/evidence\/drafts\/appearance-baseline\//,
    gates: ["appearance-snapshot", "appearance-token-tables"],
    baselineFor: ["appearance-snapshot", "appearance-token-tables"],
    // The machine-local pixel baseline and token-delta baseline. The pixel net
    // compares against the PNG files here; the token check compares against
    // token-deltas.json in the same directory.
  },
  {
    id: "appearance-snapshot-index",
    pattern: /^tests\/appearance-snapshot\.json$/,
    gates: ["appearance-snapshot"],
    baselineFor: ["appearance-snapshot"],
    // The index that names each baseline cell and holds its hash.
  },
  {
    id: "appearance-cell-manifest",
    pattern: /^tests\/appearance-snapshot-manifest\.mjs$/,
    gates: ["appearance-snapshot", "appearance-token-tables"],
    // Both gates import this module: it says which cells the pixel net renders
    // and which themes the token table compares.
  },
  {
    id: "theme-lab-baseline",
    pattern: /^tests\/visual\/theme-lab\//,
    gates: ["theme-lab-regression"],
    baselineFor: ["theme-lab-regression"],
    // The six-era specimen PNGs that theme-lab-snapshot.mjs --verify compares
    // against. tests/visual/theme-lab-fidelity/ does not match this rule; the
    // fidelity boards belong to a check that is not a ship gate.
  },
  {
    id: "walk-harness",
    pattern: /^tests\/e2e\//,
    gates: ["eight-stop-walk"],
    // verify-walk.mjs imports tests/e2e/helpers.mjs and tests/e2e/fake-model.mjs.
  },
  {
    id: "walk-demo-disk",
    pattern: /^internal\/evidence\/drafts\/dtk-demo-disk\//,
    gates: ["eight-stop-walk"],
    baselineFor: ["eight-stop-walk"],
    // Pass B of the walk mounts this release fixture through the real Project
    // Hard Disk Backup import path and then reads its content at every stop.
  },

  // ---- paths that no browser gate can read ----
  {
    id: "other-tests",
    pattern: /^tests\//,
    gates: NONE,
    // The remaining test material is executed by the deterministic gate, not by
    // a browser. No ship gate imports it, and the import-closure check below
    // refuses reuse if that stops being true.
  },
  {
    id: "internal-notes",
    pattern: /^internal\//,
    gates: NONE,
    // Internal documents, plans, evidence, and the output directories the gates
    // write after they run. internal/ is never served and never shipped.
  },
  { id: "docs", pattern: /^docs\//, gates: NONE },
  { id: "public-site", pattern: /^(?:site|functions|workers|deploy)\//, gates: NONE },
  {
    id: "packaging",
    pattern: /^platform\//,
    gates: NONE,
    // The macOS shell and the frozen native port. Neither is loaded by the
    // browser the gates drive.
  },
  {
    id: "dot-directory",
    pattern: /^\.[^/]+\//,
    gates: NONE,
    // .github, .claude, and the other tool directories.
  },
  {
    id: "root-config",
    pattern: /^(?:\.[^/]+|LICENSE|[^/]+\.md|eslint\.config\.mjs|wrangler\.toml)$/,
    gates: NONE,
    // Root documents, dot files, the lint config and the Pages config. A NEW
    // root file with any other name stays
    // unmapped on purpose: the server serves the repository root, so a file
    // there could become something the browser loads.
  },
]);

// Directories that are walked to build the per-gate hash. Every path a rule can
// claim for a gate is under one of these, so the walk never touches internal
// notes or the site.
const HASHED_ROOTS = Object.freeze([
  "apps",
  "tooling",
  "system.css-reference",
  "internal/evidence/drafts/appearance-baseline",
  "internal/evidence/drafts/dtk-demo-disk",
  "tests/e2e",
  "tests/visual/theme-lab",
  "tests/appearance-snapshot.json",
  "tests/appearance-snapshot-manifest.mjs",
  "package.json",
  "package-lock.json",
  "build-info.json",
]);

// Generated bytes that no gate reads and that change without meaning.
const WALK_SKIP = new Set(["__pycache__", ".DS_Store", "node_modules", ".git"]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function toPosix(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

/** Return the rule that owns a path, or null when nothing owns it. */
export function classifyRepoPath(repoPath) {
  const normalized = toPosix(repoPath);
  return GATE_INPUT_RULES.find((rule) => rule.pattern.test(normalized)) || null;
}

function ruleCoversGate(rule, gate) {
  if (rule.gates === ALL) return true;
  if (!Array.isArray(rule.gates)) return false;
  return rule.gates.includes(gate);
}

function ruleIsBaselineFor(rule, gate) {
  return Array.isArray(rule.baselineFor) && rule.baselineFor.includes(gate);
}

/**
 * The hash of the rule table itself.
 *
 * A receipt carries this. An edit to the table above therefore refuses every
 * receipt written under the old table, which is what a policy change must do.
 */
export function policyDigest() {
  const shape = GATE_INPUT_RULES.map((rule) => [
    rule.id,
    String(rule.pattern),
    rule.gates === ALL ? "all" : (rule.gates || []).join(","),
    (rule.baselineFor || []).join(","),
  ]);
  return sha256(JSON.stringify({ version: RECEIPT_POLICY_VERSION, shape }));
}

function gitPaths(root) {
  const result = spawnSync("git", ["ls-files", "-z", "-c", "-o", "--exclude-standard"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr?.toString("utf8") || "unknown error"}`);
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(toPosix);
}

/**
 * Every path git knows about, classified.
 *
 * Reuse asks this question over the whole tree, not over a diff. A file that
 * has been unmapped for a month is as dangerous as one added this morning,
 * because no gate ever declared that it reads it.
 */
export function collectCoverage(root) {
  const unmapped = [];
  for (const repoPath of gitPaths(root)) {
    if (!classifyRepoPath(repoPath)) unmapped.push(repoPath);
  }
  return { unmapped: unmapped.sort() };
}

function walkFiles(root, relative, out) {
  const absolute = path.join(root, relative);
  let entry;
  try {
    entry = statSync(absolute);
  } catch {
    return out;
  }
  if (entry.isFile()) {
    out.push(relative);
    return out;
  }
  if (!entry.isDirectory()) return out;
  for (const child of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (WALK_SKIP.has(child.name)) continue;
    if (child.isSymbolicLink()) continue;
    walkFiles(root, `${relative}/${child.name}`, out);
  }
  return out;
}

/**
 * Hash what one gate reads.
 *
 * The hash is over the sorted path and content of every file a rule gives to
 * the gate. It is content, not a diff and not a modification time, so a file
 * that git does not track — the two generated bundles, the lazy style bundles,
 * the machine-local baseline — counts the same as a tracked one.
 */
export function computeGateInputs(root, gate, cache = new Map()) {
  if (!cache.has("#files")) {
    const files = [];
    for (const entry of HASHED_ROOTS) walkFiles(root, entry, files);
    cache.set("#files", files.sort());
  }
  const inputHash = createHash("sha256");
  const baselineHash = createHash("sha256");
  let inputCount = 0;
  let baselineCount = 0;
  for (const relative of cache.get("#files")) {
    const rule = classifyRepoPath(relative);
    if (!rule || !ruleCoversGate(rule, gate)) continue;
    // Seven gates share most of their input set, so a file is read once and
    // its hash is answered from the cache for the other six.
    if (!cache.has(relative)) cache.set(relative, sha256(readFileSync(path.join(root, relative))));
    const digest = cache.get(relative);
    inputHash.update(relative).update("\0").update(digest).update("\n");
    inputCount += 1;
    if (ruleIsBaselineFor(rule, gate)) {
      baselineHash.update(relative).update("\0").update(digest).update("\n");
      baselineCount += 1;
    }
  }
  return {
    inputs: { count: inputCount, sha256: inputHash.digest("hex") },
    baseline: baselineCount
      ? { count: baselineCount, sha256: baselineHash.digest("hex") }
      : null,
  };
}

/**
 * Every local module a gate loads, found by reading its import statements.
 *
 * The rule table gives all of tooling/ to every gate, so this closure normally
 * adds nothing. It exists to catch the opposite case: a gate that starts to
 * import a file outside its declared input set. Reuse then stops until the
 * table says so, instead of trusting a hash that misses the new file.
 */
export function importClosure(root, entryRelativePath) {
  const seen = new Set();
  const queue = [toPosix(entryRelativePath)];
  while (queue.length) {
    const current = queue.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    let source;
    try {
      source = readFileSync(path.join(root, current), "utf8");
    } catch {
      continue;
    }
    const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import[\s\S]*?from\s*|import\s*)["']([^"']+)["']/g)]
      .map((match) => match[1])
      .concat([...source.matchAll(/\bjoin\(\s*root\s*,\s*"([^"]+\.mjs)"\s*\)/g)].map((match) => match[1]));
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) {
        queue.push(toPosix(path.posix.join(path.posix.dirname(current), specifier)));
      } else if (specifier.startsWith("tests/") || specifier.startsWith("tooling/")) {
        queue.push(toPosix(specifier));
      }
    }
  }
  seen.delete(toPosix(entryRelativePath));
  return [toPosix(entryRelativePath), ...[...seen].sort()];
}

/** Which closure files the rule table does not give to the gate. */
export function unclaimedClosureFiles(root, gate, entryRelativePath) {
  return importClosure(root, entryRelativePath).filter((relative) => {
    if (!existsSync(path.join(root, relative))) return false;
    const rule = classifyRepoPath(relative);
    return !rule || !ruleCoversGate(rule, gate);
  });
}

function playwrightVersion(root) {
  try {
    return String(JSON.parse(readFileSync(path.join(root, "node_modules/playwright/package.json"), "utf8")).version || "");
  } catch {
    return "";
  }
}

/**
 * What binds a receipt to one host.
 *
 * The pixel baselines are machine-local, so a receipt from another machine
 * proves nothing here. The host name, the CPU, the Node build, and the
 * Playwright build all change what the browser draws or how it behaves.
 */
export function machineBinding(root) {
  const binding = {
    hostname: hostname(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    playwrightVersion: playwrightVersion(root),
  };
  return { ...binding, sha256: sha256(JSON.stringify(binding)) };
}

// The seal must cover the whole receipt, and every level of it. An early
// version sealed with a JSON replacer list, which reaches only the top-level
// keys: a hand-edited machine.hostname then kept a valid seal. The canonical
// form below sorts and includes every nested key instead.
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

function seal(receipt) {
  return sha256(JSON.stringify(canonical(receipt)));
}

function receiptPath(root, gate) {
  return path.join(root, GATE_RECEIPT_DIR, `${gate}.json`);
}

export function writeGateReceipt(root, gate, { command, durationMs, sourceCommit, current }) {
  const receipt = {
    schema: GATE_RECEIPT_SCHEMA,
    gate,
    command,
    exitCode: 0,
    durationMs,
    passedAt: new Date().toISOString(),
    sourceCommit: sourceCommit || "",
    policy: { version: RECEIPT_POLICY_VERSION, sha256: policyDigest() },
    inputs: current.inputs,
    baseline: current.baseline,
    machine: current.machine,
    // The release identity compiled into the tested bytes. It decides nothing:
    // the input hash above already covers the two generated files that carry
    // it. It is recorded so a later refusal can name its cause instead of
    // leaving a bare "input-mismatch" for a person to go and find.
    stamp: releaseStampOf(root),
  };
  receipt.seal = { algorithm: "sha256", digest: seal(receipt) };
  const destination = receiptPath(root, gate);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { receipt, destination };
}

/** Drop a receipt. A gate that failed must not leave a green one behind. */
export function dropGateReceipt(root, gate) {
  rmSync(receiptPath(root, gate), { force: true });
}

export function readGateReceipt(root, gate) {
  try {
    return JSON.parse(readFileSync(receiptPath(root, gate), "utf8"));
  } catch {
    return null;
  }
}

/** Measure the gate now, so a decision and a new receipt use the same numbers. */
export function currentGateState(root, gate, cache) {
  return { ...computeGateInputs(root, gate, cache), machine: machineBinding(root) };
}

/**
 * May this gate be reused?
 *
 * Every answer other than "yes" is a reason to run. The caller never sees a
 * "probably": an error while the receipt is read is refusal, not doubt.
 */
export function evaluateReuse(root, gate, { current, coverage, entryRelativePath, allowReuse = true }) {
  if (!allowReuse) return { reusable: false, reason: "no-reuse-requested" };
  if (coverage.unmapped.length) {
    return { reusable: false, reason: `unmapped-paths:${coverage.unmapped.length}` };
  }
  if (entryRelativePath) {
    const stray = unclaimedClosureFiles(root, gate, entryRelativePath);
    if (stray.length) return { reusable: false, reason: `undeclared-input:${stray[0]}` };
  }
  const receipt = readGateReceipt(root, gate);
  if (!receipt) return { reusable: false, reason: "no-receipt" };
  if (receipt.schema !== GATE_RECEIPT_SCHEMA) return { reusable: false, reason: "receipt-schema" };
  if (receipt.gate !== gate) return { reusable: false, reason: "receipt-gate-mismatch" };
  if (receipt.seal?.algorithm !== "sha256" || receipt.seal?.digest !== seal(receipt)) {
    return { reusable: false, reason: "receipt-seal-mismatch" };
  }
  if (receipt.exitCode !== 0) return { reusable: false, reason: "receipt-not-green" };
  if (receipt.policy?.sha256 !== policyDigest()) return { reusable: false, reason: "policy-drift" };
  if (receipt.machine?.sha256 !== current.machine.sha256) return { reusable: false, reason: "machine-mismatch" };
  const baselineNow = current.baseline?.sha256 || "";
  const baselineThen = receipt.baseline?.sha256 || "";
  if (baselineNow !== baselineThen) return { reusable: false, reason: "baseline-mismatch" };
  if (receipt.inputs?.sha256 !== current.inputs.sha256) {
    // Name the cause when it is the one that is otherwise invisible. A receipt
    // banked in a development tree and spent inside a release's frozen tree
    // differs by the release source stamp alone, and a bare "input-mismatch"
    // sends the reader looking through 7000 files for it.
    const banked = receipt.stamp?.sourceCommit;
    const now = releaseStampOf(root)?.sourceCommit;
    if (typeof banked === "string" && typeof now === "string" && banked !== now) {
      return {
        reusable: false,
        reason: `input-mismatch (release stamp differs: banked "${banked.slice(0, 12) || "none"}",`
          + ` now "${now.slice(0, 12) || "none"}"; bank with npm run verify:gate -- --all --release-stamp)`,
      };
    }
    return { reusable: false, reason: "input-mismatch" };
  }
  return { reusable: true, reason: "input-hash-match", receipt };
}
