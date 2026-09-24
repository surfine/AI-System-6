// The 3.3 Dock holds three classes of object and they are not interchangeable:
// the fixed application icons, the icons of applications that are merely
// running, and one miniwindow for each window. The dock's projection used to
// append all three into one flat list of tiles separated by `<hr>`, so an
// application icon and a window's miniwindow differed only in where they sat in
// that list -- and a second document of one application was indistinguishable
// from the first.
//
// This contract runs the real boot and the real dock module (the same
// `sync()` the desk calls) and pins two things a source search cannot:
//
//   1. the three regions exist as separate regions inside the one root, in the
//      3.3 order, and nothing hangs tiles off the root directly -- the shape a
//      single `replaceChildren(...tiles)` cannot produce; and
//   2. a miniwindow names its own window: two windows of one application are
//      two tiles with two identities, and restoring one leaves the other
//      miniaturized.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("nextstep-dock-regions");
const vmw = createAppBootVm();

// An empty region must not paint a stray labelled band: the region keeps its
// place in the structure and the stylesheet takes it out of the picture.
test.assertMatches(
  read("styles/nextstep-shell.css"),
  /\.nextstep-dock-region\[hidden\] \{\s*display: none;/,
  "a region with no objects is hidden by the stylesheet that owns the dock layout",
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

const regionIds = () => vmw.run(
  '[...document.querySelectorAll(".nextstep-dock > .nextstep-dock-region")].map((node) => node.dataset.dockRegion)',
);

test.assert(
  JSON.stringify(regionIds()) === JSON.stringify(["fixed", "running", "windows"]),
  "the Dock root holds the three regions in the 3.3 order: fixed, running, windows",
);
test.assert(
  vmw.run('document.querySelectorAll(".nextstep-dock > .nextstep-dock-tile").length') === 0
    && vmw.run('document.querySelectorAll(".nextstep-dock-region > .nextstep-dock-tile").length')
      === vmw.run('document.querySelectorAll(".nextstep-dock .nextstep-dock-tile").length'),
  "every tile lives inside a region; none is a child of the root, which is what one flat list would produce",
);
test.assert(
  vmw.run(`[...document.querySelectorAll(".nextstep-dock-region")].every((region) => {
    const label = region.querySelector(":scope > .nextstep-dock-region-label");
    return Boolean(label) && region.getAttribute("aria-label") === label.textContent;
  })`),
  "every region carries a visible label that is also its accessible name, so a narrow column still reads as three things",
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
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".nextstep-dock-windows [data-miniwindow]").length === 2'));

const miniwindows = vmw.run(`[...document.querySelectorAll(".nextstep-dock-windows [data-miniwindow]")].map((tile) => ({
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
  vmw.run(`document.querySelectorAll(".nextstep-dock [data-miniwindow]").length
      === document.querySelectorAll(".nextstep-dock-windows [data-miniwindow]").length
    && document.querySelectorAll(".nextstep-dock-windows [data-app-id]").length === 0`),
  "a miniwindow is listed in the window region only, and an application icon never browses in among the windows",
);

// Restoring through the tile reaches that window and only that window.
vmw.run(`document.querySelector('.nextstep-dock-windows [data-miniwindow="projects"]').dispatchEvent(new Event("dblclick"))`);
await vmw.waitFor(() => vmw.run('!getWindow("projects").classList.contains("is-minimized")'));
test.assert(
  vmw.run('getWindow("projects").classList.contains("is-minimized")') === false
    && vmw.run('getWindow("documents").classList.contains("is-minimized")') === true,
  "restoring the miniwindow named for one window leaves its neighbour miniaturized",
);

// The appearance's own applications: a pinned application belongs to the fixed
// region, and one that is only running belongs to the running region. The
// running registry is seeded here because the boot VM does not run the desk's
// own boot sequence, so which applications it happens to have launched is not
// this contract's subject; the projection of that registry is.
await vmw.context.openWindow("teachText");
vmw.run(`
  runningApps.set("reader", { id: "reader", label: multiFinderAppLabels.reader || "Reader",
    windows: new Set(["reader"]), lastWindowName: "reader" });
`);
vmw.run("window.AISystem6NextstepDock.sync()");
await vmw.waitFor(() => vmw.run('!!document.querySelector(\'.nextstep-dock-running [data-dock-key="app:reader"]\')'));
test.assert(
  vmw.run('document.querySelector(\'.nextstep-dock-fixed [data-dock-key="app:teachText"]\') !== null'),
  "an application the writer fixed to the Dock is drawn in the fixed region",
);
test.assert(
  vmw.run('document.querySelector(\'.nextstep-dock-running [data-dock-key="app:reader"]\')?.dataset.state') === "running",
  "an application that is only running is drawn in the running region, not among the fixed icons",
);
test.assert(
  vmw.run(`document.querySelector('.nextstep-dock-fixed [data-dock-key="app:reader"]') === null
    && document.querySelector('.nextstep-dock-running [data-dock-key="app:teachText"]') === null`),
  "the two application regions do not both hold the same application",
);

test.finish();
