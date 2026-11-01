import { readFileSync } from "node:fs";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";
import { appModulePaths, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";
import { join } from "node:path";

const test = createFeatureTest("lazy-action-handlers");

// A bare function reference in the action registry resolves the moment the
// registry object is built. If the function it names lives only in a lazily
// loaded module, that is a ReferenceError at boot — and because
// getApplicationCommandRegistry() builds the whole object at once,
// handleAction() then cannot dispatch ANY action. Every menu row and every
// data-action button goes dead, in silence.
//
// This is written down in CLAUDE.md under Common Pitfalls ("Making an eager
// module lazy: bare function references bite first") and it has now happened
// three times. A documented pitfall with no executable contract is a pitfall
// that gets to happen again, so this is the contract.
//
// The escape hatch is real and must not be flagged: config.js installs eager
// stubs with installLazyFunctionStub(name, ensureModule), which load the module
// and then call through. A handler whose name has a stub is safe, which is why
// this gate resolves names rather than just grepping for laziness — the naive
// version reports twenty-one false alarms on a healthy tree.

const actions = read("app/core/actions.js");
const handlersStart = actions.indexOf("function getApplicationActionHandlers");
test.assert(handlersStart !== -1, "actions.js declares getApplicationActionHandlers");
const handlersBody = actions.slice(handlersStart, actions.indexOf("\nfunction ", handlersStart + 10));

// Only bare identifiers are at risk. An arrow or a function expression defers
// the lookup to call time, which is exactly the fix, so they are skipped.
const bareHandlers = [...handlersBody.matchAll(/^\s*"([a-z0-9-]+)":\s*([A-Za-z_$][A-Za-z0-9_$]*),\s*$/gm)]
  .map((match) => ({ action: match[1], fn: match[2] }));
test.assert(bareHandlers.length > 0, "the registry still holds bare identifier handlers to check");

const sourceOf = (relativePath) => {
  try {
    return readFileSync(join(root, "apps", "desktop", relativePath), "utf8");
  } catch {
    return "";
  }
};

// app.js is the entry file and is eager, but it is listed on its own rather
// than in appModulePaths, so it has to be named here or the gate misreads
// everything defined in it.
const eagerSources = [...appModulePaths, "app.js"].map(sourceOf);
const lazySources = lazyRuntimePaths.map((path) => [path, sourceOf(path)]);

const declares = (source, name) =>
  new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?function\\s+${name}\\s*\\(`).test(source)
  || new RegExp(`(?:^|\\n)\\s*(?:const|let|var)\\s+${name}\\s*=`).test(source);

// The stubs are installed as `[ "a", "b" ].forEach((name) => installLazyFunctionStub(name, ensureX))`,
// and occasionally one at a time. Both forms are read.
const stubbedNames = new Set();
for (const source of eagerSources) {
  for (const block of source.matchAll(/\[([\s\S]{0,4000}?)\]\s*\.forEach\(\(name\)\s*=>\s*installLazyFunctionStub\(/g)) {
    for (const quoted of block[1].matchAll(/"([A-Za-z_$][A-Za-z0-9_$]*)"/g)) stubbedNames.add(quoted[1]);
  }
  for (const single of source.matchAll(/installLazyFunctionStub\(\s*"([A-Za-z_$][A-Za-z0-9_$]*)"/g)) {
    stubbedNames.add(single[1]);
  }
}
test.assert(stubbedNames.size > 0, "the eager stub mechanism is in place and readable");

const offenders = [];
for (const { action, fn } of bareHandlers) {
  if (eagerSources.some((source) => declares(source, fn))) continue;
  if (stubbedNames.has(fn)) continue;
  const lazyHome = lazySources.find(([, source]) => declares(source, fn));
  if (lazyHome) offenders.push({ action, fn, home: lazyHome[0] });
}

// The message is what somebody reads at two in the morning, so it names the
// handler, where the function actually lives, and the edit that fixes it.
test.assert(
  offenders.length === 0,
  offenders.length
    ? `${offenders.length} bare handler(s) name a function that only exists once a lazy module loads. Building the registry throws, and handleAction then dispatches nothing at all — every menu row and every data-action button goes dead in silence. ${
      offenders.map((o) => `"${o.action}": ${o.fn} (declared only in ${o.home}) → "${o.action}": () => ${o.fn}()`).join("; ")
    }. Or give the name an eager stub in config.js, the way generateOutline has one.`
    : `every bare handler resolves at boot (${bareHandlers.length} checked, ${stubbedNames.size} names carried by eager stubs)`,
);

// The two halves of the escape hatch have to keep existing, or the gate above
// starts passing for the wrong reason.
test.assertIncludes(read("app/core/config.js"), "installLazyFunctionStub", "config.js installs the eager stubs");
test.assert(
  [...appModulePaths, "app.js"].some((path) => /function installLazyFunctionStub\s*\(/.test(sourceOf(path))),
  "installLazyFunctionStub is itself eager, so a stub is available before any module loads",
);

// A stub is not enough on its own: config.js installs the stubs, and the
// registry object is BUILT before that runs, so a bare name captures
// undefined and handleAction dispatches nothing at all -- silently. Twenty
// route commands (generate-outline, expand-outline, polish-draft, every
// advance-*) died this way while this gate stayed green, because it treated
// "the name has an eager stub" as proof of safety. The name must be called
// through, not captured: `() => fn()`.
const stubbedBare = bareHandlers.filter((entry) => stubbedNames.has(entry.fn));
test.assert(
  stubbedBare.length === 0,
  stubbedBare.length
    ? `${stubbedBare.length} handler(s) capture a lazy-stubbed name at registry-build time, before config.js installs the stub — the entry holds undefined and the command dies without a word: ${
      stubbedBare.map((o) => `"${o.action}": ${o.fn} → "${o.action}": () => ${o.fn}()`).join("; ")
    }`
    : `no handler captures a lazy-stubbed name (${stubbedNames.size} stubbed names checked)`,
);

test.finish();
