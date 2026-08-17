// OpenTTD / 运输大亨 is a summoned game, one of at most three game ports.
// The wasm build (OpenTTD 15.3, GPLv2) lives in assets/openttd/ and loads
// inside an iframe; the desktop side stays a thin lazy chrome module. The
// game must never touch the boot bundles or the floppy budget.

import { createFeatureTest, read, readAppSurface, exists } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("openttd");
const index = read("index.html");
const appJs = read("app.js");
const openttd = read("app/features/openttd.js");
// The shell page splits into markup and script: the strict CSP
// (script-src 'self') forbids inline scripts, so the logic lives in shell.js.
const shellHtml = read("assets/openttd/index.html");
const shell = shellHtml + "\n" + read("assets/openttd/shell.js");
const styles = read("styles/93-openttd.css");
const manifest = read("tooling/runtime-manifest.mjs");
const styleManifest = read("tooling/style-manifest.mjs");
const releaseManifest = exists("tooling/web-release-manifest.mjs")
  ? read("tooling/web-release-manifest.mjs")
  : "";
const snapshotManifest = exists("tooling/public-snapshot-manifest.mjs")
  ? read("tooling/public-snapshot-manifest.mjs")
  : "";
const packageJson = read("package.json");
const app = readAppSurface([
  "app/core/config.js",
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
  "app/core/system-icons.js",
]);
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const menus = read("app/data/menus.js");

// --- app registration and lazy loading ---
test.assertNotIncludes(index, 'data-window="openttd"', "OpenTTD window frame stays off the startup disk");
test.assertIncludes(openttd, 'data-window="openttd"', "the lazy module installs the OpenTTD window frame");
test.assertNotIncludes(index, 'data-action="open-openttd"', "the dynamic Games folder avoids a duplicate boot-time launcher");
test.assertIncludes(appJs, 'action: "open-openttd"', "Applications folder dynamic list includes OpenTTD");
test.assertIncludes(appJs, '"open-applications-folder-path:games"', "the Games folder is reachable from the Applications root");
test.assertIncludes(appJs, '["games", { labelKey: "applications_games", parentPath: "" }]', "the Games folder is a defined Applications path");
test.assertIncludes(app, 'openttd: "OpenTTD"', "MultiFinder labels the app");
test.assertIncludes(app, 'openttd: "openttd"', "window maps to its own app id");
test.assertIncludes(openttd, '"open-openttd":{handler:()=>openWindow("openttd")', "action opens the window through its registered command");
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
test.assertIncludes(lazyBlock, "app/features/openttd.js", "feature sits in lazyRuntimePaths");
test.assertIncludes(app, "ensureOpenTTDModule", "openWindow loads OpenTTD on demand");
test.assertIncludes(openttd, 'AISystem6RegisterApplicationMenuSet?.("openttd"', "the lazy module registers its menu set");
test.assertNotIncludes(menus, "const openttdMenus", "OpenTTD menu declarations stay off the startup floppy");
test.assertNotIncludes(openttd, "\nimport ", "feature module is not an ES module");
test.assertNotIncludes(openttd, "\nexport ", "feature module is not an ES module");

// --- the game payload stays out of the boot path ---
test.assertNotIncludes(index, "openttd.js", "index.html never references the wasm loader");
test.assertNotIncludes(index, "assets/openttd", "index.html never preloads game assets");
test.assertIncludes(openttd, 'OPENTTD_SHELL_PATH = "assets/openttd/index.html"', "the iframe loads the shell page from assets");
test.assertIncludes(openttd, "frame.src = openttdShellSrc()", "iframe src is set only when the module attaches");
test.assertIncludes(styleManifest, "styles.openttd.css", "styles ship as a lazy bundle, not in the boot CSS");
test.assertIncludes(styles, ".openttd-frame", "the frame styling is scoped to the window");

