// Contract: exactly one top-level loadClassicScriptOnce exists in the eager
// bundle, and it is the shared system loader in app/core/config.js.
//
// Why this test exists: export-import.js used to declare its own top-level
// loadClassicScriptOnce for browser-vendor scripts (PaddleOCR / PDF.js). In a
// concatenated classic bundle the last declaration wins, so every lazy system
// module silently loaded through the vendor loader — losing the ?v=<build>
// cache-buster and the app/legacy/ remap for old WebKit, and deduplicating
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
const manifest = read("scripts/runtime-manifest.mjs");

// Canonical loader ownership.
test.assertIncludes(config, "function loadClassicScriptOnce", "the shared lazy loader lives in config.js");
test.assertNotMatches(exportImport, /function\s+loadClassicScriptOnce\s*\(/, "no second top-level loader overrides the shared one");
test.assertIncludes(exportImport, "function loadBrowserVendorScriptOnce", "vendor scripts use their own distinctly named loader");
test.assertIncludes(config, "lazyScriptUrl", "the shared loader appends the build cache-buster");
test.assertIncludes(config, "resolveClassicScriptSource", "the shared loader keeps the legacy-WebKit remap");

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

test.finish();
