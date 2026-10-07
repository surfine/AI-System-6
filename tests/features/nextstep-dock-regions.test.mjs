// NeXTSTEP 3.3 keeps two places on the desk and they are not one object: the
// Dock, down the right edge, holds ONLY the fixed (pinned) application icons,
// and a desk row along the bottom holds the rest -- the applications that are
// merely running, then one miniwindow per put-away window to their right. The
// projection used to append all of it into one column, so an application icon
// and a window's miniwindow differed only in where they sat in that list -- and
// a second document of one application was indistinguishable from the first.
//
// This contract runs the real boot and the real dock module (the same `sync()`
// the desk calls) and pins what a source search cannot:
//
//   1. the Dock root holds only the fixed region -- nothing else hangs off it;
//   2. the desk row holds the running-application section, then the window
//      section, in that order, and a miniwindow names its own window: two
//      windows of one application are two tiles with two identities, and
//      restoring one leaves the other miniaturized;
//   3. a running application lives in one place or the other, never both; and
//   4. with the Dock switched off the root is gone, the row and its miniwindows
//      remain, and every running application is still reachable -- pinned
//      applications included, because nothing may strand.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("nextstep-dock-regions");
const vmw = createAppBootVm();

// An empty region must not paint a stray band: the region keeps its place in
// the structure and the stylesheet takes it out of the picture.
test.assertMatches(
  read("styles/nextstep-shell.css"),
  /\.nextstep-dock-region\[hidden\] \{\s*display: none;/,
  "a region with no objects is hidden by the stylesheet that owns the dock layout",
);
// The row is fixed to the screen's bottom-left corner, edge to edge, as 3.3
// lines up free icons and miniwindows from (0, bottom), and never reaches
// under the right-edge Dock.
test.assertMatches(
  read("styles/nextstep-shell.css"),
  /\.nextstep-desk-row \{\s*position: fixed;\s*left: 0;\s*bottom: 0;/,
  "the desk row is a fixed object along the bottom-left of the screen",
);

test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock").length') === 0,
  "the dock is an appearance's own object, so it is absent before its era is on",
);

// The boot VM boots the eager module set; the NeXTSTEP shell, the dock and the
// detached menus are lazy modules, and two browser primitives they reach for
// are not in the shim's DOM. Declared here, next to the one contract that boots
// a lazy appearance module, so the shared harness keeps serving the modules it
// was built for.
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

await vmw.context.AISystem6Theme.previewExperimentalTheme("nextstep");
await vmw.waitFor(() => vmw.run('!!window.AISystem6NextstepDock'));
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-dock").length === 1'));

// A fresh desk starts with the Dock ON: the preference defaults to visible.
test.assert(
  vmw.run('window.AISystem6WindowMinimize.dockVisible()') === true,
  "the shared Dock preference defaults to visible, so nothing has to be switched on first",
);
test.assert(
  vmw.run('document.body.classList.contains("nextstep-dock-shown")'),
  "while the Dock root is on screen the body carries nextstep-dock-shown, the class the appearance gates the Classic icon column on",
);

const dockRegions = () => vmw.run(
  '[...document.querySelectorAll(".nextstep-dock > .nextstep-dock-region")].map((node) => node.dataset.dockRegion)',
);
test.assert(
  JSON.stringify(dockRegions()) === JSON.stringify(["fixed"]),
  "the Dock root holds only the fixed region: the running icons and the miniwindows belong to the desk row, not the Dock",
);
// The pinned tiles are in it and it is not hidden: settle() used to run on the
// region before the tiles were added, so a fresh NeXTSTEP desk drew an empty
// Dock (re-audit N2).
test.assert(
  vmw.run('(() => { const region = document.querySelector(".nextstep-dock > .nextstep-dock-region"); return !!region && !region.hasAttribute("hidden") && region.querySelectorAll(".nextstep-dock-tile").length >= 1; })()'),
  "a fresh Dock shows its default pinned tiles, never an empty hidden column",
);
test.assert(
  vmw.run('document.querySelector(".nextstep-dock").querySelectorAll("h2, h3, details, summary, .nextstep-dock-region-label").length === 0'),
  "the Dock column is tiles only, as NeXTSTEP 3.3 draws it: no printed heading and no Edit Dock controls",
);

// The desk row is present whenever NeXTSTEP is active, whether or not the Dock
// is, and it carries its two sections in order: running, then windows.
const rowSections = () => vmw.run(
  '[...document.querySelectorAll(".nextstep-desk-row > [data-dock-region]")].map((node) => node.dataset.dockRegion)',
);
test.assert(
  JSON.stringify(rowSections()) === JSON.stringify(["running", "windows"]),
  "the desk row holds the running section then the window section, in that order",
);
test.assert(
  vmw.run(`[...document.querySelectorAll(".nextstep-desk-row > [data-dock-region]")].every((section) => {
    const label = section.getAttribute("aria-label") || "";
    return label.length > 0 && section.querySelector("h2, h3, .nextstep-dock-region-label") === null;
  })`),
  "each desk-row section is named only by its aria-label: a desk row carries icons, not headings",
);
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock > .nextstep-dock-tile").length') === 0,
  "no tile is a direct child of the Dock root; every tile lives in a section",
);