// --- mobile: full-screen app page ---
test.assertIncludes(app, '"openttd",\n]);', "appId opts into the mobile full-screen shell");

// --- quit handshake keeps saves safe, then frees the wasm loop ---
test.assertIncludes(app, 'window.AISystem6OpenTTD?.handleQuit?.()', "quitApp tears the game down");
test.assertIncludes(openttd, '{ type: "openttd-host", command: "sync" }', "quit asks the shell to flush IDBFS first");
test.assertIncludes(openttd, "event.source !== openttdState.frame.contentWindow", "shell messages are validated by source");
test.assertIncludes(shell, "window.openttd_syncfs", "shell flushes persistent storage via the pre.js hook");
test.assertIncludes(shell, '"pagehide"', "shell syncs when the page goes away");
test.assertIncludes(shell, "syncInFlight", "lifecycle signals cannot overlap IDBFS writes");

// --- Chinese + touch are the point of this port ---
test.assertIncludes(shell, "simplified_chinese.lng", "first-run config starts the game in Chinese");
test.assertIncludes(shell, "fusion-pixel-12px-proportional-zh_hans.ttf", "first-run config wires the CJK pixel font");
test.assertIncludes(shell, "touchstart", "shell owns the touch layer");
test.assertIncludes(shell, "WheelEvent", "pinch maps to wheel zoom");
test.assertIncludes(shell, "LONG_PRESS_MS", "long-press maps to the right button");
test.assertIncludes(shell, "touch-action: none", "browser gestures are suppressed on the canvas");
test.assertIncludes(shell, "em_openttd_set_resolution", "viewport changes resize the game surface live");
test.assertIncludes(shell, "width: 100% !important", "canvas stays glued to the pane; no black bars while the surface catches up");
test.assertIncludes(shell, "rotate-hint", "narrow portrait suggests landscape without blocking play");

// --- release plumbing ---
if (releaseManifest && snapshotManifest) {
  test.assertIncludes(releaseManifest, '"assets/openttd"', "web release ships the game directory");
  test.assertIncludes(releaseManifest, '"styles.openttd.css"', "web release ships the lazy style bundle");
  test.assertIncludes(snapshotManifest, "apps/desktop/assets/openttd/openttd.wasm", "public snapshot excludes the wasm binary");
  test.assertIncludes(packageJson, '"apps/desktop/assets/openttd/**/*"', "native packaging includes the complete wasm payload");
  test.assertIncludes(packageJson, '"apps/desktop/styles.openttd.css"', "native packaging includes the lazy stylesheet");
} else {
  // Publishing and deployment manifests are intentionally absent from the
  // public source. Verify that public source directly: the rebuildable shell
  // and lazy style ship, while all three generated wasm outputs stay out.
  test.assert(exists("assets/openttd/index.html"), "public source ships the OpenTTD shell page");
  test.assert(exists("assets/openttd/shell.js"), "public source ships the OpenTTD shell logic");
  test.assert(exists("apps/desktop/styles.openttd.css"), "the public build emits the lazy stylesheet");
  for (const binary of ["openttd.js", "openttd.wasm", "openttd.data"]) {
    test.assert(!exists(`assets/openttd/${binary}`), `public source excludes generated ${binary}`);
  }
}
test.assertIncludes(
  read("tooling/games/openttd/patches/emscripten-zh.patch"),
  "if (key == 0x00A0 || key == 0x2003) key = U' ';",
  "the reproducible engine patch maps Fusion Pixel's blank spacing characters to a real space glyph",
);

// --- localization parity for the visible chrome ---
["openttd_label", "openttd_title", "openttd_status_loading", "applications_games"].forEach((key) => {
  test.assertIncludes(en, `${key}:`, `en table has ${key}`);
  test.assertIncludes(zh, `${key}:`, `zh table has ${key}`);
});
test.assertIncludes(zh, 'openttd_label: "运输大亨"', "Chinese label is 运输大亨");

test.finish();
