// Lion's title-bar arrows are real full screen (owner, 2026-09-25).
//
// For a year the appearance drew Lion's two outward arrows at the title bar's
// right end while the button zoomed: a control that said one thing and did
// another. This contract pins the real behaviour and the failures a writer
// would meet: the arrows still zooming; full screen that cannot be left, or
// leaves the window somewhere other than where it was; the Dock drawn over a
// full-screen window; Zoom lost (owner, 2026-11-01: Lion keeps its green Zoom
// lamp at the left and has a separate full-screen button at the right); and the behaviour leaking into an era whose button
// really is Zoom.

import { createAppBootVm } from "../helpers/app-boot-vm.mjs";
import { createFeatureTest, read } from "../helpers/feature-test-harness.mjs";

const test = createFeatureTest("window-fullscreen");
const vmw = createAppBootVm();
vmw.run(`
  if (typeof document.createComment !== "function") {
    document.createComment = (text) => Object.assign(document.createElement("#comment"), { textContent: text });
  }
  if (typeof queueMicrotask !== "function") queueMicrotask = (fn) => Promise.resolve().then(fn);
`);

await vmw.context.AISystem6Theme.applyTheme("lion", { persist: false, experimental: true });
await vmw.context.AISystem6Theme.whenReady();
await vmw.waitFor(() => vmw.run("!!window.AISystem6WindowFullscreenLoaded"));

// TeachText is a document window a writer stays in, so it adopts full screen.
await vmw.context.openWindow("teachText");
// The boot VM's markup lacks the Zoom control the browser's chrome gives a
// resizable window; give TeachText one, as the browser does, before syncing.
vmw.run(`(() => {
  const bar = getWindow("teachText").querySelector(":scope > .title-bar");
  if (!bar.querySelector(":scope > .resize-box")) bar.append(Object.assign(document.createElement("button"), { className: "resize-box" }));
  window.AISystem6WindowFullscreen.syncAll();
})()`);
vmw.run(`(() => {
  const win = getWindow("teachText");
  win.style.left = "120px"; win.style.top = "80px"; win.style.width = "480px";
  focusWindow(win);
})()`);
const frameOf = () => vmw.run('JSON.stringify(["left", "top", "width"].map((name) => getWindow("teachText").style.getPropertyValue(name)))');
const before = frameOf();

test.assert(
  vmw.run('getWindow("teachText").querySelector(":scope > .title-bar > .resize-box") !== null && getWindow("teachText").querySelector(":scope > .title-bar > .fullscreen-button") !== null'),
  "Lion's windows carry the green Zoom lamp (resize-box) and, separately, the full-screen button",
);

// Only windows a writer stays in adopt full screen (Lion drew the button only
// there; the HIG names Calculator and the Finder as windows that should not).
await vmw.context.openWindow("control");
test.assert(
  vmw.run('getWindow("control").querySelector(":scope > .title-bar > .fullscreen-button") === null && window.AISystem6WindowFullscreen.enter(getWindow("control")) === false'),
  "a desk accessory (Control Panel) draws no full-screen button and is refused full screen",
);
vmw.run('focusWindow(getWindow("teachText"))');

// The arrows enter full screen instead of zooming.
// The boot VM does not run document capture listeners, so the contract uses
// the module's own toggle, the function the arrows' click calls; the click
// path itself is checked in the browser.
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("teachText"))');
test.assert(vmw.run('getWindow("teachText").classList.contains("is-fullscreen")'), "the arrows put the window into full screen");
test.assert(
  vmw.run('getWindow("teachText").style.left === "0px" && getWindow("teachText").style.top === "0px" && getWindow("teachText").style.width === "100vw"'),
  "and it fills the display",
);
test.assert(vmw.run('document.body.classList.contains("window-fullscreen-active")'), "the desk knows a window is full screen");
vmw.run("window.AISystem6DeskDock?.sync?.()");
await vmw.waitFor(() => vmw.run('document.querySelectorAll(".desk-dock").length === 0'));
test.assert(vmw.run('document.querySelectorAll(".desk-dock").length === 0'), "the Dock steps aside for a full-screen window");