// One application, two windows. This is the case the old projection could not
// express: both windows belong to Finder, so an app-keyed bucket would leave
// one tile for two documents.
await vmw.context.setFinderEnvironment("multifinder", { persistStartup: false });
await vmw.context.openWindow("documents");
await vmw.context.openWindow("projects");
test.assert(
  vmw.run('["documents", "projects"].every((name) => !getWindow(name).classList.contains("is-hidden"))'),
  "both documents are really open, so a missing miniwindow below means missing and not a window that never opened",
);
for (const name of ["documents", "projects"]) {
  vmw.run(`getWindow(${JSON.stringify(name)}).classList.add("is-minimized")`);
}
vmw.run("window.AISystem6NextstepDock.sync()");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-desk-row-windows [data-miniwindow]").length === 2'));

const miniwindows = vmw.run(`[...document.querySelectorAll(".nextstep-desk-row-windows [data-miniwindow]")].map((tile) => ({
  window: tile.dataset.miniwindow,
  key: tile.dataset.dockKey,
  label: tile.getAttribute("aria-label"),
  caption: tile.querySelector(".nextstep-dock-tile-label")?.textContent || "",
}))`);

test.assert(
  miniwindows.length === 2 && new Set(miniwindows.map((tile) => tile.key)).size === 2,
  "two windows of one application are two miniwindows with two identities, not one shared document tile",
);
test.assert(
  miniwindows.every((tile) => tile.window === "documents" || tile.window === "projects"),
  "each miniwindow names the window it restores, so a document cannot be restored as its neighbour",
);
test.assert(
  miniwindows.every((tile) => tile.label.includes(tile.caption) && tile.caption.length > 0),
  "the accessible name and the printed caption agree on which window the tile holds",
);
test.assert(
  vmw.run(`document.querySelectorAll(".nextstep-desk-row [data-miniwindow]").length
      === document.querySelectorAll(".nextstep-desk-row-windows [data-miniwindow]").length
    && document.querySelectorAll(".nextstep-desk-row-windows [data-app-id]").length === 0`),
  "a miniwindow is listed in the window section only, and an application icon never browses in among the windows",
);
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock [data-miniwindow]").length') === 0,
  "the miniwindows are a desk object: none of them is drawn inside the Dock root",
);

// Restoring through the tile reaches that window and only that window.
vmw.run(`document.querySelector('.nextstep-desk-row-windows [data-miniwindow="projects"]').dispatchEvent(new Event("dblclick"))`);
await vmw.waitFor(() => vmw.run('!getWindow("projects").classList.contains("is-minimized")'));
test.assert(
  vmw.run('getWindow("projects").classList.contains("is-minimized")') === false
    && vmw.run('getWindow("documents").classList.contains("is-minimized")') === true,
  "restoring the miniwindow named for one window leaves its neighbour miniaturized",
);

// The bottom reserve: while the row has tiles the desk subtracts its height.
// The VM's getBoundingClientRect answers 0; a row holding tiles still reserves
// at least one 64px tile, a positive reserve, which is what is asserted here.
test.assert(
  vmw.run('document.body.classList.contains("desk-dock-shown")')
    && vmw.run('document.body.dataset.deskDockOwner') === "nextstep"
    && Number.parseFloat(vmw.run('document.body.style.getPropertyValue("--desk-dock-reserve")') || "0") > 0,
  "a row holding tiles sets desk-dock-shown, the nextstep owner and a positive --desk-dock-reserve",
);

