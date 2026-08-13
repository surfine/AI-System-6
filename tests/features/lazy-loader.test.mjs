// Contract: exactly one top-level loadClassicScriptOnce exists in the eager
// bundle, and it is the shared system loader in app/core/config.js.
//
// Why this test exists: export-import.js used to declare its own top-level
// loadClassicScriptOnce for browser-vendor scripts (PaddleOCR / PDF.js). In a
// concatenated classic bundle the last declaration wins, so every lazy system
// module silently loaded through the vendor loader — losing the ?v=<build>
// cache-buster, and deduplicating
// under a different script attribute. Nothing threw; you just got stale or
// missing lazy modules after a release.
//
// The registry is also the source of truth for what can be lazy-loaded: a file
// reached through the shared loader must be declared in lazyRuntimePaths so
// syntax gates and audits actually see it.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createFeatureTest, read, root } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("lazy-loader");
const config = read("app/core/config.js");
const exportImport = read("app/features/export-import.js");
const manifest = read("tooling/runtime-manifest.mjs");

// Canonical loader ownership.
test.assertIncludes(config, "function loadClassicScriptOnce", "the shared lazy loader lives in config.js");
test.assertNotMatches(exportImport, /function\s+loadClassicScriptOnce\s*\(/, "no second top-level loader overrides the shared one");
test.assertIncludes(exportImport, "function loadBrowserVendorScriptOnce", "vendor scripts use their own distinctly named loader");
test.assertIncludes(config, "lazyScriptUrl", "the shared loader appends the build cache-buster");
test.assertIncludes(config, "function resolveClassicScriptSource", "the shared loader resolves lazy script sources");
test.assertIncludes(config, "removeLazyScriptNode", "failed script nodes are removable for retry");
test.assertIncludes(config, "ensureLazyModuleForUserAction", "user actions surface retryable lazy-load errors");
test.assertIncludes(config, "did not install after loading", "loaders verify the module API actually installed");
test.assertNotMatches(
  config,
  /\.catch\(\(\) => lazySystemModulePromises\.delete\(path\)\)/,
  "ensureLazySystemModule no longer swallows errors"
);
test.assertIncludes(
  config,
  "lazySystemModulePromises.delete(path);\n        throw error;",
  "ensureLazySystemModule clears the cache then rethrows the original error"
);
test.assertIncludes(config, "lazyScriptTimeoutMs", "lazy script timeout is configurable for tests");

const bootSource = read("app/core/boot.js");
test.assertIncludes(
  bootSource,
  "applyControlStripState({ silent: true })",
  "boot enables Control Strip silently (no modal on passive path)"
);

const documentsChat = read("app/features/documents-chat.js");
test.assertIncludes(
  documentsChat,
  "ensureLazyModuleForUserAction(t(\"finder_objects\"), ensureFinderObjectsModule)",
  "Finder Objects user actions surface retryable errors"
);

const translationsEn = read("app/data/translations-en.js");
const translationsZh = read("app/data/translations-zh.js");
test.assertIncludes(translationsEn, "lazy_load_failed", "EN lazy-load error message key");
test.assertIncludes(translationsZh, "lazy_load_failed", "zh lazy-load error message key");

// Registry completeness: every app/ source the shared loader can reach is
// declared, so verify:release syntax-checks it and audits see it.
const lazyBlock = manifest.slice(
  manifest.indexOf("lazyRuntimePaths"),
  manifest.indexOf("]", manifest.indexOf("lazyRuntimePaths"))
);
const lazyModules = [...lazyBlock.matchAll(/"(app\/[a-z0-9/-]+\.js)"/g)]
  .map((match) => match[1])
  .filter((path) => existsSync(join(root, path)));

const loadedBySharedLoader = [...config.matchAll(/loadClassicScriptOnce\("(app\/[a-z0-9/?=-]+\.js)"\)/g)]
  .map((match) => match[1].split("?")[0]);
for (const src of loadedBySharedLoader) {
  test.assert(
    lazyModules.includes(src),
    `${src} is declared in lazyRuntimePaths so gates and audits cover it`
  );
}

// Writing-route AI commands are lazy; the synchronous half of the same feature
// is not.
//
// app/features/outline-claim.js is prompt text behind menu items, so it went
// lazy when the boot payload had to fit two real floppies again. What could not
// go with it is everything the eager surfaces call synchronously: the Review
// Desk section blocks that updateMenuState() needs a return value from, the
// section renderer that runs on every TeachText keystroke, and the Markdown
// helpers that two *other* lazy modules call bare. Those live in
// app/core/review-sections.js. Move one back into the lazy module and ordinary
// typing starts fetching a script, or menu state reads a promise as a list.
const reviewSections = read("app/core/review-sections.js");
const outlineClaim = read("app/features/outline-claim.js");

test.assertMatches(
  manifest,
  /export const lazyRuntimePaths = \[[\s\S]*"app\/features\/outline-claim\.js"/,
  "writing-route AI commands are a lazy runtime file"
);
test.assertMatches(
  manifest,
  /export const appModulePaths = \[[\s\S]*"app\/core\/review-sections\.js"[\s\S]*export const lazyRuntimePaths/,
  "the Review Desk section layer stays in the boot bundle"
);
test.assertIncludes(outlineClaim, "window.AISystem6OutlineClaimLoaded = true;", "the lazy module installs its loaded flag");
test.assertIncludes(config, 'createLazyModuleLoader("AISystem6OutlineClaimLoaded"', "config owns the outline-claim loader");

// Bare references survive laziness only through a window stub: actions.js holds
// "generate-outline": generateOutline, and the identifier is resolved when the
// command registry is built, long before anyone opens the Outline menu.
[
  "generateOutline",
  "organizeQuestionSheet",
  "organizeQuestionSheetCore",
  "applyOrganizedQuestionSheet",
  "expandOutline",
  "runOutlineOperation",
  "polishDraft",
  "suggestDraft",
  "runClaimCheck",
  "readRebuildMarkdownPackStream",
].forEach((name) => {
  test.assertMatches(
    outlineClaim,
    new RegExp(`^(?:async )?function ${name}\\(`, "m"),
    `${name} is summoned, not booted`
  );
  test.assertIncludes(config, `  "${name}",`, `${name} has a lazy stub so its bare references still resolve`);
});

[
  "stripRebuildMarkdownFence",
  "getRebuildParagraphs",
  "inferRebuildClaims",
  "getTeachTextSectionBlocks",
  "getClaimCheckSectionBlocks",
  "renderClaimCheckSections",
  "selectClaimCheckSection",
  "showAdjacentClaimCheckSection",
  "revealReviewDeskSection",
  "selectedClaimCheckSection",
  "setClaimCheckWaiting",
  "renderClaimCheckDraft",
  "openCitationContextItem",
].forEach((name) => {
  test.assertMatches(
    reviewSections,
    new RegExp(`^function ${name}\\(`, "m"),
    `${name} stays eager for its synchronous callers`
  );
  test.assertNotIncludes(outlineClaim, `function ${name}(`, `${name} did not drift back into the lazy module`);
});

test.assertIncludes(
  reviewSections,
  "let selectedClaimSectionIndex = 0;",
  "the shared section index is a script-scope binding, which no window stub could replace"
);

test.finish();