// The same button brings it back where it was.
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("teachText"))');
test.assert(!vmw.run('getWindow("teachText").classList.contains("is-fullscreen")'), "pressing the arrows again leaves full screen");
test.assert(frameOf() === before, "and the window returns to the frame it had");
test.assert(!vmw.run('document.body.classList.contains("window-fullscreen-active")'), "the desk is no longer in full screen");

// The desk sits under the menu bar, so a frame of top 0 inside it hung the
// window 22px below the display and clipped its bottom row (2026-10-08).
// Full screen measures against the display: the top compensates the desk's
// own offset, and Exit still restores the frame.
vmw.run('Object.defineProperty(getWindow("teachText"), "offsetParent", { configurable: true, value: { getBoundingClientRect: () => ({ top: 22 }) } })');
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
test.assert(
  vmw.run('getWindow("teachText").style.top === "-22px" && getWindow("teachText").style.height === "100dvh"'),
  "a desk offset under the menu bar is compensated, so the window's bottom stays on the display",
);
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("teachText"))');
vmw.run('delete getWindow("teachText").offsetParent');
test.assert(frameOf() === before, "and Exit still restores the original frame after a compensated full screen");

// --- WM0: the pre-full-screen frame is a read-only projection ---------------
// Full screen is a view, not a saved state, so the Working Session must read
// the frame the window had before it, never the 100vw view it shows now.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
test.assert(
  vmw.run(`(() => {
    const f = window.AISystem6WindowFullscreen.frameForPersistence(getWindow("teachText"));
    return !!f && f.left === "120px" && f.top === "80px" && f.width === "480px" && !("z-index" in f);
  })()`),
  "frameForPersistence projects the pre-full-screen frame without z-index",
);
// Re-entering the same window must not overwrite the first baseline, or a
// double Enter would save the 100vw view as the frame to come back to.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("teachText"))');
test.assert(frameOf() === before, "a repeated Enter keeps the first baseline, so Exit restores the original frame");
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.frameForPersistence(getWindow("teachText")) === null'),
  "a floating window has no persistence projection",
);

// --- hardening: one owner, held by identity ---------------------------------
await vmw.context.openWindow("calculator");
await vmw.waitFor(() => vmw.run('!!getWindow("calculator")'));
const bystander = () => vmw.run('JSON.stringify(["left", "top", "width"].map((name) => getWindow("calculator").style.getPropertyValue(name)))');
const bystanderFrame = bystander();
// Exiting a window this module never entered must be a no-op, not a wipe of
// that window's inline frame.
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("calculator"))');
test.assert(
  bystander() === bystanderFrame && !vmw.run('getWindow("calculator").classList.contains("is-fullscreen")'),
  "exiting a window the module never entered is a no-op, not a frame wipe",
);
// A stale is-fullscreen class is not ownership either: the default exit() only
// leaves the window the module actually entered.
vmw.run('getWindow("calculator").classList.add("is-fullscreen")');
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.exit() === false'),
  "a stale full-screen class is not an owner, so the default exit leaves nothing",
);
vmw.run('getWindow("calculator").classList.remove("is-fullscreen")');
// A put-away window is refused: a full-screen layer over a minimized window
// would keep covering the desk after it is gone from view.
vmw.run('getWindow("calculator").classList.add("is-minimized")');
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("calculator")) === false'),
  "a minimized window is refused full screen",
);
vmw.run('getWindow("calculator").classList.remove("is-minimized")');
// The layer a window had before full screen is projected separately from the
// geometry, so a refresh never saves the priority-band token as its own layer.
// (The VM's style stub does not round-trip an inline z-index, so this pins the
// refusal: whatever it projects, it is never the full-screen band token.)
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
test.assert(
  vmw.run(`(() => {
    const layer = window.AISystem6WindowFullscreen.layerForPersistence(getWindow("teachText"));
    return layer === null || (typeof layer === "string" && !layer.includes("var("));
  })()`),
  "layerForPersistence never projects the full-screen priority-band token",
);
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.layerForPersistence(getWindow("calculator")) === null'),
  "a floating window has no layer projection",
);
test.assert(
  vmw.run('window.AISystem6WindowFullscreen.exit() === true'),
  "the default exit leaves the window the module actually entered",
);

