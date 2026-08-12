// Contract: a window whose behaviour lives in a lazily loaded module must load
// that module inside openWindow(), not inside whichever action happens to open
// it.
//
// Why this test exists: session restore reopens last session's windows by
// calling openWindow(name) directly. A window wired only through its action
// handler comes back from restore *visible but inert* — the frame is drawn, and
// nothing inside it responds. ClioChart shipped with exactly that bug, and
// ClioStage had it too. Neither was visible to any other gate, because nothing
// throws: you just get a dead window.
//
// Rather than trusting a hand-kept list, this derives ownership from the source
// and fails when a newly added lazy window forgets to register.

import { existsSync, readFileSync } from "node:fs";
import { createFeatureTest, read, resolveProjectPath } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("lazy-window-restore");
const html = read("index.html");
const manifest = read("tooling/runtime-manifest.mjs");
const windowManager = read("app/core/window-manager.js");
const actions = read("app/core/actions.js");
const selectionServices = read("app/features/selection-services.js");
const wireup = read("app/core/wireup.js");
const appRoot = read("app.js");

// --- which modules are lazy? ------------------------------------------------
const lazyBlock = manifest.slice(
  manifest.indexOf("lazyRuntimePaths"),
  manifest.indexOf("]", manifest.indexOf("lazyRuntimePaths"))
);
const lazyModules = [...lazyBlock.matchAll(/"(app\/[a-z0-9/-]+\.js)"/g)]
  .map((match) => match[1])
  .filter((path) => existsSync(resolveProjectPath(path)));

test.assert(lazyModules.length > 0, "the runtime manifest declares lazy modules");

// --- which window does each lazy module own? --------------------------------
// A module owns a window when it queries that window's element ids. Two or more
// matches means the module is the window's behaviour, not a passing reference.
const windowSections = html
  .split(/(?=<section class="window )/)
  .map((section) => {
    const name = section.slice(0, 400).match(/data-window="([A-Za-z]+)"/);
    if (!name) return null;
    return { name: name[1], ids: [...new Set([...section.matchAll(/\bid="([a-z0-9-]+)"/g)].map((m) => m[1]))] };
  })
  .filter(Boolean);

test.assert(windowSections.length > 10, "index.html declares the window sections");

// Score every runtime module, not just the lazy ones. A lazy module that merely
// references a few of another window's ids (writing-demo.js touches four DocMap
// ids) must not be mistaken for that window's owner — DocMap's real owner,
// docmap.js, loads at startup and needs no registration.
const allModules = [...new Set([
  ...[...manifest.matchAll(/"(app\/[a-z0-9/-]+\.js)"/g)].map((match) => match[1]),
  ...lazyModules,
])].filter((path) => existsSync(resolveProjectPath(path)));

const moduleSources = new Map(allModules.map((path) => [path, readFileSync(resolveProjectPath(path), "utf8")]));
const lazySet = new Set(lazyModules);

const ownership = [];
windowSections.forEach(({ name, ids }) => {
  if (!ids.length) return;
  let owner = null;
  let best = 0;
  moduleSources.forEach((source, path) => {
    const hits = ids.filter((id) => source.includes(`"#${id}"`) || source.includes(`'#${id}'`)).length;
    if (hits > best) {
      best = hits;
      owner = path;
    }
  });
  if (owner && best >= 2 && lazySet.has(owner)) ownership.push({ name, owner, hits: best });
});

test.assert(ownership.length > 0, "at least one window is owned by a lazy module");

// --- the registry ------------------------------------------------------------
const registryBlock = windowManager.slice(
  windowManager.indexOf("const lazyWindowModules = {"),
  windowManager.indexOf("async function loadLazyWindowModule")
);
test.assert(!!registryBlock, "window-manager declares a lazyWindowModules registry");
test.assertIncludes(
  windowManager,
  "await loadLazyWindowModule(name);",
  "openWindow loads the lazy module for the window it is opening"
);
test.assertIncludes(
  windowManager,
  "await ensureDictionaryHelpModule();",
  "Dictionary and System Help restore their behavior module as well as their data"
);
test.assertMatches(
  actions,
  /"open-system-help": async \(\) => \{[\s\S]{0,180}?await ensureDictionaryHelpModule\(\)/,
  "System Help actions load their behavior before calling its entrypoint"
);
test.assertMatches(
  selectionServices,
  /command === "lookup"[\s\S]{0,120}?await ensureDictionaryHelpModule\(\)/,
  "selection lookup loads Dictionary behavior before dispatch"
);
test.assertMatches(
  wireup,
  /dictionaryForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]{0,260}?await ensureDictionaryHelpModule\(\);[\s\S]{0,100}?window\.lookupDictionaryInput\?\.\(event\)/,
  "Dictionary submit wiring resolves its handler only after the lazy behavior module loads"
);
test.assertMatches(
  wireup,
  /systemHelpQueryInput\?\.addEventListener\("input", async \(\) => \{[\s\S]{0,180}?await ensureDictionaryHelpModule\(\);[\s\S]{0,80}?window\.renderSystemHelp\?\.\(\)/,
  "System Help input wiring resolves its renderer only after the lazy behavior module loads"
);
test.assertNotIncludes(
  wireup,
  'addEventListener("submit", lookupDictionaryInput)',
  "startup never reads the lazy Dictionary handler before its module exists"
);
test.assertIncludes(
  appRoot,
  "window.renderSystemHelp?.();",
  "language setup does not require the lazy System Help renderer during startup"
);

// The entrypoint windows redirect through their own module.open() and return
// before reaching the registry, so they are registered there instead.
const entrypointWindows = new Set(["liquidCover", "quickDraft"]);

ownership.forEach(({ name, owner, hits }) => {
  if (entrypointWindows.has(name)) {
    test.assertMatches(
      windowManager,
      new RegExp(`name === "${name}"[\\s\\S]{0,200}?await ensure`),
      `${name} (${owner}) loads its module in the entrypoint block`
    );
    return;
  }
  test.assertMatches(
    registryBlock,
    new RegExp(`\\b${name}:\\s*\\{[\\s\\S]{0,200}?ensure:`),
    `${name} is registered as a lazy window, so restore cannot leave it inert (owned by ${owner}, ${hits} ids)`
  );
});

// Windows that render on attach must expose one, or a restored window shows an
// empty pane until the user pokes it.
[
  ["clioChart", "app/features/clio-chart.js", "attachClioChart"],
  ["clioStage", "app/features/clio-stage.js", "attachClioStage"],
].forEach(([name, path, fn]) => {
  const source = read(path);
  test.assertIncludes(source, `function ${fn}(`, `${path} defines ${fn}()`);
  test.assertIncludes(source, "attach: " + fn, `${path} exports attach so openWindow can re-render a restored window`);
  test.assertMatches(
    registryBlock,
    new RegExp(`\\b${name}:\\s*\\{[\\s\\S]{0,200}?attach:`),
    `${name} re-renders itself on restore`
  );
});

// The old scattered form is what let ClioStage slip through unnoticed.
test.assertNotIncludes(
  windowManager,
  'if (name === "cmfStudio") {',
  "lazy-window loading is one registry, not a scatter of per-window ifs"
);

test.finish();
