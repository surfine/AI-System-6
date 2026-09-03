// Which gate is run by what — computed from the tree, never from a list.
//
// A gate that nothing runs cannot go red. tooling/verify-control-census.mjs was
// written, given an npm script, and left out of every runner, so the ratchet it
// guards was inert from the day it landed while the count it holds was believed
// to be held. tests/features/gate-self-proof.test.mjs asks whether a gate goes
// red on its own defect; this module asks the question underneath it — whether
// anything ever asks the gate at all.
//
// The enumeration below reads the filesystem and package.json. A hand-written
// list of gates would carry the same defect one level up: the next gate nobody
// wires is exactly the one a hand-written list would not mention.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { SHIP_GATES, shipGateEntry } from "./ship-gates.mjs";
import { repositoryRoot } from "./paths.mjs";

/**
 * A file in tooling/ is a gate when its name says it judges something.
 *
 * The four prefixes are the repository's own vocabulary for a check. Every ship
 * gate entry point joins them whatever it is called, because SHIP_GATES names
 * it as a release condition.
 */
const GATE_FILE_PATTERN = /^(?:verify|audit|smoke|check)-[\w.-]+\.mjs$/;

/**
 * A gate can refuse; a reporter cannot.
 *
 * The five audit-*.mjs tools print a shopping list and always exit 0 — a
 * reader's instrument, not a condition. Asking who runs them would be asking
 * the wrong question, so they are told apart by what they can do rather than by
 * their name: a non-zero exit or a thrown error is the whole vocabulary a Node
 * gate has for refusing.
 */
function canRefuse(source) {
  return /process\.exit(?:Code)?\s*[(=]\s*(?!0\s*[);])/.test(source) || /\bthrow\s+new\s+/.test(source);
}

/**
 * Runners whose green is a claim about the product.
 *
 * These are the entry points a human, a release, or CI actually invokes. The
 * two development-loop runners are listed apart: a gate only they reach is
 * offered to a developer who thinks to ask for it, which is not the same as a
 * gate a release cannot skip.
 */
export const RELEASE_ROOT_SCRIPTS = Object.freeze([
  "verify:release",
  "verify:ship",
  "release",
  "deploy:web",
  "deploy:pages",
  "bundle:mac-app",
]);
export const DEVELOPMENT_ROOT_SCRIPTS = Object.freeze(["verify:quick", "verify:changed"]);

function toPosix(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}