// The appearance's own applications: a pinned application belongs to the Dock's
// fixed region, and one that is only running belongs to the row. The running
// registry is seeded here because the boot VM does not run the desk's own boot
// sequence, so which applications it happens to have launched is not this
// contract's subject; the projection of that registry is.
await vmw.context.openWindow("teachText");
vmw.run(`
  ensureRunningApp("teachText", "teachText");
  runningApps.set("reader", { id: "reader", label: multiFinderAppLabels.reader || "Reader",
    windows: new Set(["reader"]), lastWindowName: "reader" });
`);
vmw.run("window.AISystem6NextstepDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.nextstep-desk-row-apps [data-dock-key="app:reader"]\')'));
test.assert(
  vmw.run('document.querySelector(\'.nextstep-dock-fixed [data-dock-key="app:teachText"]\') !== null'),
  "an application the writer fixed to the Dock is drawn in the Dock's fixed region",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-desk-row-apps [data-dock-key="app:reader"]\')?.dataset.state') === "running",
  "an application that is only running is drawn in the desk row's running section, not among the fixed icons",
);
test.assert(
  vmw.run(`document.querySelector('.nextstep-dock-fixed [data-dock-key="app:reader"]') === null
    && document.querySelector('.nextstep-desk-row-apps [data-dock-key="app:teachText"]') === null
    && document.querySelector('.nextstep-dock-fixed [data-dock-key="app:teachText"]') !== null`),
  "a running application is in exactly one place: the Dock or the row, never both",
);

// Activating an application never restores its miniwindows: the window put
// away above stays put away after its application's own tile is used.
// Opening TeachText above ran the single-Finder rule, which closed Finder's
// windows; put the folder window back on the desk before putting it away, or
// the contract would miniaturize a window nobody can see.
vmw.run('getWindow("documents").classList.remove("is-hidden")');
vmw.run('getWindow("documents").classList.add("is-minimized")');
vmw.run('window.AISystem6NextstepDock.activate("finder")');
vmw.run("window.AISystem6NextstepDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.nextstep-desk-row-windows [data-miniwindow="documents"]\')'));
test.assert(
  vmw.run('getWindow("documents").classList.contains("is-minimized")'),
  "activating an application leaves its miniwindows minimized, the NeXTSTEP rule",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-desk-row-windows [data-miniwindow="documents"]\') !== null'),
  "and the miniwindow for the put-away window is still drawn in the desk row",
);

// ---- The shared Dock preference ---------------------------------------------
//
// Every Dock answers one preference. With it off the Dock root is gone, the
// body no longer claims nextstep-dock-shown, and the desk row and its
// miniwindows stay -- and a pinned running application joins the row, because
// with the Dock gone the row is the only place it can be reached.
vmw.run("window.AISystem6WindowMinimize.setDockVisible(false)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-dock").length === 0'));
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock").length') === 0,
  "with the Dock switched off the Dock root is not in the document at all",
);
test.assert(
  !vmw.run('document.body.classList.contains("nextstep-dock-shown")'),
  "and the body no longer carries nextstep-dock-shown, so the Classic icon column comes back",
);
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-desk-row [data-miniwindow]").length') >= 1,
  "the desk row and its miniwindows remain: with the Dock off nothing a writer put away is stranded",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-desk-row-apps [data-dock-key="app:teachText"]\') !== null'),
  "a pinned application that is running appears in the row while the Dock is off, so it stays reachable",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-desk-row-apps [data-dock-key="app:reader"]\') !== null'),
  "and a running unpinned application is still in the row",
);

vmw.run("window.AISystem6WindowMinimize.setDockVisible(true)");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-dock").length === 1'));
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock").length') === 1
    && vmw.run('document.body.classList.contains("nextstep-dock-shown")'),
  "switching the Dock back on brings the root back and re-adds nextstep-dock-shown",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-dock [data-dock-key="app:teachText"]\') !== null'),
  "the Dock's fixed icons are the pinned applications, as before",
);

// ---- Backward compatibility and storage failure -----------------------------
//
// The pins still live under the old key, read as-is -- but `pins` is read once
// when the module loads, so a fresh boot is what proves the key. This second VM
// seeds the old key before the NeXTSTEP dock module ever runs.
const compat = createAppBootVm();
compat.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
  localStorage.setItem("ai-system-6-nextstep-dock", JSON.stringify(["teachText"]));
