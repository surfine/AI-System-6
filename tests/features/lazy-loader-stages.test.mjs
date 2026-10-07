// The lazy loader's failure stages: one download shared by every caller, a
// transfer failure that may be retried, and a script that ran without
// installing its API - which may not be re-inserted, because its top-level
// registrations, listeners and timers have already happened once.

import vm from "node:vm";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";

const test = createFeatureTest("lazy-loader-stages");

const vmw = createAppBootVm();

// Drive the real loader with a script loader the test controls.
vmw.run(`
  window.__scriptLoads = [];
  window.__scriptOutcome = "success";
  window.__realLoadClassicScriptOnce = loadClassicScriptOnce;
  loadClassicScriptOnce = async (source) => {
    // Only the fixture modules below are simulated; the app's own lazy loads
    // keep using the harness's loader.
    if (!/test-(?:shared|retry|partial|data)\\.js$/.test(String(source))) {
      return window.__realLoadClassicScriptOnce(source);
    }
    window.__scriptLoads.push(source);
    if (window.__scriptOutcome === "network") throw new Error("network failed");
    if (window.__scriptOutcome === "partial") return true;
    // A real module installs its own flag; the fixture installs the one the
    // loader declared for this file.
    const installedFor = {
      "app/features/test-shared.js": "AISystem6TestLazyFlag",
      "app/features/test-retry.js": "AISystem6RetryableFlag",
      "app/features/test-partial.js": "AISystem6PartialFlag",
      "app/features/test-data.js": "AISystem6DataFlag",
    };
    const flag = installedFor[String(source)];
    if (flag) window[flag] = { loaded: true, value: flag === "AISystem6DataFlag" ? 7 : undefined };
    return true;
  };
  window.__realRemoveLazyScriptNode = removeLazyScriptNode;
  window.__removedNodes = [];
  removeLazyScriptNode = (source) => {
    if (!/test-(?:shared|retry|partial|data)\\.js$/.test(String(source))) {
      return window.__realRemoveLazyScriptNode(source);
    }
    window.__removedNodes.push(source);
  };
`);

function run(code) {
  return vmw.run(code);
}

// --- One download, shared by concurrent callers -----------------------------
run(`
  window.__scriptLoads = [];
  delete window.AISystem6TestLazyFlag;
  window.__ensureShared = createLazyModuleLoader("AISystem6TestLazyFlag", ["app/features/test-shared.js"]);
`);
const shared = await run(`
  (async () => {
    const results = await Promise.all([
      window.__ensureShared(),
      window.__ensureShared(),
      window.__ensureShared(),
    ]);
    return { results, loads: window.__scriptLoads.slice() };
  })()
`);
test.assert(shared.loads.length === 1, "three concurrent callers share one script load");
test.assert(shared.results.every((value) => value === true), "and every caller sees the load complete");

// A second call after the flag is installed does not load anything again.
await run("window.__ensureShared()");
test.assert(
  run("window.__scriptLoads.length") === 1,
  "a module that is already installed is never requested again"
);

// --- A transfer failure is retryable ---------------------------------------
run(`
  window.__scriptLoads = [];
  window.__scriptOutcome = "network";
  window.__ensureRetryable = createLazyModuleLoader("AISystem6RetryableFlag", ["app/features/test-retry.js"]);
`);
const firstFailure = await run('window.__ensureRetryable().then(() => "ok", (error) => String(error.message))');
test.assert(firstFailure === "network failed", "a failed transfer reports the real failure");
run('window.__scriptOutcome = "success"');
const retry = await run('window.__ensureRetryable().then(() => "ok", (error) => String(error.message))');
test.assert(retry === "ok", "the next call may retry a transfer that never arrived");
test.assert(
  run("window.__scriptLoads.length") === 2,
  "and the retry really asked for the script again"
);

// --- A script that ran without installing its API is not re-inserted --------
run(`
  window.__scriptLoads = [];
  window.__removedNodes = [];
  window.__scriptOutcome = "partial";
  window.AISystem6PartialFlag = undefined;
  window.__ensurePartial = createLazyModuleLoader("AISystem6PartialFlag", ["app/features/test-partial.js"]);
`);
const partial = await run('window.__ensurePartial().then(() => "ok", (error) => String(error.message))');
test.assert(
  /did not install/.test(partial),
  "a script that ran without installing its API is reported as such"
);
test.assert(
  run("window.__removedNodes.length") === 1,
  "its script node is removed so the dead load is not left in the document"
);
const secondAttempt = await run('window.__ensurePartial().then(() => "ok", (error) => String(error.message))');
test.assert(
  /reload to recover/.test(secondAttempt),
  "a later call reports the partial execution instead of retrying it"
);
test.assert(
  run("window.__scriptLoads.length") === 1,
  "and the classic script is not inserted a second time"
);