function readIfPresent(root, relative) {
  const absolute = join(root, relative);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

/** npm run <name>, node tooling/<file>.mjs, and the implicit pre/post hooks. */
function scriptEdges(name, scripts) {
  const body = scripts[name];
  const edges = new Set();
  if (typeof body !== "string") return edges;
  for (const match of body.matchAll(/npm run ([\w:.-]+)/g)) edges.add(`script:${match[1]}`);
  for (const match of body.matchAll(/node (tooling\/[\w./-]+\.mjs)/g)) edges.add(`file:${match[1]}`);
  if (scripts[`pre${name}`]) edges.add(`script:pre${name}`);
  if (scripts[`post${name}`]) edges.add(`script:post${name}`);
  return edges;
}

/**
 * What a runner file runs, and what it is built from.
 *
 * A tooling path counts only where a command begins: first element of an argv
 * array, or first argument of a call. That is how this repository spawns a
 * gate, and it is what separates running a gate from naming one. Two things
 * name gates without running them, and both were read as wiring before the rule
 * was tightened: a comment in verify-release.mjs says the native action audit
 * still runs on demand, and verify-public-tree.mjs lists that same audit among
 * the files the public snapshot must NOT carry. A path after a comma is
 * therefore an entry in a list, never a command.
 *
 * Local imports are followed as well, so a runner that keeps its gate list in a
 * library (tooling/lib/ship-gates.mjs) is read through to the gates.
 */
function fileEdges(root, relative) {
  const source = readIfPresent(root, relative);
  const edges = new Set();
  if (!source) return edges;
  for (const match of source.matchAll(/[[(]\s*\n?\s*"(tooling\/[\w./-]+\.mjs)"/g)) {
    edges.add(`file:${match[1]}`);
  }
  for (const match of source.matchAll(/"run",\s*"([\w:.-]+)"/g)) edges.add(`script:${match[1]}`);
  for (const match of source.matchAll(/(?:^|\n)\s*import[\s\S]{0,200}?from\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const directory = relative.slice(0, relative.lastIndexOf("/"));
    const resolved = toPosix(new URL(specifier, `file:///${directory}/`).pathname.slice(1));
    if (resolved.startsWith("tooling/")) edges.add(`file:${resolved}`);
  }
  return edges;
}

function workflowRoots(root) {
  const directory = join(root, ".github/workflows");
  if (!existsSync(directory)) return [];
  const names = new Set();
  for (const entry of readdirSync(directory)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const source = readFileSync(join(directory, entry), "utf8");
    for (const match of source.matchAll(/npm run ([\w:.-]+)/g)) names.add(`script:${match[1]}`);
  }
  return [...names].sort();
}

function reachableFrom(root, scripts, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    const edges = node.startsWith("script:")
      ? scriptEdges(node.slice("script:".length), scripts)
      : fileEdges(root, node.slice("file:".length));
    for (const next of edges) stack.push(next);
  }
  return seen;
}

/**
 * The whole picture: every gate, what runs it, and what nothing runs.
 */
export function computeGateWiring(root = repositoryRoot, { shipGates = SHIP_GATES } = {}) {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts || {};

  // Two ways a file says it is a gate: its own name, and the name of the npm
  // script that runs it. tooling/visual-snapshot.mjs says neither in its
  // filename, but `npm run verify:visual` calls it a verification, and a script
  // that calls itself one is claiming to be a condition.
  const candidates = new Set(
    readdirSync(join(root, "tooling"))
      .filter((name) => GATE_FILE_PATTERN.test(name))
      .map((name) => `tooling/${name}`),
  );
  for (const [name, body] of Object.entries(scripts)) {
    if (!/^(?:verify|smoke|check):/.test(name)) continue;
    for (const match of body.matchAll(/node (tooling\/[\w./-]+\.mjs)/g)) {
      if (existsSync(join(root, match[1]))) candidates.add(match[1]);
    }
  }
  const gateFiles = new Set();
  const reporters = [];
  for (const file of [...candidates].sort()) {
    if (canRefuse(readIfPresent(root, file))) gateFiles.add(file);
    else reporters.push(file);
  }
  // A ship gate is a release condition by declaration, whatever it is called.
  for (const gate of shipGates) gateFiles.add(toPosix(shipGateEntry(gate)));

  const roots = new Map();
  for (const name of RELEASE_ROOT_SCRIPTS) {
    if (scripts[name]) roots.set(name, { kind: "release", nodes: [`script:${name}`] });
  }
  for (const name of DEVELOPMENT_ROOT_SCRIPTS) {
    if (scripts[name]) roots.set(name, { kind: "development", nodes: [`script:${name}`] });
  }
  const ci = workflowRoots(root);
  if (ci.length) roots.set("CI", { kind: "release", nodes: ci });

  const reach = new Map();
  for (const [label, entry] of roots) reach.set(label, reachableFrom(root, scripts, entry.nodes));

  const gates = [...gateFiles].sort().map((file) => {
    const node = `file:${file}`;
    const npmScripts = Object.entries(scripts)
      .filter(([, body]) => body.includes(`node ${file}`))
      .map(([name]) => name)
      .sort();
    const runners = [...roots.keys()]
      // A root does not run itself: `npm run verify:release` IS
      // tooling/verify-release.mjs, and calling that "wired" would say a runner
      // holds itself.
      .filter((label) => !(roots.get(label).nodes.length === 1
        && scripts[label] === `node ${file}`))
      .filter((label) => reach.get(label).has(node));
    const kinds = new Set(runners.map((label) => roots.get(label).kind));
    return {
      file,
      npmScripts,
      runners,
      isRoot: RELEASE_ROOT_SCRIPTS.concat(DEVELOPMENT_ROOT_SCRIPTS)
        .some((name) => scripts[name] === `node ${file}`),
      wiring: kinds.has("release") ? "release" : (kinds.has("development") ? "development" : "orphan"),
    };
  });

  // ---- the reverse defects -------------------------------------------------
  const dangling = [];
  for (const [name, body] of Object.entries(scripts)) {
    for (const match of body.matchAll(/node (tooling\/[\w./-]+\.mjs)/g)) {
      if (!existsSync(join(root, match[1]))) dangling.push(`npm script ${name} runs ${match[1]}, which does not exist`);
    }
  }
  for (const entry of readdirSync(join(root, "tooling"))) {
    if (!entry.endsWith(".mjs")) continue;
    const source = readFileSync(join(root, "tooling", entry), "utf8");
    for (const match of source.matchAll(/[[(]\s*\n?\s*"(tooling\/[\w./-]+\.mjs)"/g)) {
      if (!existsSync(join(root, match[1]))) dangling.push(`tooling/${entry} runs ${match[1]}, which does not exist`);
    }
  }
  for (const node of workflowRoots(root)) {
    const name = node.slice("script:".length);
    if (!scripts[name]) dangling.push(`.github/workflows names npm run ${name}, which is not a script`);
  }
  for (const gate of shipGates) {
    const entry = toPosix(shipGateEntry(gate));
    if (!existsSync(join(root, entry))) dangling.push(`ship gate ${gate.name} runs ${entry}, which does not exist`);
  }

  // A script called verify:phase5 that runs verify-appearance-phase5.mjs is a
  // short name, not a defect; it is reported so a reader can tell the short
  // name from a wrong one.
  const nameMismatches = [];
  for (const [name, body] of Object.entries(scripts)) {
    const match = body.match(/node tooling\/((?:verify|audit|smoke|check)-[\w.-]+)\.mjs/);
    if (!match) continue;
    const stem = match[1].replace(/^(?:verify|audit|smoke|check)-/, "").replaceAll("-", "");
    const tail = name.split(":").slice(1).join("").replaceAll("-", "");
    if (tail && !stem.includes(tail) && !tail.includes(stem)) {
      nameMismatches.push(`${name} -> tooling/${match[1]}.mjs`);
    }
  }

  return { gates, reporters: reporters.sort(), dangling, nameMismatches, rootLabels: [...roots.keys()] };
}

export function orphanGates(wiring) {
  return wiring.gates.filter((gate) => gate.wiring === "orphan" && !gate.isRoot);
}
