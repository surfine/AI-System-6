// 明文 / Plaintext is a summoned visual novel. The story lives in
// assets/mingwen/; the desktop host is a thin lazy chrome module. The window
// has no details bar. Game verbs and debug tools live in the application menus.

import { admissionRows, admittedApplicationGroup, createFeatureTest, exists, read, readAppSurface, windowApp } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("mingwen");
const index = read("index.html");
const host = read("app/features/mingwen.js");
const engine = read("assets/mingwen/engine.js");
const menus = read("app/data/menus.js");
const windowManager = read("app/core/window-manager.js");
const manifest = read("tooling/runtime-manifest.mjs");
const en = read("app/data/translations-en.js");
const zh = read("app/data/translations-zh.js");
const app = readAppSurface([
  "app/core/config.js",
  "app/core/actions.js",
  "app/core/multi-finder.js",
  "app/core/window-manager.js",
]);

test.assertNotIncludes(index, 'data-window="mingwen"', "the 明文 window frame stays off the startup disk");
test.assertIncludes(host, 'windowName: "mingwen"', "the lazy module declares its managed window identity");
test.assertIncludes(host, "AISystem6ApplicationShell.createWindow", "the lazy module installs its frame through the shared shell");
test.assertNotIncludes(host, "statusClass", "the window has no details bar");
test.assertNotIncludes(host, "statusHtml", "the window has no details-bar markup");
test.assertIncludes(host, 'setStatus(t(next), { windowName: "mingwen" })', "loading and failure speak on the desk status line");
test.assertIncludes(host, "AISystem6WasmHostContract", "明文 applies the shared host honesty contract");
test.assertIncludes(host, "wasm: 0", "明文 is not a Wasm host");
test.assertIncludes(host, 'mingwenState.statusKey === "mingwen_status_failed"', "a prior fail is not overwritten by a late load success");
test.assert(admittedApplicationGroup("open-mingwen") === "games", "the dynamic Games folder includes 明文");
test.assert(windowApp("mingwen") === "mingwen", "the window declares its own app id");
test.assert(admissionRows().mingwen?.phone === 2, "phones give the novel one foreground work area");

const eagerBlock = manifest.slice(0, manifest.indexOf("lazyRuntimePaths"));
const lazyBlock = manifest.slice(manifest.indexOf("lazyRuntimePaths"));
test.assertNotIncludes(eagerBlock, "app/features/mingwen.js", "the host stays out of the boot bundle");
test.assertIncludes(lazyBlock, "app/features/mingwen.js", "the host is a lazy runtime module");
test.assertIncludes(host, 'MINGWEN_SHELL_PATH = "assets/mingwen/index.html"', "the iframe loads the novel from assets");
test.assert(exists("assets/mingwen/index.html"), "the novel shell page ships with the desktop");
const releaseManifest = exists("tooling/web-release-manifest.mjs")
  ? read("tooling/web-release-manifest.mjs")
  : "";
const packageJson = read("package.json");
const serverStatic = read("apps/server/server/static.js");
if (releaseManifest) {
  test.assertIncludes(releaseManifest, '"assets/mingwen"', "web release ships the novel directory");
  test.assertIncludes(packageJson, '"apps/desktop/assets/mingwen/**/*"', "native packaging includes the novel payload");
}
test.assertIncludes(serverStatic, 'relative.startsWith("assets/mingwen/")', "the server grants iframe CSP to the novel directory");

test.assertIncludes(host, 'AISystem6RegisterApplicationMenuSet?.("mingwen"', "the lazy module registers its menu set");
test.assertNotIncludes(menus, "const mingwenMenus", "明文 menu declarations stay off the startup floppy");
test.assertIncludes(host, 'id: "file"', "File holds persistence verbs and Close");
test.assertIncludes(host, 'id: "story"', "Story holds in-game surfaces");
test.assertIncludes(host, 'id: "debug"', "Debug holds the former overlay tools");
test.assertIncludes(host, 'action: "mingwen-new"', "File starts a new game");
test.assertIncludes(host, 'action: "mingwen-continue"', "File continues from the latest save");
test.assertIncludes(host, 'action: "mingwen-load"', "File opens the load sheet");
test.assertIncludes(host, 'action: "mingwen-save"', "File opens the save sheet");
test.assertIncludes(host, 'action: "close-active-window"', "File still closes the window");
test.assertIncludes(host, 'action: "mingwen-chapters"', "Story can open chapter select");
test.assertIncludes(host, 'action: "mingwen-archive"', "Story can open archives");
test.assertIncludes(host, 'action: "mingwen-log"', "Story can open the backlog");
test.assertIncludes(host, 'action: "mingwen-ledger"', "Story can open the ledger");
test.assertIncludes(host, 'action: "mingwen-debug-overlay"', "Debug can show the overlay on request");
test.assertIncludes(host, 'mingwenCheck: "overlay"', "the overlay row carries a check-mark hook");
test.assertIncludes(host, "menuChecked: mingwenMenuChecked", "the module answers that check-mark question");
test.assertIncludes(windowManager, "btn.dataset.mingwenCheck", "updateMenuState asks one question for every 明文 check mark");
test.assertIncludes(windowManager, "window.AISystem6Mingwen?.menuChecked?.(btn.dataset.mingwenCheck)", "an unloaded module marks nothing");

test.assertIncludes(engine, "window.MingwenDesk", "the novel exposes a same-origin desk bridge");
test.assertIncludes(engine, "command: deskCommand", "the bridge runs desk commands");
test.assertIncludes(engine, "if (el.debug.hidden) return", "HUD refresh does not uncover a hidden overlay");
test.assertIncludes(engine, "type !== 'mingwen-command'", "the novel only accepts the named desk message");
test.assertIncludes(host, 'postMessage({ type: "mingwen-command", command, arg }, location.origin)', "the host posts only to its own origin");

test.assertIncludes(app, "ensureMingwenModule", "openWindow loads 明文 on demand");
test.assertIncludes(host, "registerApplicationLifecycle?.(\"mingwen\"", "quit disposes the iframe through the lifecycle");

[
  "mingwen_label",
  "mingwen_title",
  "mingwen_status_loading",
  "mingwen_status_failed",
  "mingwen_menu_story",
  "mingwen_menu_new",
  "mingwen_menu_continue",
  "mingwen_menu_load",
  "mingwen_menu_save",
  "mingwen_menu_chapters",
  "mingwen_menu_archive",
  "mingwen_menu_log",
  "mingwen_menu_ledger",
  "mingwen_menu_hidden",
  "mingwen_menu_pause",
  "mingwen_menu_title",
  "mingwen_menu_settings",
  "mingwen_menu_help",
  "mingwen_menu_debug",
  "mingwen_menu_debug_overlay",
  "mingwen_menu_jump",
  "mingwen_jump_1",
  "mingwen_jump_11",
  "mingwen_menu_new_state",
  "mingwen_menu_end_chapter",
  "mingwen_menu_ending",
  "mingwen_menu_skip_all",
].forEach((key) => {
  test.assertIncludes(en, `${key}:`, `en table has ${key}`);
  test.assertIncludes(zh, `${key}:`, `zh table has ${key}`);
});
test.assertIncludes(zh, 'mingwen_label: "明文"', "Chinese label is 明文");
test.assertIncludes(en, 'mingwen_label: "Plaintext"', "English label is Plaintext");

test.finish();
