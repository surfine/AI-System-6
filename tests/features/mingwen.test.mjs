// 明文 / Plaintext is a summoned visual novel. The story lives in
// assets/mingwen/; the desktop host is a thin lazy chrome module. The window
// has no details bar. Game verbs and debug tools live in the application menus.
//
// This contract boots the real eager bundle, opens the window through the
// app's own on-demand path, and reads the resulting window, menus, status
// receipt, host contract, admission row and lifecycle back out of the running
// modules. The reads that remain are the novel's own iframe page and the menu
// state pass, neither of which this headless harness renders — noted where they
// appear. No assertion reads mingwen.js as text.

import { createFeatureTest, exists, read } from "../helpers/feature-test-harness.mjs";
import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { appModulePaths, lazyRuntimePaths } from "../../tooling/runtime-manifest.mjs";

const test = createFeatureTest("mingwen");

const vmw = createAppBootVm();
const ctx = vmw.context;
const run = (code) => vmw.run(code);
await vmw.settleBoot();

// Capture the menu set the real module registers, before it loads.
const menuSets = {};
const originalRegister = ctx.window.AISystem6RegisterApplicationMenuSet;
ctx.window.AISystem6RegisterApplicationMenuSet = (appId, definitions) => {
  menuSets[appId] = definitions;
  return originalRegister?.(appId, definitions);
};

// What the desk sees before the novel is summoned.
test.assert(run("!document.querySelector('[data-window=\"mingwen\"]')"), "the 明文 window frame stays off the startup disk");
test.assert(typeof ctx.window.AISystem6Mingwen === "undefined", "an unloaded module marks nothing");
test.assert(menuSets.mingwen === undefined, "the menu set is registered only when the module loads");

// Open it the way the desk does, and let the real lazy loader build the frame.
await run("openWindow('mingwen')");
await vmw.waitFor(() => run("!!window.AISystem6MingwenLoaded && !!document.querySelector('[data-window=\"mingwen\"]')"));
const win = ctx.getWindow("mingwen");

test.assert(!!win && win.dataset.window === "mingwen", "the lazy module declares its managed window identity");
test.assert(!!win.applicationPane && !!win.querySelector(".title-bar"), "the lazy module installs its frame through the shared shell");
test.assert(win.applicationStatusBar === null, "the window has no details bar");
test.assert(!win.querySelector(".details-bar"), "the window has no details-bar markup");

// The host honesty contract is applied to the real window element.
test.assert(run("typeof AISystem6WasmHostContract") === "object", "明文 applies the shared host honesty contract");
test.assert(win.dataset.wasm === "0" && win.dataset.binary === "0", "明文 is not a Wasm host");

// Open, fail, then a late load: the status receipt and the host contract both
// track the frame, and a prior fail is not overwritten by a late load success.
const lifecycle = run(`(() => {
  const calls = [];
  const original = setStatus;
  setStatus = (...args) => { calls.push(args); };
  try {
    AISystem6Mingwen.handleQuit();
    AISystem6Mingwen.attach();
    const frame = document.querySelector('[data-window="mingwen"] .mingwen-pane iframe');
    const loadingHost = document.querySelector('[data-window="mingwen"]').dataset.host;
    frame.dispatchEvent({ type: "error", target: frame });
    const failHost = document.querySelector('[data-window="mingwen"]').dataset.host;
    frame.dispatchEvent({ type: "load", target: frame });
    const loadHost = document.querySelector('[data-window="mingwen"]').dataset.host;
    return { calls, loadingHost, failHost, loadHost, src: frame.src };
  } finally {
    setStatus = original;
  }
})()`);
const loadingText = run('t("mingwen_status_loading")');
const failedText = run('t("mingwen_status_failed")');
test.assert(lifecycle.calls.some((call) => call[0] === loadingText && call[1]?.windowName === "mingwen"),
  "loading speaks on the desk status line for the 明文 window");
test.assert(lifecycle.calls.some((call) => call[0] === failedText && call[1]?.windowName === "mingwen"),
  "and failure speaks on the same status line");
test.assert(lifecycle.loadingHost === "loading" && lifecycle.failHost === "fail",
  "the host contract tracks loading then failure on the real window");
test.assert(lifecycle.loadHost === "fail", "a prior fail is not overwritten by a late load success");
test.assert(lifecycle.src.startsWith("assets/mingwen/index.html"), "the iframe loads the novel from assets");
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

// The admission table the desk runs declares its folder, app and phone role.
test.assert(run("AISystem6Admissions.windowRecord('mingwen').applicationGroup") === "games"
  && run("AISystem6Admissions.applicationItems('games').some((item) => item.action === 'open-mingwen')"),
  "the dynamic Games folder includes 明文");
test.assert(run("AISystem6Admissions.windowRecord('mingwen').app") === "mingwen", "the window declares its own app id");
test.assert(run("AISystem6Admissions.windowRecord('mingwen').phone") === 2, "phones give the novel one foreground work area");
test.assert(run("typeof AISystem6ApplicationRegistry.getApplication('mingwen')") === "object", "openWindow loads 明文 on demand");

