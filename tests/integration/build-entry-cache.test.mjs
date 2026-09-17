// The generated-asset cache, driven through the entry a person runs.
//
// tests/features/generated-assets-cache.test.mjs holds the cache itself with
// fixture generators: digests, receipts, invalid receipts, failed generators,
// inputs edited mid-build. What it cannot show is that the entry developers and
// CI actually run is wired to it — which is the mistake this closes, because the
// public `prebuild:app` spent months naming two vendor builds directly while the
// cache sat beside it unused.
//
// So this runs `npm run prebuild:app` for real, three times over, with mutations
// that are put back byte-for-byte: a stylesheet edit must not repackage the CMF
// renderer, a deleted vendor output must come back, and a changed generator
// input must invalidate. The tree is checked clean afterwards, and every
// mutation is restored in a `finally` whether the assertions passed or not.

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STYLE = "apps/desktop/styles/10-windows.css";
const VENDOR_OUTPUT = "apps/desktop/app/vendor/embed/transformers.min.js";
const GENERATOR = "tooling/build-embed-vendor.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`OK  build-entry-cache: ${message}`);
}

function runEntry() {
  const started = Date.now();
  const result = spawnSync("npm", ["run", "prebuild:app"], { cwd: root, encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) throw new Error(`prebuild:app failed (${result.status}):\n${output}`);
  const steps = new Map();
  for (const line of output.split("\n")) {
    const match = /^\[prebuild\] ([\w-]+): (cached|ran)/.exec(line.trim());
    if (match) steps.set(match[1], match[2]);
  }
  const complete = /^\[prebuild\] complete/m.test(output);
  return { steps, complete, ms: Date.now() - started };
}

/**
 * The same entry a second way. `npm run prebuild:app` runs
 * `node tooling/build-preapp.mjs`, so the two invocations differ only in the
 * environment npm injects — which is how the cache used to be defeated: it
 * fingerprinted every variable, so `npm run build:app` and the in-process
 * prebuild behind `npm run dev` each repackaged what the other had just
 * written, about 12.6 s of vendor and atlas work for no input change.
 */
function runEntryDirectly() {
  const result = spawnSync(process.execPath, ["tooling/build-preapp.mjs"], { cwd: root, encoding: "utf8" });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) throw new Error(`tooling/build-preapp.mjs failed (${result.status}):\n${output}`);
  const steps = new Map();
  for (const line of output.split("\n")) {
    const match = /^\[prebuild\] ([\w-]+): (cached|ran)/.exec(line.trim());
    if (match) steps.set(match[1], match[2]);
  }
  return { steps, complete: /^\[prebuild\] complete/m.test(output) };
}

const originals = new Map();
const remember = (relativePath) => {
  if (!originals.has(relativePath)) originals.set(relativePath, readFileSync(path.join(root, relativePath)));
};
const restore = (relativePath) => {
  const bytes = originals.get(relativePath);
  if (bytes) writeFileSync(path.join(root, relativePath), bytes);
};

let failures = 0;
try {
  // 1. The entry runs, and a second run with nothing changed writes nothing.
  const first = runEntry();
  assert(first.complete, "the entry runs every declared step to completion");
  assert(first.steps.size >= 6, `the entry reports each step (${[...first.steps.keys()].join(", ")})`);

  const digestBefore = readFileSync(path.join(root, VENDOR_OUTPUT));
  const second = runEntry();
  assert(
    [...second.steps.values()].every((mode) => mode === "cached"),
    `a second run with no input change repackages nothing (${[...second.steps].map(([name, mode]) => `${name}:${mode}`).join(", ")})`
  );
  assert(
    readFileSync(path.join(root, VENDOR_OUTPUT)).equals(digestBefore),
    "and leaves the artifacts byte-for-byte as they were"
  );

  // The same entry started the other way round. This is the guard for the
  // whole-environment fingerprint: the two runs below are the same command, so
  // anything they disagree about is npm's own variables, not an input.
  const viaNode = runEntryDirectly();
  assert(viaNode.complete, "the entry runs when it is started directly as well as through npm");
  assert(
    [...viaNode.steps.values()].every((mode) => mode === "cached"),
    `npm's own environment variables are not inputs (${[...viaNode.steps].map(([name, mode]) => `${name}:${mode}`).join(", ")})`
  );
  const backThroughNpm = runEntry();
  assert(
    [...backThroughNpm.steps.values()].every((mode) => mode === "cached"),
    "and the npm invocation still reuses what the direct one wrote"
  );

  // 2. A stylesheet edit is not a vendor input: the CMF renderer is not rebuilt.
  remember(STYLE);
  writeFileSync(path.join(root, STYLE), `${readFileSync(path.join(root, STYLE), "utf8")}\n/* build-entry-cache probe */\n`);
  const afterStyle = runEntry();
  assert(
    afterStyle.steps.get("cmf-renderer-vendor") === "cached",
    "editing an ordinary stylesheet does not repackage the CMF renderer"
  );
  restore(STYLE);

  // 3. A deleted output is rebuilt: the cache is keyed on inputs and on the
  //    artifact being there, not on a receipt alone.
  const created = statSync(path.join(root, VENDOR_OUTPUT)).mtimeMs;
  rmSync(path.join(root, VENDOR_OUTPUT));
  const afterDelete = runEntry();
  assert(afterDelete.steps.get("embed-vendor") === "ran", "a deleted vendor output is rebuilt");
  const rebuilt = readFileSync(path.join(root, VENDOR_OUTPUT));
  assert(rebuilt.equals(digestBefore), "and comes back byte-for-byte identical");
  assert(statSync(path.join(root, VENDOR_OUTPUT)).mtimeMs >= created, "the file is really there again");

  // 4. A changed generator input invalidates the step that reads it.
  remember(GENERATOR);
  writeFileSync(path.join(root, GENERATOR), `${readFileSync(path.join(root, GENERATOR), "utf8")}\n// build-entry-cache probe\n`);
  const afterInput = runEntry();
  assert(afterInput.steps.get("embed-vendor") === "ran", "a changed generator invalidates its own step");
  // The whole tooling tree is conservatively an input of every step — it carries
  // the generator and the patches they read — so an edit there legitimately
  // invalidates more than the one step that names it. What must hold either way
  // is that the artifact is what it was: invalidation is not a licence to
  // produce different bytes.
  assert(
    readFileSync(path.join(root, VENDOR_OUTPUT)).equals(digestBefore),
    "and the rebuilt artifact is byte-for-byte what it was"
  );
  restore(GENERATOR);
  const afterRestore = runEntry();
  assert(afterRestore.steps.get("embed-vendor") === "ran", "putting the input back invalidates it again");
} catch (error) {
  console.error(error.message);
  failures = 1;
} finally {
  for (const relativePath of originals.keys()) restore(relativePath);
  // Only the files this test touched are checked: the working tree is allowed to
  // hold other work in progress.
  for (const [relativePath, bytes] of originals) {
    if (!readFileSync(path.join(root, relativePath)).equals(bytes)) {
      console.error(`the check did not put ${relativePath} back`);
      failures = 1;
    }
  }
  const touchedStatus = spawnSync(
    "git",
    ["status", "--porcelain", "--", ...originals.keys()],
    { cwd: root, encoding: "utf8" }
  ).stdout.trim();
  if (touchedStatus) {
    console.error(`a file this check touched is still different:\n${touchedStatus}`);
    failures = 1;
  }
}

if (failures) process.exit(1);
console.log("\nbuild-entry-cache integration test passed.");