// --- A loader that also resolves data hands back the installed value --------
run(`
  window.__scriptOutcome = "success";
  window.AISystem6DataFlag = { value: 7 };
  window.__ensureData = createLazyModuleLoader("AISystem6DataFlag", ["app/features/test-data.js"], true);
`);
const data = await run("window.__ensureData()");
test.assert(data?.value === 7, "a data-resolving loader returns the installed API, not a bare true");

// A lazy application's extra vocabulary is only a partial language object.
// Exercise the real language dispatcher AND real once-loader; this fixture
// replaces script transport only and executes the shipped language files.
function languageLoaderFixture() {
  const nodes = [];
  const inserted = [];
  const context = vm.createContext({
    CSS: { escape: (value) => value },
    setTimeout: () => 1,
    clearTimeout: () => {},
    document: {
      querySelector: (selector) => nodes.find((node) => selector.includes(`"${node.dataset.lazySrc}"`)) || null,
      querySelectorAll: (selector) => nodes.filter((node) => selector.includes(`"${node.dataset.lazySrc}"`)),
      createElement: () => {
        const node = { dataset: {}, remove() { const index = nodes.indexOf(node); if (index >= 0) nodes.splice(index, 1); } };
        return node;
      },
      head: { append: (node) => { nodes.push(node); inserted.push(node); } },
    },
  });
  context.window = context;
  const config = read("app/core/config.js");
  // Keep the real source declarations; unrelated app admissions are not part
  // of a language load and have their own boot contracts above.
  vm.runInContext(config.slice(config.indexOf("const lazyScriptPromises ="), config.indexOf("const ensureWritingFlowModule =")), context);
  vm.runInContext(config.slice(config.indexOf("const ensureTranslationZh ="), config.indexOf("const ensureWritingFlowHelpData =")), context);
  return {
    context, inserted, nodes,
    finish(node) { vm.runInContext(read(node.dataset.lazySrc), context); node.onload(); },
  };
}
for (const [language, flag] of [["en", "AISystem6TranslationsEn"], ["zh", "AISystem6TranslationsZh"]]) {
  const fixture = languageLoaderFixture();
  const extra = (name) => `extra:${name}`;
  fixture.context[flag] = { quick_draft_fixture_extra: extra, cancel: "partial must not replace system copy" };
  const requests = [fixture.context.ensureLanguageFor(language), fixture.context.ensureLanguageFor(language), fixture.context.ensureLanguageFor(language)];
  test.assert(fixture.inserted.length === 1, `${language}: concurrent partial language requests share the real once-loader`);
  fixture.finish(fixture.inserted[0]);
  const tables = await Promise.all(requests);
  const table = tables[0];
  test.assert(tables.every((value) => value === table), `${language}: all callers receive the completed shared table`);
  test.assert(table.menu_special && table.window_browse && Object.keys(table).length > 1000, `${language}: partial extras load the real complete system language`);
  test.assert(table.quick_draft_fixture_extra === extra && table.quick_draft_fixture_extra("kept") === "extra:kept", `${language}: application additions survive with function identity intact`);
  test.assert(table.cancel !== "partial must not replace system copy", `${language}: complete system keys take precedence over partial duplicates`);
  test.assert(await fixture.context.ensureLanguageFor(language) === table && fixture.inserted.length === 1, `${language}: an already complete table never inserts a second script`);

  const retryFixture = languageLoaderFixture();
  retryFixture.context[flag] = { quick_draft_fixture_extra: extra };
  const failures = [retryFixture.context.ensureLanguageFor(language), retryFixture.context.ensureLanguageFor(language)];
  const outcomes = Promise.allSettled(failures);
  retryFixture.inserted[0].onerror();
  test.assert((await outcomes).every((outcome) => outcome.status === "rejected"), `${language}: transfer failure rejects every concurrent language caller`);
  test.assert(retryFixture.nodes.length === 0 && retryFixture.context[flag].quick_draft_fixture_extra === extra, `${language}: failed transport removes its script without losing partial additions`);
  const retry = retryFixture.context.ensureLanguageFor(language);
  test.assert(retryFixture.inserted.length === 2 && retryFixture.inserted[1].src.includes("r=1"), `${language}: retry uses the real loader's fresh URL after failure`);
  retryFixture.finish(retryFixture.inserted[1]);
  const recovered = await retry;
  test.assert(Boolean(recovered.menu_special) && recovered.quick_draft_fixture_extra === extra, `${language}: retry completes the system table and retains extras`);
}

test.finish();