// Escape leaves it too, unless the writer is typing.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
vmw.run('document.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true }), { key: "Escape" }))');
test.assert(!vmw.run('getWindow("teachText").classList.contains("is-fullscreen")'), "Escape outside a text field leaves full screen");

// The green lamp stays Zoom in Lion: the full-screen click handler claims only
// the separate button there, so the lamp's own Zoom listener runs.
test.assert(
  vmw.run('typeof zoomWindow === "function"') && read("app/core/window-fullscreen.js").includes("getCurrentTheme?.() !== LION_THEME"),
  "the green lamp is Zoom in Lion; only the later eras route it to full screen",
);

// An era whose button is Zoom keeps it Zoom.
await vmw.context.AISystem6Theme.applyTheme("snow-leopard", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
vmw.run('window.AISystem6WindowFullscreen.toggle(getWindow("teachText"))');
test.assert(!vmw.run('getWindow("teachText").classList.contains("is-fullscreen")'), "in Snow Leopard the module refuses full screen: its green button is Zoom");
test.assert(
  vmw.run('getWindow("teachText").querySelector(":scope > .title-bar > .fullscreen-button") === null'),
  "and Snow Leopard draws no full-screen button",
);

// Yosemite, Big Sur and Liquid Glass have no button of their own: the green
// lamp at the left is full screen, and Option-click on it is Zoom.
for (const theme of ["yosemite", "big-sur", "liquid-glass"]) {
  await vmw.context.AISystem6Theme.applyTheme(theme, { persist: false });
  await vmw.context.AISystem6Theme.whenReady();
  test.assert(
    vmw.run('getWindow("teachText").querySelector(":scope > .title-bar > .fullscreen-button") === null'),
    `${theme} adds no separate full-screen button`,
  );
  test.assert(
    vmw.run('getWindow("teachText").querySelector(":scope > .title-bar > .resize-box") !== null'),
    `${theme} keeps its green lamp`,
  );
}

// The button belongs to Lion's anatomy, so returning to Lion puts it back.
await vmw.context.AISystem6Theme.applyTheme("lion", { persist: false });
await vmw.context.AISystem6Theme.whenReady();
test.assert(
  vmw.run('getWindow("teachText").querySelector(":scope > .title-bar > .fullscreen-button") !== null'),
  "returning to Lion restores the full-screen button",
);

// --- the menu bar hides in full screen, and the top edge brings it back -----
// 10.7 hides the bar with the window's own title bar and slides it back over
// the full-screen window while the pointer is at the top edge (macOS). The
// failure this pins: the bar could not be summoned at all, because the hot
// zone was a 4px strip with no stacking rung of its own -- a pointer aimed at
// where the bar appears hit nothing, and dipping below the strip during the
// slide hid the bar again mid-flight.
vmw.run('window.AISystem6WindowFullscreen.enter(getWindow("teachText"))');
test.assert(vmw.run('document.body.classList.contains("window-fullscreen-active")'), "full screen takes the menu bar off the desk");
test.assert(
  vmw.run('document.querySelectorAll(".fullscreen-reveal").length === 1'),
  "one top-edge hot zone exists while a window is full screen (the bar is a single global object)",
);
// Pointer into the band reveals the bar over the full-screen window.
vmw.run('document.querySelector(".fullscreen-reveal").dispatchEvent(new Event("pointerenter"))');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer at the top edge reveals the menu bar",
);
// A document pointerover names its target by hand: the VM's Event, like the
// browser's, owns a getter-only target a plain Object.assign cannot write.
const pointerOver = (targetScript) => vmw.run(`(() => {
  const event = new Event("pointerover", { bubbles: true });
  Object.defineProperty(event, "target", { value: ${targetScript} });
  document.dispatchEvent(event);
})()`);
// Resting inside the zone's band under the bar keeps it: leaving must mean
// leaving the bar AND the band.
pointerOver('document.querySelector(".fullscreen-reveal")');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer resting in the band under the revealed bar does not dismiss it",
);
// So does the bar itself and an open menu popover.
pointerOver('document.querySelector(".menu-bar .apple")');
test.assert(
  vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "the pointer over the revealed bar keeps it revealed",
);
// Moving onto the full-screen window's content hides it again.
pointerOver('getWindow("teachText")');
test.assert(
  !vmw.run('document.body.classList.contains("fullscreen-menu-revealed")'),
  "leaving the bar for the window hides it again",
);
// Leaving full screen returns the resident bar: no zone, no reveal state.
vmw.run('window.AISystem6WindowFullscreen.exit(getWindow("teachText"))');
test.assert(
  vmw.run('document.querySelectorAll(".fullscreen-reveal").length === 0 && !document.body.classList.contains("window-fullscreen-active") && !document.body.classList.contains("fullscreen-menu-revealed")'),
  "exiting full screen removes the zone and restores the resident menu bar",
);