`);
await compat.context.AISystem6Theme.applyTheme("nextstep", { persist: false });
await compat.waitFor(() => compat.run('!!window.AISystem6NextstepDock && !!document.querySelector(".nextstep-dock")'));
test.assert(
  compat.run('!document.querySelector(\'.nextstep-dock-fixed [data-dock-key="app:finder"]\')')
    && compat.run('document.querySelector(\'.nextstep-dock-fixed [data-dock-key="app:teachText"]\') !== null'),
  "the old key ai-system-6-nextstep-dock is honored: its pins are read as-is, with no finder the default list would have added",
);

// A storage that throws must leave the Dock visible by default, and must not
// throw out of the preference functions.
test.assert(
  vmw.run(`(() => {
    const realStorage = window.localStorage;
    const boom = () => { throw new Error("storage blocked"); };
    try {
      Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: boom, setItem: boom, removeItem: boom } });
      let visible;
      try { visible = window.AISystem6WindowMinimize.dockVisible(); } catch { return false; }
      let threw = false;
      try { window.AISystem6WindowMinimize.setDockVisible(false); } catch { threw = true; }
      return visible === true && threw === false;
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: realStorage });
    }
  })()`),
  "a localStorage that throws leaves the Dock visible by default and the preference functions never throw",
);

// NeXTSTEP is a multitasking system (owner, 2026-09-25): even in the desk's
// default single-Finder mode, launching another application under NeXTSTEP
// never closes the one before it or its miniwindows.
test.assert(
  vmw.run("isMultiFinderMode()") === false,
  "the fixture is in the default single-Finder mode",
);
test.assert(
  (await vmw.context.prepareFinderModeForApp("reader")) === true
    && vmw.run('getWindow("documents").classList.contains("is-minimized") && !getWindow("documents").classList.contains("is-hidden")'),
  "under NeXTSTEP a launch leaves the other application's windows and miniwindows on the desk",
);

vmw.run('window.AISystem6WindowMinimize.setDockVisible(true); window.AISystem6NextstepDock.sync()');
await vmw.waitFor(() => vmw.run('!!document.querySelector(".nextstep-dock-tile")'));
vmw.run(`(() => {
 const tile = document.querySelector('.nextstep-dock .nextstep-dock-tile');
 window.__pinBefore = localStorage.getItem('ai-system-6-nextstep-dock');
 window.__pinId = tile.dataset.appId;
 tile.dispatchEvent({type:'contextmenu', clientX:900, clientY:100, preventDefault(){}});
})()`);
test.assert(vmw.run('localStorage.getItem("ai-system-6-nextstep-dock") === window.__pinBefore'), "right click alone never changes pinned applications");
test.assert(vmw.run(`!!document.querySelector('.nextstep-dock-menu[role="menu"]')`), "right click opens an explicit pin menu");
test.assert(vmw.run('document.querySelector(".nextstep-dock-menu").style.display === "block"'), "standalone pin menu explicitly overrides the shared hidden popover default (style contract, not browser visibility)");
vmw.run(`document.querySelector('.nextstep-dock-menu[role="menu"] button').dispatchEvent(new Event('click'))`);
test.assert(vmw.run('!JSON.parse(localStorage.getItem("ai-system-6-nextstep-dock")).includes(window.__pinId)'), "choosing Remove changes the pin preference");

// The DOM shim has no input-modality engine: supply only :focus-visible,
// then dispatch the real focus handler into the real shared help implementation.
vmw.run(`(() => {
  balloonHelpEnabled = false;
  hideBalloonHelp();
  const icon = document.querySelector('.nextstep-dock-tile');
  window.__focusNameIcon = icon;
  const matches = icon.matches.bind(icon);
  icon.matches = (selector) => selector === ':focus-visible' || matches(selector);
  icon.focus();
  icon.dispatchEvent({type:'focus', target:icon});
})()`);
test.assert(vmw.run('!document.querySelector("#balloon-help").classList.contains("is-hidden") && document.querySelector("#balloon-help-text").textContent === window.__focusNameIcon.getAttribute("aria-label")'), "keyboard focus shows the application name through existing Balloon Help even when Help is off");
test.assert(vmw.run('balloonHelpEnabled === false'), "name fallback does not switch the global Help preference on");
vmw.run(`window.__focusNameIcon.dispatchEvent({type:'blur', target:window.__focusNameIcon})`);
test.assert(vmw.run('document.querySelector("#balloon-help").classList.contains("is-hidden") && !window.__focusNameIcon.hasAttribute("aria-describedby")'), "blur clears the shared name balloon and its accessible description");

test.finish();