// Quit disposes the iframe through the application lifecycle.
run("AISystem6Mingwen.attach()");
test.assert(run("AISystem6Mingwen.isLoaded()") === true, "the novel's frame is attached while open");
run("AISystem6ApplicationRegistry.disposeApplication('mingwen')");
test.assert(run("AISystem6Mingwen.isLoaded()") === false && !run("!!document.querySelector('[data-window=\"mingwen\"] iframe')"),
  "quit disposes the iframe through the lifecycle");

// The module's menu set, read from the running registration.
const walkItems = (items, out = []) => {
  for (const item of items || []) {
    if (item.type === "submenu") walkItems(item.items, out);
    else if (item.type === "item") out.push(item);
  }
  return out;
};
const menuNames = (menuSets.mingwen || []).map((menu) => menu.id);
const menuItems = walkItems((menuSets.mingwen || []).flatMap((menu) => menu.items || []));
const actions = menuItems.map((item) => item.action);

test.assert(menuNames.includes("file"), "File holds persistence verbs and Close");
test.assert(menuNames.includes("story"), "Story holds in-game surfaces");
test.assert(menuNames.includes("debug"), "Debug holds the former overlay tools");
test.assert(actions.includes("mingwen-new"), "File starts a new game");
test.assert(actions.includes("mingwen-continue"), "File continues from the latest save");
test.assert(actions.includes("mingwen-load"), "File opens the load sheet");
test.assert(actions.includes("mingwen-save"), "File opens the save sheet");
test.assert(actions.includes("close-active-window"), "File still closes the window");
test.assert(actions.includes("mingwen-chapters"), "Story can open chapter select");
test.assert(actions.includes("mingwen-archive"), "Story can open archives");
test.assert(actions.includes("mingwen-log"), "Story can open the backlog");
test.assert(actions.includes("mingwen-ledger"), "Story can open the ledger");
test.assert(actions.includes("mingwen-debug-overlay"), "Debug can show the overlay on request");
test.assert(menuItems.find((item) => item.action === "mingwen-debug-overlay")?.dataset?.mingwenCheck === "overlay",
  "the overlay row carries a check-mark hook");
test.assert(run("typeof AISystem6Mingwen.menuChecked") === "function" && run("AISystem6Mingwen.menuChecked('overlay')") === false,
  "the module answers the check-mark question from its own state");
test.assert(actions.filter((action) => action.startsWith("mingwen-"))
  .every((action) => typeof ctx.window.AISystem6Runtime.getCommand(action)?.handler === "function"),
  "every 明文 menu command has a registered handler");

// The novel's own iframe page is a separate same-origin document this harness
// does not render, and the menu state pass needs a rendered menu bar it does
// not model: both stay file reads.
const engine = read("assets/mingwen/engine.js");
const host = read("app/features/mingwen.js");
test.assertIncludes(engine, "window.MingwenDesk", "the novel exposes a same-origin desk bridge");
test.assertIncludes(engine, "command: deskCommand", "the bridge runs desk commands");
test.assertIncludes(engine, "if (el.debug.hidden) return", "HUD refresh does not uncover a hidden overlay");
test.assertIncludes(engine, "type !== 'mingwen-command'", "the novel only accepts the named desk message");
test.assertIncludes(host, 'postMessage({ type: "mingwen-command", command, arg }, location.origin)', "the host posts only to its own origin");
test.assertIncludes(read("app/core/window-manager.js"), "btn.dataset.mingwenCheck", "updateMenuState asks one question for every 明文 check mark");
test.assertIncludes(read("app/core/window-manager.js"), "window.AISystem6Mingwen?.menuChecked?.(btn.dataset.mingwenCheck)", "an unloaded module marks nothing");
test.assertNotIncludes(read("app/data/menus.js"), "const mingwenMenus", "明文 menu declarations stay off the startup floppy");

// The host stays out of the boot bundle and rides the lazy manifest.
const manifestEntry = (entry) => (typeof entry === "string" ? entry : entry?.path || entry?.module || JSON.stringify(entry));
test.assert(!appModulePaths.map(manifestEntry).some((path) => path.includes("app/features/mingwen.js")),
  "the host stays out of the boot bundle");
test.assert(lazyRuntimePaths.map(manifestEntry).some((path) => path.includes("app/features/mingwen.js")),
  "the host is a lazy runtime module");

// Every key the host asks for exists in both languages. Chinese is its own
// lazy table; load it through the real loader.
await run("ensureTranslationZh()");
await vmw.waitFor(() => !!ctx.window.AISystem6TranslationsZh);
const en = ctx.window.AISystem6TranslationsEn;
const zh = ctx.window.AISystem6TranslationsZh;
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
  test.assert(typeof en?.[key] === "string", `en table has ${key}`);
  test.assert(typeof zh?.[key] === "string", `zh table has ${key}`);
});
test.assert(zh?.mingwen_label === "明文", "Chinese label is 明文");
test.assert(en?.mingwen_label === "Plaintext", "English label is Plaintext");

test.finish();