// The zone's stacking and geometry are the fix's other half, and they live in
// the sheets: a rung above every window and the Control Strip, under the bar
// it summons, and a band as tall as the bar plus a 4px trigger strip.
const foundation = read("styles/00-foundation.css");
const deskDock = read("styles/88-desk-dock.css");
const zValue = (token) => Number((foundation.match(new RegExp(`--${token}:\\s*(\\d+)`)) || [])[1]);
test.assert(
  zValue("z-fullscreen-reveal") > zValue("z-window-priority")
    && zValue("z-fullscreen-reveal") > zValue("z-control-strip")
    && zValue("z-fullscreen-reveal") < zValue("z-system-menu"),
  "the hot zone stacks above a full-screen window and the strip, under the menu bar it reveals",
);
test.assert(
  deskDock.includes("height: calc(var(--menu-bar-height) + 4px)"),
  "the hot band is the menu bar's own height plus a 4px trigger strip, as macOS's top-edge zone is",
);
test.assert(
  deskDock.includes("z-index: var(--z-fullscreen-reveal)"),
  "the hot zone claims its stacking rung by token",
);
test.assert(
  deskDock.includes("body.window-fullscreen-active .menu-bar") && deskDock.includes("fullscreen-menu-revealed .menu-bar"),
  "full screen hides the bar by transform and the reveal state brings it back, overlaying the window",
);
// The phone's own full-screen shell is a different mechanism: its classes and
// sheets never meet the desktop reveal (is-mobile-fullscreen stays as it was).
const responsive = read("styles/60-responsive.css");
test.assert(
  !responsive.includes("fullscreen-reveal") && !responsive.includes("fullscreen-menu-revealed"),
  "the mobile full-screen shell keeps its own rules, untouched by the desktop reveal",
);

// Lion's full screen keeps no title bar even with the menu bar pulled down
// (HIG: "A full-screen window never shows its title bar"); its exit control is
// the blue menu-bar button, and the space behind the slide is the linen. Both
// pieces of art are crops of 10.7 captures, not drawings.
const lionSheet = read("styles/67-lion-appearance.css");
test.assert(
  lionSheet.includes("--fullscreen-titlebar-reveal: -100%")
    && lionSheet.includes("themes/lion/fullscreen-exit.png")
    && lionSheet.includes("themes/lion/fullscreen-linen.png"),
  "Lion hides the title bar under the revealed menu bar, and owns the exit button and the linen",
);

test.finish();
